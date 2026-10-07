import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type Model, Type } from "@earendil-works/pi-ai";
import { stream, streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import { createModels, createProvider } from "@earendil-works/pi-ai/models";
import {
  AssistantEntry,
  type Conversation,
  type ConversationId,
  type Cursor,
  createRegistry,
  defineExtension,
  defineTool,
  type EntryRecord,
  Harness,
  type SubmissionId,
  type ToolRegistration,
  UserEntry,
} from "@earendil-works/pi-durable";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { PiSqliteDatabase } from "./pi-sqlite";

export type AgentModelConfig = {
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
};

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
    private readonly resumable: boolean
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
            stream: (model, context, options) =>
              stream(model, context, { ...options, maxRetries: 0 }),
            streamSimple: (model, context, options) =>
              streamSimple(model, context, { ...options, maxRetries: 0 }),
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
      return new AgentRuntimeFacade(harness, refresh, articleTools, database, Boolean(model));
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

  async createConversation(instructions: string, allowArticleTools = false) {
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
    return String(conversation.id);
  }

  async submit(id: string, content: string, requestId: string) {
    const model = await this.refresh();
    const conversation = await this.conversation(id);
    await conversation.configure(
      { model: { provider: model.provider, modelId: model.id } },
      BACKGROUND_CONTEXT
    );
    const submission = await conversation.submit(
      { type: "input", content, requestId, whenBusy: "followUp" },
      BACKGROUND_CONTEXT
    );
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
    await (await this.conversation(id)).abort(BACKGROUND_CONTEXT);
  }

  /** Guard artifact mutations with the same owner lease as runtime writes. No Pi calls inside. */
  exclusive<T>(operation: () => Promise<T>) {
    return this.database.transaction(() => operation());
  }

  assertOwnership() {
    this.database.assertOwnership();
  }

  async close() {
    await this.harness.close(BACKGROUND_CONTEXT);
  }

  resume() {
    if (this.resumable) this.harness.resume();
  }
}
