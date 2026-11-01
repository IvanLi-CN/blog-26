import { createHash, randomUUID } from "node:crypto";
import type { JsonValue } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type AssistantMessage,
  createAssistantMessageEventStream,
  type Message,
  type Model,
  Type,
  type Usage,
} from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import {
  AssistantEntry,
  CompactionTask,
  type Conversation,
  type ConversationId,
  type Cursor,
  createRegistry,
  defineDoc,
  defineExtension,
  defineTool,
  type EntryRecord,
  GenerationTask,
  Harness,
  hook,
  LiveDoc,
  ProviderDoc,
  type SubmissionId,
  type ToolRegistration,
  UserEntry,
} from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import {
  type AiUsageContext,
  type AiUsageHandle,
  isAiUsageStoreUnavailable,
  normalizeAiUsage,
  reserveAiUsage,
  settleAiUsage,
} from "@/lib/ai-usage";
import { PiSqliteDatabase } from "./pi-sqlite";

export type AgentModelConfig = {
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
};

type PendingMetering = {
  handle: AiUsageHandle;
  conversationId: string;
};

type PendingCompaction = {
  context: AiUsageContext;
  conversationId: string;
  taskId: string;
  attempt: number;
  messageKey: string;
  providerSessionId?: string;
};

type MeteringState = {
  submissions: Record<string, JsonValue>;
  pending?: Record<string, JsonValue>;
};

type CompactionMemo = {
  context: JsonValue;
  messageKey: string;
  providerSessionId: string | null;
};

type CompactionAttemptState = {
  attempts: Record<string, number>;
};

type ProviderUsageObservation = {
  usage: unknown | null;
};

const BLOCKED_REQUEST = Symbol("blog-ai-usage-blocked-request");
const GENERATION_ATTEMPT_MEMO = "blog-ai-usage-provider-attempt";
const COMPACTION_CONTEXT_MEMO = "blog-ai-usage-compaction-context";
const MeteringDoc = defineDoc<MeteringState>({
  kind: "blog.ai-usage-metering",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ submissions: {}, pending: {} }),
  checkpointWhen: () => true,
});
const CompactionAttemptDoc = defineDoc<CompactionAttemptState>({
  kind: "blog.ai-usage-compaction-attempts",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ attempts: {} }),
  checkpointWhen: () => true,
});

type BlockedMessage = Message & { [BLOCKED_REQUEST]?: unknown };

function markBlockedRequest(messages: readonly Message[], error: unknown): readonly Message[] {
  const first = messages[0];
  const marker = first
    ? { ...first, [BLOCKED_REQUEST]: error }
    : {
        role: "user" as const,
        content: "",
        timestamp: Date.now(),
        [BLOCKED_REQUEST]: error,
      };
  return [marker as Message, ...messages.slice(1)];
}

function blockedRequestError(messages: readonly Message[]) {
  const message = messages.find((candidate) => BLOCKED_REQUEST in candidate) as
    | BlockedMessage
    | undefined;
  return message?.[BLOCKED_REQUEST];
}

function blockedProviderStream(model: Model<"openai-completions">, error: unknown) {
  const output = createAssistantMessageEventStream();
  output.end(failureMessage(model, error));
  return output;
}

function usageContextMemo(context: AiUsageContext): JsonValue {
  return JSON.parse(JSON.stringify(context)) as JsonValue;
}

function usageContextFromMemo(value: JsonValue | undefined): AiUsageContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const context = value as { feature?: unknown };
  return typeof context.feature === "string" ? (value as unknown as AiUsageContext) : undefined;
}

function compactionMemoFromValue(
  value: JsonValue | undefined
): { context: AiUsageContext; messageKey: string; providerSessionId?: string } | undefined {
  if (value && typeof value === "object" && !Array.isArray(value) && "context" in value) {
    const record = value as {
      context?: JsonValue;
      messageKey?: unknown;
      providerSessionId?: unknown;
    };
    const context = usageContextFromMemo(record.context);
    if (!context) return undefined;
    return {
      context,
      messageKey: typeof record.messageKey === "string" ? record.messageKey : "",
      providerSessionId:
        typeof record.providerSessionId === "string" ? record.providerSessionId : undefined,
    };
  }
  const context = usageContextFromMemo(value);
  return context ? { context, messageKey: "", providerSessionId: undefined } : undefined;
}

