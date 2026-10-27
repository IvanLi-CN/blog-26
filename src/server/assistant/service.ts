import { AiQuotaExceededError, getAssistantQuotaSnapshot } from "@/lib/ai-usage";
import type {
  AssistantConversation,
  AssistantGenerationJob,
  AssistantMessage,
  AssistantMessageStorage,
  AssistantTurnSubmission,
  FrontendPrincipal,
  SubmitAssistantTurnInput,
} from "@/lib/assistant-contracts";
import { AssistantStorageError, createAssistantStorage } from "@/lib/assistant-storage";
import { initializeDB } from "@/lib/db";
import { type AssistantRuntime, getAssistantRuntime, startAssistantRuntime } from "./runtime";

export class AssistantServiceError extends Error {
  constructor(
    readonly code: "not-found" | "gone" | "conflict" | "quota",
    message: string
  ) {
    super(message);
    this.name = "AssistantServiceError";
  }
}

export type AssistantSnapshot = {
  conversation: AssistantConversation;
  messages: AssistantMessage[];
  generationJobs: AssistantGenerationJob[];
  activeGenerationJob: AssistantGenerationJob | null;
  eventSequence: number;
};

export type AssistantQuotaResponse = Awaited<ReturnType<typeof getAssistantQuotaSnapshot>> & {
  activeConversationCount: number;
  unlimited: boolean;
  tokenHourlyRemaining: number | null;
  tokenWeeklyRemaining: number | null;
  questionHourlyRemaining: number | null;
  questionWeeklyRemaining: number | null;
};

function translateStorageError(error: unknown): never {
  if (error instanceof AssistantStorageError) {
    throw new AssistantServiceError(error.code, error.message);
  }
  if (error instanceof AiQuotaExceededError) {
    throw new AssistantServiceError("quota", error.message);
  }
  throw error;
}

function activeJob(jobs: AssistantGenerationJob[]) {
  return jobs.find((job) => job.status === "queued" || job.status === "running") ?? null;
}

export class AssistantService {
  readonly storage: AssistantMessageStorage;
  readonly runtime: AssistantRuntime;

  constructor(options: { storage?: AssistantMessageStorage; runtime?: AssistantRuntime } = {}) {
    this.storage = options.storage ?? createAssistantStorage();
    this.runtime = options.runtime ?? getAssistantRuntime();
  }

  async submit(
    principal: FrontendPrincipal,
    input: Omit<SubmitAssistantTurnInput, "frontendUserId" | "isAdmin">
  ) {
    let submission: AssistantTurnSubmission | null;
    const findExisting = async () => {
      try {
        return await this.storage.findIdempotentTurn(
          principal.id,
          input.requestId,
          input.clientRequestId,
          input.conversationId,
          Date.now(),
          {
            kind: input.kind,
            clippingMemoId: input.clippingMemoId,
            clippingVersionId: input.clippingVersionId,
          }
        );
      } catch (error) {
        translateStorageError(error);
      }
    };
    submission = await findExisting();
    if (!submission && !principal.isAdmin) {
      const quota = await getAssistantQuotaSnapshot(principal.id);
      const exhausted =
        quota.tokenHour >= quota.policy.tokenHourlyLimit ||
        quota.tokenWeek >= quota.policy.tokenWeeklyLimit ||
        quota.questionHour >= quota.policy.questionHourlyLimit ||
        quota.questionWeek >= quota.policy.questionWeeklyLimit;
      if (exhausted) {
        submission = await findExisting();
        if (!submission) throw new AssistantServiceError("quota", "Assistant quota exceeded");
      }
    }
    if (!submission) {
      try {
        submission = await this.storage.submitTurn({
          ...input,
          frontendUserId: principal.id,
          isAdmin: principal.isAdmin,
        });
      } catch (error) {
        translateStorageError(error);
      }
    }
    await this.runtime.start();
    this.runtime.enqueue();
    return {
      status: "queued" as const,
      conversationId: submission.conversation.id,
      turnId: submission.generationJob.id,
      requestId: submission.generationJob.requestId,
      userMessageId: submission.userMessage.id,
      assistantMessageId: submission.assistantMessage.id,
      createdConversation: submission.createdConversation,
    };
  }

  async list(principal: FrontendPrincipal) {
    const conversations = await this.storage.listConversations(principal.id);
    return { conversations, quota: await this.quota(principal) };
  }

