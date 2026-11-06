import { randomUUID } from "node:crypto";
import type {
  AssistantCitation,
  AssistantConversationKind,
  AssistantJobExecution,
  AssistantMessageStorage,
} from "@/lib/assistant-contracts";
import { type AssistantDatabase, createAssistantStorage } from "@/lib/assistant-storage";
import { initializeDB } from "@/lib/db";
import { generatePiAnswer } from "./pi-answer";

const DEFAULT_LEASE_MS = 45_000;
const DEFAULT_PUMP_DELAY_MS = 25;
const DEFAULT_EXPIRY_SWEEP_MS = 60_000;
const SAFE_GENERATION_ERROR_CODES = new Set([
  "assistant-clipping-context-unavailable",
  "assistant-provider-empty-output",
  "assistant-provider-output-too-large",
  "assistant-provider-unconfigured",
  "invalid-job",
  "worker-lease-expired",
  "worker-restarted",
]);

export type AssistantCitationInput = Omit<AssistantCitation, "id" | "messageId" | "createdAt">;

export type AssistantAnswerResult = {
  content: string;
  citations: AssistantCitationInput[];
};

export type AssistantAnswerGenerator = (input: {
  execution: AssistantJobExecution;
  isAdmin: boolean;
  signal: AbortSignal;
  onDelta: (content: string) => Promise<boolean>;
}) => Promise<AssistantAnswerResult>;

export type AssistantAnswerContext = {
  systemPrompt: string;
  evidence: string;
  citations?: AssistantCitationInput[];
};

export type AssistantContextProvider = (
  execution: AssistantJobExecution,
  signal: AbortSignal
) => Promise<AssistantAnswerContext>;

export type AssistantRuntimeOptions = {
  storage?: AssistantMessageStorage;
  database?: AssistantDatabase;
  leaseMs?: number;
  pumpDelayMs?: number;
  expirySweepMs?: number;
  generate?: AssistantAnswerGenerator;
  now?: () => number;
};

const assistantRuntimeStateKey = Symbol.for("blog26.assistant.runtime");
type SharedAssistantRuntimeState = {
  contextProviders: Map<AssistantConversationKind, AssistantContextProvider>;
  runtime: AssistantRuntime | null;
};
const shared = globalThis as typeof globalThis & {
  [assistantRuntimeStateKey]?: SharedAssistantRuntimeState;
};
const assistantRuntimeState = shared[assistantRuntimeStateKey] ?? {
  contextProviders: new Map<AssistantConversationKind, AssistantContextProvider>(),
  runtime: null,
};
shared[assistantRuntimeStateKey] = assistantRuntimeState;
const contextProviders = assistantRuntimeState.contextProviders;

export class AssistantRuntimeClosedError extends Error {
  constructor() {
    super("Assistant runtime is stopping");
    this.name = "AssistantRuntimeClosedError";
  }
}

export function registerAssistantContextProvider(
  kind: AssistantConversationKind,
  provider: AssistantContextProvider
) {
  contextProviders.set(kind, provider);
  return () => {
    if (contextProviders.get(kind) === provider) contextProviders.delete(kind);
  };
}

export { buildAssistantRetrievalContext } from "./context";

function isAssistantSchemaUnavailable(error: unknown) {
  return (
    error instanceof Error &&
    /no such table:\s*assistant_(?:conversations|generation_jobs|messages|message_citations)/iu.test(
      error.message
    )
  );
}

async function defaultGenerateAssistantAnswer(
  input: Parameters<AssistantAnswerGenerator>[0]
): Promise<AssistantAnswerResult> {
  const provider = contextProviders.get(input.execution.conversation.kind);
  if (input.execution.conversation.kind === "clipping" && !provider)
    throw new Error("assistant-clipping-context-unavailable");
  const suppliedContext = provider ? await provider(input.execution, input.signal) : null;
  return generatePiAnswer(input, suppliedContext);
}

export class AssistantRuntime {
  private readonly storage: AssistantMessageStorage;
  private readonly usesGlobalStorage: boolean;
  private readonly leaseMs: number;
  private readonly pumpDelayMs: number;
  private readonly expirySweepMs: number;
  private readonly generate: AssistantAnswerGenerator;
  private readonly now: () => number;
  private started = false;
  private stopped = false;
  private pumping = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerDueAt: number | null = null;
  private pumpTask: Promise<void> | null = null;
  private readonly controllers = new Map<string, AbortController>();
  private readonly processing = new Set<Promise<void>>();
  private acceptingSubmissions = true;
  private activeSubmissions = 0;
  private submissionDrain: Promise<void> | null = null;
  private resolveSubmissionDrain: (() => void) | null = null;

  constructor(options: AssistantRuntimeOptions = {}) {
    this.storage = options.storage ?? createAssistantStorage(options.database);
    this.usesGlobalStorage = !options.storage && !options.database;
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.pumpDelayMs = options.pumpDelayMs ?? DEFAULT_PUMP_DELAY_MS;
    this.expirySweepMs = options.expirySweepMs ?? DEFAULT_EXPIRY_SWEEP_MS;
    this.generate = options.generate ?? defaultGenerateAssistantAnswer;
    this.now = options.now ?? (() => Date.now());
  }

  async start() {
    this.assertAccepting();
    if (this.started && !this.stopped) return;
    this.started = true;
    this.stopped = false;
    if (this.usesGlobalStorage) await initializeDB().catch(() => undefined);
    await this.expireConversations();
    await this.recoverRunningGenerations();
    this.schedule(0);
  }