function pendingSubmissionFromMemo(value: JsonValue | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as { context?: JsonValue; contentDigest?: unknown };
  const context = usageContextFromMemo(record.context);
  return context && typeof record.contentDigest === "string"
    ? { context, contentDigest: record.contentDigest }
    : undefined;
}

function contentDigest(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function usageHasTokens(value: unknown) {
  const normalized = normalizeAiUsage(value);
  return normalized.usageComplete &&
    [
      normalized.inputTokens,
      normalized.cachedInputTokens,
      normalized.outputTokens,
      normalized.reasoningTokens,
      normalized.totalTokens,
    ].some((token) => (token ?? 0) > 0)
    ? value
    : null;
}

function statusForMessage(message: AssistantMessage) {
  return message.stopReason === "aborted"
    ? "cancelled"
    : message.stopReason === "error"
      ? "failure"
      : message.stopReason === "length"
        ? "incomplete"
        : "success";
}

function zeroUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function failureMessage(model: Model<"openai-completions">, error: unknown): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: zeroUsage(),
    stopReason: "error",
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: Date.now(),
  };
}

function tokenEstimate(messages: unknown) {
  return Math.ceil(Buffer.byteLength(JSON.stringify(messages), "utf8") / 4);
}

function compactionMessageKey(messages: readonly Message[]) {
  return JSON.stringify(messages, (key, value) => (key === "timestamp" ? undefined : value)) ?? "";
}

function compactionRequestKey(messages: readonly Message[], sessionId?: string) {
  return `${sessionId ?? "<unknown-session>"}:${compactionMessageKey(messages)}`;
}

function observeProviderEvent(data: unknown, observations: Map<string, ProviderUsageObservation>) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  const value = data as {
    id?: unknown;
    response_id?: unknown;
    usage?: unknown;
    choices?: unknown;
  };
  const responseId =
    typeof value.id === "string"
      ? value.id
      : typeof value.response_id === "string"
        ? value.response_id
        : undefined;
  if (!responseId) return;
  const firstChoice = Array.isArray(value.choices) ? value.choices[0] : undefined;
  const choiceUsage =
    firstChoice && typeof firstChoice === "object" && !Array.isArray(firstChoice)
      ? (firstChoice as { usage?: unknown }).usage
      : undefined;
  const usage = value.usage ?? choiceUsage;
  if (usage === undefined || usage === null) return;
  observations.set(responseId, { usage });
}

function providerUsageForMessage(
  message: AssistantMessage,
  observations: Map<string, ProviderUsageObservation>
) {
  if (!message.responseId) return null;
  const observation = observations.get(message.responseId);
  observations.delete(message.responseId);
  return observation?.usage ?? null;
}

function usageForSettlement(
  message: AssistantMessage,
  observations: Map<string, ProviderUsageObservation>
) {
  const observed = providerUsageForMessage(message, observations);
  if (observed !== null) {
    return {
      usage: observed,
      estimated: !normalizeAiUsage(observed).usageComplete,
    };
  }
  const usage = usageHasTokens(message.usage);
  return { usage, estimated: usage === null };
}

type ProviderStreamOptions = {
  onProviderStreamEvent?: (
    data: unknown,
    model: Model<"openai-completions">
  ) => void | Promise<void>;
};

function withProviderObservation<T extends ProviderStreamOptions>(
  options: T | undefined,
  observations: Map<string, ProviderUsageObservation>
) {
  return {
    ...options,
    onProviderStreamEvent: async (data: unknown, model: Model<"openai-completions">) => {
      observeProviderEvent(data, observations);
      await options?.onProviderStreamEvent?.(data, model);
    },
  } as T;
}

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

export type AgentConversationSnapshot = {
  messages: AgentMessage[];
  generating: boolean;
  partial: string;
  error: string | null;
};

export class AgentConfigurationError extends Error {
  constructor() {
    super("请先在 LLM 设置中配置有效的聊天模型、服务地址和 API Key，再重试剪藏处理。");
    this.name = "AgentConfigurationError";
  }
}