  async quota(principal: FrontendPrincipal): Promise<AssistantQuotaResponse> {
    await initializeDB();
    const snapshot = await getAssistantQuotaSnapshot(principal.id);
    const conversations = await this.storage.listConversations(principal.id);
    const unlimited = principal.isAdmin;
    return {
      ...snapshot,
      activeConversationCount: conversations.filter(
        (conversation) =>
          conversation.status === "active" &&
          (conversation.expiresAt === null || conversation.expiresAt > Date.now())
      ).length,
      unlimited,
      tokenHourlyRemaining: unlimited
        ? null
        : Math.max(0, snapshot.policy.tokenHourlyLimit - snapshot.tokenHour),
      tokenWeeklyRemaining: unlimited
        ? null
        : Math.max(0, snapshot.policy.tokenWeeklyLimit - snapshot.tokenWeek),
      questionHourlyRemaining: unlimited
        ? null
        : Math.max(0, snapshot.policy.questionHourlyLimit - snapshot.questionHour),
      questionWeeklyRemaining: unlimited
        ? null
        : Math.max(0, snapshot.policy.questionWeeklyLimit - snapshot.questionWeek),
    };
  }

  async snapshot(principal: FrontendPrincipal, conversationId: string): Promise<AssistantSnapshot> {
    const conversation = await this.storage.getConversationState(conversationId, principal.id);
    if (!conversation)
      throw new AssistantServiceError("not-found", "Assistant conversation not found");
    if (
      conversation.status !== "active" ||
      (conversation.expiresAt !== null && conversation.expiresAt <= Date.now())
    ) {
      const jobs =
        conversation.status === "active"
          ? await this.storage.listGenerationJobs(conversationId, principal.id)
          : null;
      if (conversation.status === "active") {
        await this.storage.expireConversation(conversationId, principal.id, Date.now());
        for (const job of jobs ?? [])
          if (job.status === "queued" || job.status === "running")
            this.runtime.cancelGeneration(job.id);
      }
      throw new AssistantServiceError("gone", "Assistant conversation has expired or been deleted");
    }
    const messages =
      (await this.storage.getConversationMessages(conversationId, principal.id)) ?? [];
    const generationJobs =
      (await this.storage.listGenerationJobs(conversationId, principal.id)) ?? [];
    return {
      conversation,
      messages,
      generationJobs,
      activeGenerationJob: activeJob(generationJobs),
      eventSequence: messages.at(-1)?.sequence ?? 0,
    };
  }

  async messages(principal: FrontendPrincipal, conversationId: string) {
    const snapshot = await this.snapshot(principal, conversationId);
    return { conversation: snapshot.conversation, messages: snapshot.messages };
  }

  async stop(principal: FrontendPrincipal, input: { conversationId?: string; turnId?: string }) {
    let turnId = input.turnId;
    if (!turnId && input.conversationId) {
      const jobs = await this.storage.listGenerationJobs(input.conversationId, principal.id);
      if (!jobs) throw new AssistantServiceError("not-found", "Assistant conversation not found");
      turnId = activeJob(jobs)?.id;
    }
    if (!turnId) return { stopped: false, generationJob: null };
    const existing = await this.storage.getGenerationJob(turnId, principal.id);
    if (!existing) throw new AssistantServiceError("not-found", "Assistant turn not found");
    if (existing.status !== "queued" && existing.status !== "running")
      return { stopped: false, generationJob: existing };
    const generationJob = await this.storage.stopGeneration(turnId, principal.id, Date.now());
    if (!generationJob) throw new AssistantServiceError("not-found", "Assistant turn not found");
    const stopped =
      (generationJob.status === "running" && generationJob.cancelRequested) ||
      (generationJob.status === "cancelled" && generationJob.errorCode === "cancelled-by-user");
    if (stopped) this.runtime.cancelGeneration(generationJob.id);
    return { stopped, generationJob };
  }

  async delete(principal: FrontendPrincipal, conversationId: string) {
    const jobs = await this.storage.listGenerationJobs(conversationId, principal.id);
    const deleted = await this.storage.deleteConversation(conversationId, principal.id, Date.now());
    if (!deleted) throw new AssistantServiceError("not-found", "Assistant conversation not found");
    for (const job of jobs ?? [])
      if (job.status === "queued" || job.status === "running")
        this.runtime.cancelGeneration(job.id);
    return { deleted: true, conversationId };
  }
}

let assistantService: AssistantService | null = null;

export function getAssistantService() {
  assistantService ??= new AssistantService();
  return assistantService;
}

export async function startAssistantService() {
  const service = getAssistantService();
  await startAssistantRuntime();
  return service;
}

export function createAssistantServiceForTest(options: {
  storage: AssistantMessageStorage;
  runtime: AssistantRuntime;
}) {
  return new AssistantService(options);
}