  assertAccepting() {
    if (!this.acceptingSubmissions) throw new AssistantRuntimeClosedError();
  }

  beginSubmission() {
    this.assertAccepting();
    this.activeSubmissions += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeSubmissions -= 1;
      if (this.activeSubmissions === 0) {
        this.resolveSubmissionDrain?.();
        this.resolveSubmissionDrain = null;
        this.submissionDrain = null;
      }
    };
  }

  enqueue() {
    if (!this.started || this.stopped) return;
    this.schedule(this.pumpDelayMs, true);
  }

  async stop() {
    this.acceptingSubmissions = false;
    this.stopped = true;
    if (this.activeSubmissions > 0) {
      this.submissionDrain ??= new Promise<void>((resolve) => {
        this.resolveSubmissionDrain = resolve;
      });
      await this.submissionDrain;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.timerDueAt = null;
    for (const controller of this.controllers.values()) controller.abort();
    await this.recoverRunningGenerations();
    const pumpTask = this.pumpTask;
    if (pumpTask) await pumpTask;
    await Promise.allSettled([...this.processing]);
  }

  cancelGeneration(generationJobId: string) {
    this.controllers
      .get(generationJobId)
      ?.abort(new DOMException("Generation cancelled", "AbortError"));
  }

  private schedule(delayMs: number, preferEarlier = false) {
    if (this.stopped) return;
    const dueAt = Date.now() + delayMs;
    if (this.timer) {
      if (!preferEarlier || (this.timerDueAt !== null && this.timerDueAt <= dueAt)) return;
      clearTimeout(this.timer);
    }
    this.timerDueAt = dueAt;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.timerDueAt = null;
      const task = this.pump().catch(() => undefined);
      this.pumpTask = task;
      void task.then(() => {
        if (this.pumpTask === task) this.pumpTask = null;
      });
    }, delayMs);
  }

  private async pump() {
    if (this.pumping || this.stopped) return;
    this.pumping = true;
    try {
      while (!this.stopped) {
        await this.expireConversations();
        await this.recoverExpiredGenerations();
        const execution = await this.storage.claimNextGenerationJob(this.now(), this.leaseMs);
        if (!execution) break;
        if (this.stopped) {
          await this.recoverRunningGenerations();
          break;
        }
        const task = this.process(execution);
        this.processing.add(task);
        try {
          await task;
        } finally {
          this.processing.delete(task);
        }
      }
    } finally {
      this.pumping = false;
      if (!this.stopped) this.schedule(this.expirySweepMs);
    }
  }

  private async recoverRunningGenerations() {
    try {
      return await this.storage.recoverRunningGenerations(this.now());
    } catch (error) {
      if (isAssistantSchemaUnavailable(error)) return 0;
      throw error;
    }
  }

  private async recoverExpiredGenerations() {
    try {
      return await this.storage.recoverExpiredGenerations(this.now());
    } catch (error) {
      if (isAssistantSchemaUnavailable(error)) return 0;
      throw error;
    }
  }

  private async expireConversations() {
    try {
      return await this.storage.expireConversations(this.now());
    } catch (error) {
      if (isAssistantSchemaUnavailable(error)) return 0;
      throw error;
    }
  }

  private async process(execution: AssistantJobExecution) {
    const controller = new AbortController();
    const jobId = execution.job.id;
    this.controllers.set(jobId, controller);
    const renewTimer = setInterval(
      () => {
        void this.storage
          .renewGenerationLease(jobId, execution.job.attempt, this.now(), this.leaseMs)
          .catch(() => undefined);
      },
      Math.max(1000, Math.floor(this.leaseMs / 2))
    );
    let content = execution.assistantMessage.content;
    try {
      const result = await this.generate({
        execution,
        isAdmin: await this.storage.getFrontendUserIsAdmin(execution.conversation.frontendUserId),
        signal: controller.signal,
        onDelta: async (nextContent) => {
          content = nextContent;
          return this.storage.appendGenerationDelta(
            jobId,
            execution.job.attempt,
            nextContent,
            this.now()
          );
        },
      });
      content = result.content;
      await this.storage.finishGeneration(jobId, execution.job.attempt, {
        status: "completed",
        content,
        citations: result.citations,
        now: this.now(),
      });
    } catch (error) {
      const cancelled =
        controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      try {
        await this.storage.finishGeneration(jobId, execution.job.attempt, {
          status: cancelled ? "cancelled" : "failed",
          content,
          errorCode: cancelled ? "cancelled" : errorCode(error),
          now: this.now(),
        });
      } catch {
        await this.recoverRunningGenerations().catch(() => undefined);
      }
    } finally {
      clearInterval(renewTimer);
      this.controllers.delete(jobId);
    }
  }
}

function errorCode(error: unknown) {
  if (error instanceof Error && SAFE_GENERATION_ERROR_CODES.has(error.message))
    return error.message;
  return "generation-failed";
}

export function getAssistantRuntime() {
  assistantRuntimeState.runtime ??= new AssistantRuntime();
  return assistantRuntimeState.runtime;
}

export async function startAssistantRuntime() {
  const runtime = getAssistantRuntime();
  await runtime.start();
  return runtime;
}

export async function stopAssistantRuntime() {
  if (!assistantRuntimeState.runtime) return;
  await assistantRuntimeState.runtime.stop();
}

export function createAssistantRuntimeForTest(options: AssistantRuntimeOptions) {
  return new AssistantRuntime(options);
}

export function assistantRequestId() {
  return randomUUID();
}