function modelFromConfig(config: AgentModelConfig): Model<"openai-completions"> {
  if (!config.model || !config.baseUrl || !config.apiKey) throw new AgentConfigurationError();
  return {
    id: config.model,
    name: config.model,
    provider: "blog-chat",
    api: "openai-completions",
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ["text"],
    contextWindow: 32_768,
    maxTokens: 8192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsStore: false, supportsDeveloperRole: false },
  };
}

function decodeId(value: string) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("Invalid agent record identity");
  }
  return Number(value);
}

function messageText(message: { content: unknown }) {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function visibleMessages(entries: readonly EntryRecord[]): AgentMessage[] {
  return entries.flatMap((entry) =>
    (UserEntry.is(entry) || AssistantEntry.is(entry) ? (entry.model ?? []) : []).flatMap(
      (message) => {
        if (message.role !== "user" && message.role !== "assistant") return [];
        const text = messageText(message);
        return text
          ? [{ id: String(entry.id), role: message.role, text, timestamp: message.timestamp }]
          : [];
      }
    )
  );
}

/** Application adapter. Pi identities and event shapes stay inside this module. */
export class AgentRuntimeFacade {
  private constructor(
    private readonly harness: Harness,
    private readonly refresh: () => Promise<Model<"openai-completions">>,
    private readonly tools: readonly ToolRegistration[],
    private readonly database: PiSqliteDatabase,
    private readonly resumable: boolean,
    private readonly meteringContexts: Map<string, AiUsageContext>,
    private readonly submissionMeteringContexts: Map<string, AiUsageContext>,
    private readonly settlePendingMetering: (conversationId?: string) => Promise<void>
  ) {}

  static async open(options: {
    path: string;
    resolveModel: () => Promise<AgentModelConfig>;
    retrieveArticle?: (conversationId: string, query: string) => Promise<string>;
    strictConfiguration?: boolean;
    resume?: boolean;
    onOwnershipLost?: () => void;
  }) {
    const models = createModels();
    const registry = createRegistry();
    const meteringContexts = new Map<string, AiUsageContext>();
    const submissionMeteringContexts = new Map<string, AiUsageContext>();
    const pendingMetering = new Map<string, PendingMetering[]>();
    const providerObservations = new Map<string, ProviderUsageObservation>();
    const pendingCompactions: PendingCompaction[] = [];
    const compactionContexts = new Map<string, PendingCompaction>();
    const compactionContextsBySession = new Map<string, PendingCompaction[]>();
    const compactionContextsByMessage = new Map<string, PendingCompaction[]>();
    let meteringHarness: Harness | undefined;
    const forgetCompaction = (compaction: PendingCompaction) => {
      for (const [key, candidate] of compactionContexts) {
        if (candidate === compaction) compactionContexts.delete(key);
      }
      for (const [sessionId, queue] of compactionContextsBySession) {
        const retained = queue.filter((candidate) => candidate !== compaction);
        if (retained.length) compactionContextsBySession.set(sessionId, retained);
        else compactionContextsBySession.delete(sessionId);
      }
      for (const [messageKey, queue] of compactionContextsByMessage) {
        const retained = queue.filter((candidate) => candidate !== compaction);
        if (retained.length) compactionContextsByMessage.set(messageKey, retained);
        else compactionContextsByMessage.delete(messageKey);
      }
    };
    const rememberCompaction = (requestKey: string, compaction: PendingCompaction) => {
      forgetCompaction(compaction);
      compactionContexts.set(requestKey, compaction);
      if (compaction.providerSessionId) {
        const queue = compactionContextsBySession.get(compaction.providerSessionId) ?? [];
        if (!queue.includes(compaction)) queue.push(compaction);
        compactionContextsBySession.set(compaction.providerSessionId, queue);
      }
      const messageQueue = compactionContextsByMessage.get(compaction.messageKey) ?? [];
      if (!messageQueue.includes(compaction)) messageQueue.push(compaction);
      compactionContextsByMessage.set(compaction.messageKey, messageQueue);
    };
    const claimCompaction = (messages: readonly Message[], sessionId?: string) => {
      const requestKey = compactionRequestKey(messages, sessionId);
      let compaction = compactionContexts.get(requestKey);
      if (!compaction) {
        const messageKey = compactionMessageKey(messages);
        const sessionCandidates = sessionId
          ? [
              ...(compactionContextsBySession.get(sessionId) ?? []),
              ...pendingCompactions.filter(
                (candidate) => candidate.providerSessionId === sessionId
              ),
            ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index)
          : [];
        const indexedCandidates = (compactionContextsByMessage.get(messageKey) ?? []).filter(
          (candidate) =>
            (!candidate.messageKey || candidate.messageKey === messageKey) &&
            (!sessionId ||
              !candidate.providerSessionId ||
              candidate.providerSessionId === sessionId)
        );
        const pendingCandidates = pendingCompactions.filter(
          (candidate) =>
            (!candidate.messageKey || candidate.messageKey === messageKey) &&
            (!sessionId ||
              !candidate.providerSessionId ||
              candidate.providerSessionId === sessionId)
        );
        const candidates = sessionCandidates.length
          ? sessionCandidates
          : indexedCandidates.length
            ? indexedCandidates
            : pendingCandidates;
        if (candidates.length === 1) compaction = candidates[0];
      }
      if (!compaction) return { requestKey, compaction: undefined };
      const pendingIndex = pendingCompactions.indexOf(compaction);
      if (pendingIndex >= 0) pendingCompactions.splice(pendingIndex, 1);
      rememberCompaction(requestKey, compaction);
      return { requestKey, compaction };
    };
    async function nextCompactionAttempt(compaction: PendingCompaction) {
      if (!meteringHarness) throw new Error("Agent runtime harness is not ready");
      return meteringHarness.commit(async (tx) => {
        const state = await tx.doc(
          CompactionAttemptDoc,
          compaction.conversationId as unknown as ConversationId
        );
        const next = Math.max(0, state.attempts[compaction.taskId] ?? 0) + 1;
        state.attempts[compaction.taskId] = next;
        return next;
      }, BACKGROUND_CONTEXT);
    }
    registry.install(
      defineExtension({
        name: "ai-usage-metering",
        hooks: [
          hook(GenerationTask, {
            beforeRequest: async ({ messages }, api, hookContext) => {
              const conversationId = String(api.conversationId);
              const taskId = String(api.taskId);
              const live = await api.snapshot(LiveDoc, api.conversationId, hookContext);
              const meteringState = await api.snapshot(
                MeteringDoc,
                api.conversationId,
                hookContext
              );
              const pendingSubmissionMemos = Object.values(meteringState?.pending ?? {})
                .map(pendingSubmissionFromMemo)
                .filter(
                  (pending): pending is NonNullable<ReturnType<typeof pendingSubmissionFromMemo>> =>
                    pending !== undefined
                );
              const latestUserMessage = [...messages]
                .reverse()
                .find((message) => message.role === "user");
              const latestUserDigest = latestUserMessage
                ? contentDigest(messageText(latestUserMessage))
                : undefined;
              const pendingSubmission =
                (latestUserDigest
                  ? pendingSubmissionMemos.find(
                      (pending) => pending.contentDigest === latestUserDigest
                    )
                  : undefined) ??
                (pendingSubmissionMemos.length === 1 ? pendingSubmissionMemos[0] : undefined);
              const submissionContext =
                live?.run?.inputs
                  .map(
                    (submissionId) =>
                      submissionMeteringContexts.get(String(submissionId)) ??
                      usageContextFromMemo(meteringState?.submissions[String(submissionId)])
                  )
                  .find((context): context is AiUsageContext => context !== undefined) ??
                pendingSubmission?.context;
              const previous = submissionContext ??
                meteringContexts.get(conversationId) ?? { feature: "clipping" };
              let attempt = 1;
              while (
                (await api.memo<number>(`${GENERATION_ATTEMPT_MEMO}:${attempt}`, hookContext)) !==
                undefined
              )
                attempt++;
              await api.memo(`${GENERATION_ATTEMPT_MEMO}:${attempt}`, attempt, hookContext);
              const logicalRequestId = `${previous.logicalRequestId ?? `clipping:${conversationId}`}:provider-task:${taskId}`;
              let handle: AiUsageHandle;
              try {
                handle = await reserveAiUsage({
                  ...previous,
                  feature: previous.feature ?? "clipping",
                  provider: previous.provider ?? "blog-chat",
                  model: previous.model ?? null,
                  logicalRequestId,
                  attempt,
                  automaticRetry: attempt > 1,
                  inputEstimateTokens: Math.ceil(tokenEstimate(messages)),
                  outputEstimateTokens: previous.outputEstimateTokens ?? 8_192,
                });
              } catch (error) {
                if (isAiUsageStoreUnavailable(error)) return;
                return { messages: markBlockedRequest(messages, error) };
              }
              const queue = pendingMetering.get(taskId) ?? [];
              queue.push({ handle, conversationId });
              pendingMetering.set(taskId, queue);
            },
            afterResponse: async (message, api) => {
              const taskId = String(api.taskId);
              const queue = pendingMetering.get(taskId);
              const pending = queue?.shift();
              if (!pending) return;
              if (!queue?.length) pendingMetering.delete(taskId);
              const settledUsage = usageForSettlement(message, providerObservations);
              await settleAiUsage(pending.handle, {
                status: statusForMessage(message),
                usage: settledUsage.usage,
                estimated: settledUsage.estimated,
                provider: message.provider,
                model: message.responseModel ?? message.model,
              });
            },
          }),
          hook(CompactionTask, {
            beforeCompact: async (_compaction, api, hookContext) => {
              const conversationId = String(api.conversationId);
              const previous = meteringContexts.get(conversationId) ?? { feature: "clipping" };
              const provider = await api.snapshot(ProviderDoc, api.conversationId, hookContext);
              const context = {
                ...previous,
                feature: "clipping-compaction",
                logicalQuestionId: null,
                chargeQuestion: false,
                logicalRequestId: previous.logicalRequestId ?? `clipping:${conversationId}`,
                metadata: {
                  ...previous.metadata,
                  compactionTaskId: String(api.taskId),
                },
              } satisfies AiUsageContext;
              const taskId = String(api.taskId);
              const messageKey = compactionMessageKey(_compaction.messages);
              const tracked =
                pendingCompactions.find((candidate) => candidate.taskId === taskId) ??
                [...compactionContexts.values()].find((candidate) => candidate.taskId === taskId);
              if (tracked) {
                const wasPending = pendingCompactions.includes(tracked);
                if (!wasPending) forgetCompaction(tracked);
                tracked.context = context;
                tracked.messageKey = messageKey;
                tracked.providerSessionId ??= provider?.sessionId;
                if (!wasPending) pendingCompactions.push(tracked);
              } else {
                pendingCompactions.push({
                  context,
                  conversationId,
                  taskId,
                  attempt: 0,
                  messageKey,
                  providerSessionId: provider?.sessionId,
                });
              }
              await api.memo(
                COMPACTION_CONTEXT_MEMO,
                {
                  context: usageContextMemo(context),
                  messageKey,
                  providerSessionId: provider?.sessionId ?? null,
                } satisfies CompactionMemo,
                hookContext
              );
            },
          }),
        ],
      })
    );
    const retrieveArticle = options.retrieveArticle;
    const articleTools = retrieveArticle
      ? [
          defineTool({
            name: "article_passages",
            description:
              "Retrieve relevant numbered passages from this conversation's saved article. No network or other articles.",
            replay: "safe",
            parameters: Type.Object({ query: Type.String({ maxLength: 1000 }) }),
            execute: async (args, api) => ({
              content: [
                {
                  type: "text",
                  text: await retrieveArticle(String(api.conversationId), args.query),
                },
              ],
            }),
          }),
        ]
      : [];
    if (articleTools.length)
      registry.install(defineExtension({ name: "clipping-article", tools: articleTools }));
    const refresh = async () => {
      const config = await options.resolveModel();
      const model = modelFromConfig(config);
      models.setProvider(
        createProvider({
          id: model.provider,
          models: [model],
          auth: {
            apiKey: {
              name: "Blog LLM settings",
              resolve: async () => {
                const current = await options.resolveModel();
                if (!current.apiKey || !current.baseUrl) throw new AgentConfigurationError();
                return { auth: { apiKey: current.apiKey, baseUrl: current.baseUrl } };
              },
            },
          },
          api: {
            // The application persists its retry budget; avoid hidden provider retries.
            stream: (model, context, options) => {
              const blocked = blockedRequestError(context.messages);
              return blocked
                ? blockedProviderStream(model as Model<"openai-completions">, blocked)
                : stream(
                    model as Model<"openai-completions">,
                    context,
                    withProviderObservation({ ...options, maxRetries: 0 }, providerObservations)
                  );
            },
            streamSimple: (model, context, options) => {
              const blocked = blockedRequestError(context.messages);
              if (blocked)
                return blockedProviderStream(model as Model<"openai-completions">, blocked);
              const providerOptions = { ...options, maxRetries: 0 };
              if (options?.cacheRetention !== "none")
                return streamSimple(
                  model as Model<"openai-completions">,
                  context,
                  withProviderObservation(providerOptions, providerObservations)
                );
              const { compaction } = claimCompaction(context.messages, options?.sessionId);
              if (!compaction)
                return streamSimple(model as Model<"openai-completions">, context, providerOptions);
              const output = createAssistantMessageEventStream();
              void (async () => {
                let handle: AiUsageHandle | undefined;
                let settled = false;
                let metering: AiUsageContext;
                const settle = async (message: AssistantMessage, error?: unknown) => {
                  if (!handle || settled) return;
                  settled = true;
                  const settledUsage = usageForSettlement(message, providerObservations);
                  try {
                    await settleAiUsage(handle, {
                      status: statusForMessage(message),
                      usage: settledUsage.usage,
                      estimated: settledUsage.estimated,
                      provider: message.provider,
                      model: message.responseModel ?? message.model,
                      ...(error ? { error } : {}),
                    });
                  } catch (settleError) {
                    console.error("[ai-usage] failed to settle compaction", settleError);
                  }
                };
                const forwardUnmetered = async () => {
                  const inner = streamSimple(
                    model as Model<"openai-completions">,
                    context,
                    withProviderObservation(providerOptions, providerObservations)
                  );
                  for await (const event of inner) output.push(event);
                  output.end(await inner.result());
                };
                try {
                  compaction.attempt = await nextCompactionAttempt(compaction);
                  metering = {
                    ...compaction.context,
                    feature: "clipping-compaction",
                    provider: model.provider,
                    model: model.id,
                    logicalRequestId: `${compaction.context.logicalRequestId ?? `clipping-compaction:${randomUUID()}`}:provider-task:${compaction.taskId}`,
                    attempt: compaction.attempt,
                    automaticRetry: compaction.attempt > 1,
                    chargeQuestion: false,
                    inputEstimateTokens: tokenEstimate(context.messages),
                    outputEstimateTokens: options?.maxTokens ?? 8_192,
                  } satisfies AiUsageContext;
                  try {
                    handle = await reserveAiUsage(metering);
                  } catch (error) {
                    if (isAiUsageStoreUnavailable(error)) {
                      await forwardUnmetered();
                      forgetCompaction(compaction);
                      return;
                    }
                    forgetCompaction(compaction);
                    output.end(failureMessage(model as Model<"openai-completions">, error));
                    return;
                  }
                  const inner = streamSimple(
                    model as Model<"openai-completions">,
                    context,
                    withProviderObservation(providerOptions, providerObservations)
                  );
                  for await (const event of inner) {
                    if (event.type === "done") await settle(event.message);
                    else if (event.type === "error") await settle(event.error);
                    output.push(event);
                  }
                  const message = await inner.result();
                  await settle(message);
                  if (message.stopReason !== "error" && message.stopReason !== "aborted")
                    forgetCompaction(compaction);
                  output.end(message);
                } catch (error) {
                  const message = failureMessage(model as Model<"openai-completions">, error);
                  await settle(message, error);
                  output.end(message);
                }
              })();
              return output;
            },
          },
        })
      );
      return model;
    };
    let model: Model<"openai-completions"> | undefined;
    try {
      model = await refresh();
    } catch (error) {
      if (options.strictConfiguration !== false || !(error instanceof AgentConfigurationError)) {
        throw error;
      }
    }
    const database = await PiSqliteDatabase.open(options.path, {
      onOwnershipLost: options.onOwnershipLost,
    });
    try {
      const harness = await Harness.open(
        await SqliteStorage.open(database),
        {
          models,
          registry,
          settings: {
            retry: { maxRetries: 3, baseDelayMs: 250, maxAgentDelayMs: 2000 },
            stream: { timeoutMs: 120_000 },
            compaction: { enabled: true, reserveTokens: 8192, keepRecentTokens: 8000 },
          },
        },
        BACKGROUND_CONTEXT
      );
      meteringHarness = harness;
      const inspection = await harness.inspect(BACKGROUND_CONTEXT);
      for (const task of inspection.tasks) {
        if (task.record.kind !== CompactionTask.definition.name) continue;
        const memo = compactionMemoFromValue(task.record.memos?.[COMPACTION_CONTEXT_MEMO]);
        if (!memo) continue;
        pendingCompactions.push({
          context: memo.context,
          conversationId: String(task.record.conversationId),
          taskId: String(task.record.id),
          attempt: 0,
          messageKey: memo.messageKey,
          providerSessionId: memo.providerSessionId,
        });
      }
      // Rebind persisted conversations before resuming under changed application settings.
      let cursor: Cursor | undefined;
      do {
        const page = await harness.commit(
          (tx) => tx.scanConversations({}, 100, cursor),
          BACKGROUND_CONTEXT
        );
        for (const record of page.items) {
          const conversation = await harness.conversation(record.id, BACKGROUND_CONTEXT);
          if (model) {
            await conversation?.configure(
              { model: { provider: model.provider, modelId: model.id } },
              BACKGROUND_CONTEXT
            );
          }
        }
        cursor = page.next;
      } while (cursor);
      if (model && options.resume !== false) harness.resume();
      const settlePendingMetering = async (conversationId?: string) => {
        const pending: PendingMetering[] = [];
        for (const [taskId, queue] of pendingMetering) {
          const retained = queue.filter((item) => {
            if (conversationId && item.conversationId !== conversationId) return true;
            pending.push(item);
            return false;
          });
          if (retained.length) pendingMetering.set(taskId, retained);
          else pendingMetering.delete(taskId);
        }
        await Promise.allSettled(
          pending.map((item) =>
            settleAiUsage(item.handle, {
              status: "cancelled",
              estimated: true,
            })
          )
        );
      };
      return new AgentRuntimeFacade(
        harness,
        refresh,
        articleTools,
        database,
        Boolean(model),
        meteringContexts,
        submissionMeteringContexts,
        settlePendingMetering
      );
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  private async conversation(id: string): Promise<Conversation> {
    const conversation = await this.harness.conversation(
      decodeId(id) as ConversationId,
      BACKGROUND_CONTEXT
    );
    if (!conversation) throw new Error("Agent conversation not found");
    return conversation;
  }

  async createConversation(
    instructions: string,
    allowArticleTools = false,
    metering?: AiUsageContext
  ) {
    const model = await this.refresh();
    const conversation = await this.harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: { provider: model.provider, modelId: model.id },
          instructions,
          tools: allowArticleTools ? this.tools : [],
        },
      },
      BACKGROUND_CONTEXT
    );
    const id = String(conversation.id);
    this.meteringContexts.set(id, {
      feature: "clipping",
      ...metering,
    });
    return id;
  }

  setMeteringContext(id: string, metering: AiUsageContext) {
    this.meteringContexts.set(id, {
      ...(this.meteringContexts.get(id) ?? { feature: "clipping" }),
      ...metering,
    });
  }

  async submit(id: string, content: string, requestId: string, metering?: AiUsageContext) {
    const model = await this.refresh();
    const conversation = await this.conversation(id);
    let submissionContext = this.meteringContexts.get(id);
    if (metering) {
      submissionContext = {
        ...(this.meteringContexts.get(id) ?? { feature: "clipping" }),
        ...metering,
      };
      this.meteringContexts.set(id, submissionContext);
    }
    await conversation.configure(
      { model: { provider: model.provider, modelId: model.id } },
      BACKGROUND_CONTEXT
    );
    if (submissionContext) {
      await this.harness.commit(async (tx) => {
        const state = await tx.doc(MeteringDoc, conversation.id);
        state.pending ??= {};
        state.pending[requestId] = {
          context: usageContextMemo(submissionContext),
          contentDigest: contentDigest(content),
        };
        return undefined;
      }, BACKGROUND_CONTEXT);
    }
    const submission = await conversation.submit(
      { type: "input", content, requestId, whenBusy: "followUp" },
      BACKGROUND_CONTEXT
    );
    if (submissionContext) {
      this.submissionMeteringContexts.set(String(submission.id), submissionContext);
      await this.harness.commit(async (tx) => {
        const state = await tx.doc(MeteringDoc, conversation.id);
        state.pending ??= {};
        delete state.pending[requestId];
        state.submissions[String(submission.id)] = usageContextMemo(submissionContext);
        return undefined;
      }, BACKGROUND_CONTEXT);
    }
    return String(submission.id);
  }

  async answer(
    id: string,
    submissionId: string,
    beforeCommit?: (commit: () => Promise<string>) => Promise<string>
  ) {
    const conversation = await this.conversation(id);
    const submission = await this.harness.submission(
      decodeId(submissionId) as SubmissionId,
      BACKGROUND_CONTEXT
    );
    if (
      !submission ||
      (await submission.status(BACKGROUND_CONTEXT)).conversationId !== conversation.id
    ) {
      throw new Error("Agent submission not found");
    }
    const result = await submission.wait(BACKGROUND_CONTEXT);
    if (result.status !== "done" || result.type !== "input") {
      throw new Error("模型生成失败，请重试；已保存的文章和对话仍然保留。");
    }
    const commit = async () => {
      const answer = await conversation.commit(
        (tx) => tx.entry(AssistantEntry, result.answer),
        BACKGROUND_CONTEXT
      );
      if (
        answer?.model?.some(
          (message) => message.role === "assistant" && message.stopReason === "length"
        )
      ) {
        throw new Error("模型输出达到长度限制；未将部分结果标记为全文完成，请重试。");
      }
      const text = answer?.model?.map(messageText).join("\n").trim();
      if (!text) throw new Error("模型返回了空内容，请重试。");
      return text;
    };
    return beforeCommit ? beforeCommit(commit) : commit();
  }

  async snapshot(id: string): Promise<AgentConversationSnapshot> {
    const conversation = await this.conversation(id);
    const view = await conversation.viewState(BACKGROUND_CONTEXT);
    try {
      const entries: EntryRecord[] = [];
      let cursor: Parameters<Conversation["entries"]>[2];
      do {
        const page = await conversation.entries({}, 100, cursor, BACKGROUND_CONTEXT);
        entries.push(...page.items);
        cursor = page.next;
      } while (cursor);
      const latestAnswer = entries.findLast((entry) => AssistantEntry.is(entry));
      const live = view.value.docs["pi.live"];
      const generation = live?.generation;
      const partial =
        generation && typeof generation === "object" && !Array.isArray(generation)
          ? generation.message
          : undefined;
      return {
        messages: visibleMessages(entries.reverse()),
        generating: Boolean(live?.run),
        partial:
          partial && typeof partial === "object" && !Array.isArray(partial) && "content" in partial
            ? messageText({ content: partial.content })
            : "",
        error: latestAnswer?.model?.some(
          (message) =>
            message.role === "assistant" &&
            ["error", "aborted", "length"].includes(message.stopReason)
        )
          ? "回答尚未完整生成；已保存的消息仍然保留，请重试或继续追问。"
          : null,
      };
    } finally {
      view.dispose();
    }
  }

  async abort(id: string) {
    try {
      await (await this.conversation(id)).abort(BACKGROUND_CONTEXT);
    } finally {
      await this.settlePendingMetering(id);
    }
  }

  /** Guard artifact mutations with the same owner lease as runtime writes. No Pi calls inside. */
  exclusive<T>(operation: () => Promise<T>) {
    return this.database.transaction(() => operation());
  }

  assertOwnership() {
    this.database.assertOwnership();
  }

  async close() {
    await this.settlePendingMetering();
    await this.harness.close(BACKGROUND_CONTEXT);
  }

  resume() {
    if (this.resumable) this.harness.resume();
  }
}
