import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import {
  type AdminChatSettings,
  type AdminInheritedTierSettings,
  type AdminLlmSettingsPayload,
  type AdminLlmSettingsTestResponse,
  type AdminLlmSettingsUpdateInput,
  type AdminSecretState,
  adminLlmSettingsUpdateSchema,
  createEmptyLlmSettingsRecord,
  encryptedSecretPayloadSchema,
  type LlmSettingsRecord,
  llmSettingsRecordSchema,
  type ResolvedTierSummary,
} from "@/lib/llm-settings";
import { llmSettings, postEmbeddings } from "@/lib/schema";

const DEFAULT_ROW_ID = "default";
const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBEDDING_MODEL = "BAAI/bge-m3";
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_LLM_TEST_TIMEOUT_MS = 10_000;

type ResolvedValueSource = ResolvedTierSummary["sources"]["model"];
type ChildTierKey = "embedding" | "rerank";
type ChildTierRecord = LlmSettingsRecord[ChildTierKey];

export type ResolvedTierConfig = {
  model: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  apiKeyAvailable: boolean;
  sources: {
    model: ResolvedValueSource;
    baseUrl: ResolvedValueSource;
    apiKey: ResolvedValueSource;
  };
};

export type ResolvedLlmConfig = {
  chat: ResolvedTierConfig;
  embedding: ResolvedTierConfig;
  rerank: ResolvedTierConfig;
};

export class LlmSettingsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmSettingsInputError";
  }
}

function getEnvText(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function normalizeOpenAiCompatibleBaseUrl(value: string | null | undefined): string | null {
  const trimmed = normalizeOptionalText(value);
  if (!trimmed) return null;
  const withoutSlash = trimmed.replace(/\/+$/, "");
  if (/\/v\d+$/i.test(withoutSlash) || /\/api\/v\d+$/i.test(withoutSlash)) {
    return withoutSlash;
  }
  return `${withoutSlash}/v1`;
}

function ensureValidHttpUrl(label: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new LlmSettingsInputError(`${label} 不是合法的 URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new LlmSettingsInputError(`${label} 只支持 http 或 https`);
  }
  return value;
}

function normalizeValidatedBaseUrl(
  label: string,
  value: string | null | undefined
): string | undefined {
  const normalized = normalizeOpenAiCompatibleBaseUrl(value);
  if (!normalized) return undefined;
  return ensureValidHttpUrl(label, normalized);
}

function maskSecret(value: string): string {
  const trimmed = value.trim();
  return "•".repeat(trimmed.length);
}

function isAbortLikeError(error: unknown) {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }
  return false;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  timeoutLabel: string
) {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error(`${timeoutLabel}：${timeoutMs}ms 内没有收到响应`);
    }
    throw error;
  }
}

function deriveMasterKey(): Buffer | null {
  const raw = getEnvText("LLM_SETTINGS_MASTER_KEY");
  if (!raw) return null;
  return createHash("sha256").update(raw, "utf8").digest();
}

function encryptSecret(value: string) {
  const key = deriveMasterKey();
  if (!key) {
    throw new Error("LLM_SETTINGS_MASTER_KEY is required to store API keys");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return encryptedSecretPayloadSchema.parse({
    version: 1,
    algorithm: "aes-256-gcm",
    keyDerivation: "sha256-utf8",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

function decryptSecret(payload: unknown): string | null {
  const key = deriveMasterKey();
  if (!key) return null;
  const parsed = encryptedSecretPayloadSchema.parse(payload);
  const decipher = createDecipheriv(parsed.algorithm, key, Buffer.from(parsed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

async function ensureDbReady() {
  if (!db) {
    await initializeDB();
  }
}

export async function getPersistedLlmSettings(): Promise<{
  record: LlmSettingsRecord;
  updatedAt: number | null;
}> {
  await ensureDbReady();
  const row = await db
    .select({ config: llmSettings.config, updatedAt: llmSettings.updatedAt })
    .from(llmSettings)
    .where(eq(llmSettings.id, DEFAULT_ROW_ID))
    .get();

  if (!row?.config) {
    return { record: createEmptyLlmSettingsRecord(), updatedAt: null };
  }

  try {
    return {
      record: llmSettingsRecordSchema.parse(JSON.parse(row.config) as unknown),
      updatedAt: row.updatedAt ?? null,
    };
  } catch (error) {
    console.warn("[llm-settings] failed to parse persisted config, using empty defaults", error);
    return { record: createEmptyLlmSettingsRecord(), updatedAt: row.updatedAt ?? null };
  }
}

async function savePersistedLlmSettings(record: LlmSettingsRecord) {
  await ensureDbReady();
  const now = Date.now();
  const existing = await db
    .select({ id: llmSettings.id, createdAt: llmSettings.createdAt })
    .from(llmSettings)
    .where(eq(llmSettings.id, DEFAULT_ROW_ID))
    .get();

  const payload = JSON.stringify(llmSettingsRecordSchema.parse(record));

  await db
    .insert(llmSettings)
    .values({
      id: DEFAULT_ROW_ID,
      config: payload,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: llmSettings.id,
      set: {
        config: payload,
        updatedAt: now,
      },
    });
}

function resolveDirectValue({
  dbValue,
  envValue,
  defaultValue,
}: {
  dbValue?: string;
  envValue?: string;
  defaultValue?: string | null;
}): { value: string | null; source: ResolvedValueSource } {
  if (dbValue) {
    return { value: dbValue, source: "db" };
  }
  if (envValue) {
    return { value: envValue, source: "env" };
  }
  if (defaultValue) {
    return { value: defaultValue, source: "default" };
  }
  return { value: null, source: "missing" };
}

function resolveDirectSecret({
  dbValue,
  envValue,
}: {
  dbValue?: string | null;
  envValue?: string;
}) {
  if (dbValue) {
    return { value: dbValue, source: "db" as const };
  }
  if (envValue) {
    return { value: envValue, source: "env" as const };
  }
  return { value: null, source: "missing" as const };
}

function buildInheritedValue(parent: { value: string | null }) {
  if (parent.value) {
    return { value: parent.value, source: "inherited" as const };
  }
  return { value: null, source: "missing" as const };
}

function getSharedEnvDefaults() {
  return {
    baseUrl: normalizeOpenAiCompatibleBaseUrl(
      getEnvText("OPENAI_API_BASE_URL") || getEnvText("OPENAI_BASE_URL") || DEFAULT_OPENAI_BASE_URL
    ),
    apiKey: getEnvText("OPENAI_API_KEY"),
  };
}

function getChatEnvDefaults() {
  const shared = getSharedEnvDefaults();
  return {
    model: getEnvText("TAG_AI_MODEL") || getEnvText("CHAT_COMPLETION_MODEL"),
    baseUrl: shared.baseUrl ?? DEFAULT_OPENAI_BASE_URL,
    apiKey: shared.apiKey,
  };
}

function getEmbeddingEnvDefaults() {
  const shared = getSharedEnvDefaults();
  return {
    model: getEnvText("EMBEDDING_MODEL_NAME"),
    baseUrl: shared.baseUrl,
    apiKey: shared.apiKey,
  };
}

function getRerankEnvDefaults() {
  const shared = getSharedEnvDefaults();
  return {
    model: getEnvText("RERANKER_MODEL_NAME"),
    baseUrl: shared.baseUrl,
    apiKey: shared.apiKey,
  };
}

function readPersistedSecretValue(secret: LlmSettingsRecord["chat"]["apiKey"] | undefined) {
  if (!secret) return { value: null, requiresMasterKey: false };
  try {
    const value = decryptSecret(secret);
    if (!value) {
      return { value: null, requiresMasterKey: true };
    }
    return { value, requiresMasterKey: false };
  } catch (error) {
    console.warn("[llm-settings] failed to decrypt persisted secret", error);
    return { value: null, requiresMasterKey: true };
  }
}

function resolveLlmConfigFromRecord(record: LlmSettingsRecord): ResolvedLlmConfig {
  const chatEnv = getChatEnvDefaults();
  const embeddingEnv = getEmbeddingEnvDefaults();
  const rerankEnv = getRerankEnvDefaults();

  const chatSecret = readPersistedSecretValue(record.chat.apiKey);
  const chatModel = resolveDirectValue({
    dbValue: normalizeOptionalText(record.chat.model),
    envValue: chatEnv.model,
    defaultValue: DEFAULT_CHAT_MODEL,
  });
  const chatBaseUrl = resolveDirectValue({
    dbValue: normalizeOpenAiCompatibleBaseUrl(record.chat.baseUrl) ?? undefined,
    envValue: chatEnv.baseUrl ?? undefined,
    defaultValue: DEFAULT_OPENAI_BASE_URL,
  });
  const chatApiKey = resolveDirectSecret({ dbValue: chatSecret.value, envValue: chatEnv.apiKey });

  const embeddingModel = resolveDirectValue({
    dbValue: normalizeOptionalText(record.embedding.model),
    envValue: embeddingEnv.model,
    defaultValue: DEFAULT_EMBEDDING_MODEL,
  });
  const embeddingBaseUrl =
    record.embedding.baseUrlMode === "custom"
      ? resolveDirectValue({
          dbValue: normalizeOpenAiCompatibleBaseUrl(record.embedding.baseUrl) ?? undefined,
          envValue: embeddingEnv.baseUrl ?? undefined,
          defaultValue: DEFAULT_OPENAI_BASE_URL,
        })
      : buildInheritedValue({ value: chatBaseUrl.value });
  const embeddingSecret = readPersistedSecretValue(record.embedding.apiKey);
  const embeddingApiKey =
    record.embedding.apiKeyMode === "custom"
      ? resolveDirectSecret({ dbValue: embeddingSecret.value, envValue: embeddingEnv.apiKey })
      : buildInheritedValue({ value: chatApiKey.value });

  const rerankModel = resolveDirectValue({
    dbValue: normalizeOptionalText(record.rerank.model),
    envValue: rerankEnv.model,
    defaultValue: null,
  });
  const rerankBaseUrl =
    record.rerank.baseUrlMode === "custom"
      ? resolveDirectValue({
          dbValue: normalizeOpenAiCompatibleBaseUrl(record.rerank.baseUrl) ?? undefined,
          envValue: rerankEnv.baseUrl ?? undefined,
          defaultValue: DEFAULT_OPENAI_BASE_URL,
        })
      : buildInheritedValue({ value: embeddingBaseUrl.value });
  const rerankSecret = readPersistedSecretValue(record.rerank.apiKey);
  const rerankApiKey =
    record.rerank.apiKeyMode === "custom"
      ? resolveDirectSecret({ dbValue: rerankSecret.value, envValue: rerankEnv.apiKey })
      : buildInheritedValue({ value: embeddingApiKey.value });

  return {
    chat: {
      model: chatModel.value,
      baseUrl: chatBaseUrl.value,
      apiKey: chatApiKey.value,
      apiKeyAvailable: Boolean(chatApiKey.value),
      sources: {
        model: chatModel.source,
        baseUrl: chatBaseUrl.source,
        apiKey: chatApiKey.source,
      },
    },
    embedding: {
      model: embeddingModel.value,
      baseUrl: embeddingBaseUrl.value,
      apiKey: embeddingApiKey.value,
      apiKeyAvailable: Boolean(embeddingApiKey.value),
      sources: {
        model: embeddingModel.source,
        baseUrl: embeddingBaseUrl.source,
        apiKey: embeddingApiKey.source,
      },
    },
    rerank: {
      model: rerankModel.value,
      baseUrl: rerankBaseUrl.value,
      apiKey: rerankApiKey.value,
      apiKeyAvailable: Boolean(rerankApiKey.value),
      sources: {
        model: rerankModel.source,
        baseUrl: rerankBaseUrl.source,
        apiKey: rerankApiKey.source,
      },
    },
  };
}

export async function getResolvedLlmConfig(): Promise<ResolvedLlmConfig> {
  const { record } = await getPersistedLlmSettings();
  return resolveLlmConfigFromRecord(record);
}

function buildSecretState({
  directValue,
  envValue,
  inheritedValue,
  inherited,
  requiresMasterKey,
}: {
  directValue?: string | null;
  envValue?: string;
  inheritedValue?: string | null;
  inherited?: boolean;
  requiresMasterKey?: boolean;
}): AdminSecretState {
  if (inherited) {
    if (inheritedValue) {
      return { hasValue: true, maskedValue: maskSecret(inheritedValue), source: "inherited" };
    }
    return { hasValue: false, maskedValue: null, source: "missing" };
  }

  if (directValue) {
    return {
      hasValue: true,
      maskedValue: maskSecret(directValue),
      source: "db",
      requiresMasterKey: requiresMasterKey ? true : undefined,
    };
  }

  if (requiresMasterKey) {
    return {
      hasValue: true,
      maskedValue: null,
      source: "db",
      requiresMasterKey: true,
    };
  }

  if (envValue) {
    return { hasValue: true, maskedValue: maskSecret(envValue), source: "env" };
  }

  return { hasValue: false, maskedValue: null, source: "missing" };
}

async function getIndexedEmbeddingModelState(preferredModel?: string | null) {
  await ensureDbReady();
  const rows = await db
    .select({
      modelName: postEmbeddings.modelName,
      count: sql<number>`count(*)`,
      latestUpdatedAt: sql<number>`max(${postEmbeddings.updatedAt})`,
      oldestUpdatedAt: sql<number>`min(${postEmbeddings.updatedAt})`,
    })
    .from(postEmbeddings)
    .groupBy(postEmbeddings.modelName)
    .orderBy(desc(sql`max(${postEmbeddings.updatedAt})`), desc(sql`count(*)`));

  const row =
    (preferredModel
      ? rows.find((candidate) => candidate.modelName === preferredModel)
      : undefined) ?? rows[0];
  if (!row) {
    return {
      modelName: null,
      latestUpdatedAt: null,
      oldestUpdatedAt: null,
    };
  }

  return {
    modelName: row.modelName,
    latestUpdatedAt: row.latestUpdatedAt ?? null,
    oldestUpdatedAt: row.oldestUpdatedAt ?? null,
  };
}

function toAdminChatSettings(record: LlmSettingsRecord, chatEnvApiKey?: string): AdminChatSettings {
  const chatSecret = readPersistedSecretValue(record.chat.apiKey);
  return {
    model: record.chat.model ?? "",
    baseUrl: record.chat.baseUrl ?? "",
    apiKey: buildSecretState({
      directValue: chatSecret.value,
      envValue: chatEnvApiKey,
      requiresMasterKey: chatSecret.requiresMasterKey,
    }),
  };
}

function toAdminInheritedTierSettings({
  tier,
  inheritedApiKey,
  envApiKey,
}: {
  tier: ChildTierRecord;
  inheritedApiKey: string | null;
  envApiKey?: string;
}): AdminInheritedTierSettings {
  const secret = readPersistedSecretValue(tier.apiKey);
  const useCustomProvider = tier.baseUrlMode === "custom" || tier.apiKeyMode === "custom";
  return {
    model: tier.model ?? "",
    useCustomProvider,
    baseUrlMode: tier.baseUrlMode,
    baseUrl: tier.baseUrl ?? "",
    apiKeyMode: tier.apiKeyMode,
    apiKey: buildSecretState({
      directValue: secret.value,
      envValue: envApiKey,
      inheritedValue: inheritedApiKey,
      inherited: tier.apiKeyMode === "inherit",
      requiresMasterKey: secret.requiresMasterKey,
    }),
  };
}

function areTierRecordsEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function getAdminLlmSettingsPayload(): Promise<AdminLlmSettingsPayload> {
  const { record, updatedAt } = await getPersistedLlmSettings();
  const resolved = resolveLlmConfigFromRecord(record);
  const chatEnv = getChatEnvDefaults();
  const embeddingEnv = getEmbeddingEnvDefaults();
  const rerankEnv = getRerankEnvDefaults();
  const indexState = await getIndexedEmbeddingModelState(resolved.embedding.model);

  const embeddingConfigUpdatedAt = record.updatedAt.embedding ?? null;
  const embeddingReindexRequired = Boolean(
    indexState.modelName &&
      resolved.embedding.model &&
      indexState.modelName !== resolved.embedding.model
  );
  const embeddingReindexSuggested = Boolean(
    !embeddingReindexRequired &&
      indexState.modelName &&
      resolved.embedding.model &&
      indexState.modelName === resolved.embedding.model &&
      embeddingConfigUpdatedAt &&
      (!indexState.oldestUpdatedAt || embeddingConfigUpdatedAt > indexState.oldestUpdatedAt)
  );

  return {
    savedAt: updatedAt,
    settings: {
      chat: toAdminChatSettings(record, chatEnv.apiKey),
      embedding: toAdminInheritedTierSettings({
        tier: record.embedding,
        inheritedApiKey: resolved.chat.apiKey,
        envApiKey: embeddingEnv.apiKey,
      }),
      rerank: toAdminInheritedTierSettings({
        tier: record.rerank,
        inheritedApiKey: resolved.embedding.apiKey,
        envApiKey: rerankEnv.apiKey,
      }),
    },
    resolved: {
      chat: {
        model: resolved.chat.model,
        baseUrl: resolved.chat.baseUrl,
        apiKeyAvailable: resolved.chat.apiKeyAvailable,
        sources: resolved.chat.sources,
      },
      embedding: {
        model: resolved.embedding.model,
        baseUrl: resolved.embedding.baseUrl,
        apiKeyAvailable: resolved.embedding.apiKeyAvailable,
        sources: resolved.embedding.sources,
      },
      rerank: {
        model: resolved.rerank.model,
        baseUrl: resolved.rerank.baseUrl,
        apiKeyAvailable: resolved.rerank.apiKeyAvailable,
        sources: resolved.rerank.sources,
      },
    },
    hints: {
      embeddingReindexRequired,
      embeddingReindexSuggested,
      currentIndexedModel: indexState.modelName,
      currentResolvedModel: resolved.embedding.model,
      currentIndexedUpdatedAt: indexState.latestUpdatedAt,
      embeddingConfigUpdatedAt,
    },
  };
}

function updateSecretPayload({
  existing,
  nextInput,
  clear,
}: {
  existing?: LlmSettingsRecord["chat"]["apiKey"];
  nextInput?: string;
  clear?: boolean;
}) {
  const trimmed = normalizeOptionalText(nextInput);
  if (clear && trimmed) {
    throw new LlmSettingsInputError("Cannot replace and clear the same API key in one request");
  }
  if (clear) {
    return null;
  }
  if (trimmed) {
    return encryptSecret(trimmed);
  }
  return existing ?? null;
}

function assertApiKeyProvidedForConfiguredBaseUrl({
  label,
  baseUrl,
  apiKeyAvailable,
}: {
  label: string;
  baseUrl: string | undefined;
  apiKeyAvailable: boolean;
}) {
  if (normalizeOptionalText(baseUrl) && !apiKeyAvailable) {
    throw new LlmSettingsInputError(`${label} 填写了 baseURL 时，必须同时提供 API Key`);
  }
}

function assertIndependentProviderConfigured({
  label,
  useCustomProvider,
  baseUrl,
  customApiKeyAvailable,
}: {
  label: string;
  useCustomProvider: boolean;
  baseUrl?: string;
  customApiKeyAvailable: boolean;
}) {
  if (!useCustomProvider) return;
  if (!baseUrl) {
    throw new LlmSettingsInputError(`${label} 开启高级设置后，baseURL 为必填项`);
  }
  if (!customApiKeyAvailable) {
    throw new LlmSettingsInputError(`${label} 开启高级设置后，API Key 为必填项`);
  }
}

function buildNextChatRecord(
  record: LlmSettingsRecord,
  parsed: AdminLlmSettingsUpdateInput
): LlmSettingsRecord["chat"] {
  return {
    model: normalizeOptionalText(parsed.chat.model),
    baseUrl: normalizeValidatedBaseUrl("对话模型 baseURL", parsed.chat.baseUrl),
    apiKey: updateSecretPayload({
      existing: record.chat.apiKey,
      nextInput: parsed.chat.apiKeyInput,
      clear: parsed.chat.clearApiKey,
    }),
  };
}

function buildNextChildTierRecord({
  label,
  current,
  input,
}: {
  label: string;
  current: ChildTierRecord;
  input: AdminLlmSettingsUpdateInput["embedding"] | AdminLlmSettingsUpdateInput["rerank"];
}) {
  const useCustomProvider = input.useCustomProvider;

  return {
    record: {
      model: normalizeOptionalText(input.model),
      baseUrlMode: useCustomProvider ? "custom" : "inherit",
      // Intentionally preserve the last custom provider fields when operators switch the tier
      // back to inherited mode. The advanced toggle decides whether those fields are active;
      // previously saved values stay available if the operator re-enables advanced settings.
      baseUrl: useCustomProvider
        ? normalizeValidatedBaseUrl(`${label} baseURL`, input.baseUrl)
        : current.baseUrl,
      apiKeyMode: useCustomProvider ? "custom" : "inherit",
      apiKey: useCustomProvider
        ? updateSecretPayload({
            existing: current.apiKey,
            nextInput: input.apiKeyInput,
            clear: input.clearApiKey,
          })
        : current.apiKey,
    } satisfies ChildTierRecord,
    useCustomProvider,
  };
}

function buildNextRecordFromInput(
  record: LlmSettingsRecord,
  input: AdminLlmSettingsUpdateInput,
  options?: { validateAllTiers?: boolean }
): {
  record: LlmSettingsRecord;
  resolved: ResolvedLlmConfig;
  nextEmbeddingState: ReturnType<typeof buildNextChildTierRecord>;
  nextRerankState: ReturnType<typeof buildNextChildTierRecord>;
} {
  const parsed = adminLlmSettingsUpdateSchema.parse(input);

  const nextChat = buildNextChatRecord(record, parsed);
  const nextEmbeddingState = buildNextChildTierRecord({
    label: "嵌入模型",
    current: record.embedding,
    input: parsed.embedding,
  });
  const nextRerankState = buildNextChildTierRecord({
    label: "重排序模型",
    current: record.rerank,
    input: parsed.rerank,
  });

  const nextRecord: LlmSettingsRecord = {
    schemaVersion: 1,
    updatedAt: record.updatedAt,
    chat: nextChat,
    embedding: nextEmbeddingState.record,
    rerank: nextRerankState.record,
  };
  const nextResolved = resolveLlmConfigFromRecord(nextRecord);

  if (options?.validateAllTiers !== false) {
    const embeddingCustomSecret = readPersistedSecretValue(nextRecord.embedding.apiKey).value;
    const rerankCustomSecret = readPersistedSecretValue(nextRecord.rerank.apiKey).value;

    assertApiKeyProvidedForConfiguredBaseUrl({
      label: "对话模型",
      baseUrl: nextChat.baseUrl,
      apiKeyAvailable: nextResolved.chat.apiKeyAvailable,
    });
    assertIndependentProviderConfigured({
      label: "嵌入模型",
      useCustomProvider: nextEmbeddingState.useCustomProvider,
      baseUrl: nextRecord.embedding.baseUrl,
      customApiKeyAvailable: Boolean(embeddingCustomSecret),
    });
    assertIndependentProviderConfigured({
      label: "重排序模型",
      useCustomProvider: nextRerankState.useCustomProvider,
      baseUrl: nextRecord.rerank.baseUrl,
      customApiKeyAvailable: Boolean(rerankCustomSecret),
    });
  }

  return {
    record: nextRecord,
    resolved: nextResolved,
    nextEmbeddingState,
    nextRerankState,
  };
}

function buildNextRecordWithTimestamps({
  currentRecord,
  nextRecord,
  previousResolved,
  nextResolved,
}: {
  currentRecord: LlmSettingsRecord;
  nextRecord: LlmSettingsRecord;
  previousResolved: ResolvedLlmConfig;
  nextResolved: ResolvedLlmConfig;
}) {
  const now = Date.now();
  return {
    schemaVersion: 1,
    updatedAt: {
      chat: areTierRecordsEqual(previousResolved.chat, nextResolved.chat)
        ? (currentRecord.updatedAt.chat ?? null)
        : now,
      embedding: areTierRecordsEqual(previousResolved.embedding, nextResolved.embedding)
        ? (currentRecord.updatedAt.embedding ?? null)
        : now,
      rerank: areTierRecordsEqual(previousResolved.rerank, nextResolved.rerank)
        ? (currentRecord.updatedAt.rerank ?? null)
        : now,
    },
    chat: nextRecord.chat,
    embedding: nextRecord.embedding,
    rerank: nextRecord.rerank,
  } satisfies LlmSettingsRecord;
}

async function runLlmConnectionTest({
  tier,
  resolved,
}: {
  tier: "chat" | "embedding" | "rerank";
  resolved: ResolvedTierConfig;
}): Promise<AdminLlmSettingsTestResponse> {
  if (!resolved.model) {
    throw new LlmSettingsInputError("请先选择要测试的模型");
  }
  if (!resolved.baseUrl) {
    throw new LlmSettingsInputError("请先提供可用的 baseURL");
  }
  if (!resolved.apiKey) {
    throw new LlmSettingsInputError("请先提供可用的 API Key");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${resolved.apiKey}`,
  };
  const timeoutMs = getPositiveIntEnv("LLM_SETTINGS_TEST_TIMEOUT_MS", DEFAULT_LLM_TEST_TIMEOUT_MS);

  if (tier === "chat") {
    const response = await fetchWithTimeout(
      `${resolved.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: resolved.model,
          messages: [{ role: "user", content: "Reply with pong." }],
          max_tokens: 8,
          temperature: 0,
        }),
      },
      timeoutMs,
      "对话模型测试超时"
    );
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`对话模型测试失败：${response.status} ${response.statusText} ${details}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim() || "(empty)";
    return {
      tier,
      ok: true,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      summary: "对话模型测试通过",
      details: [`模型：${resolved.model}`, `返回内容：${content}`],
    };
  }

  if (tier === "embedding") {
    const response = await fetchWithTimeout(
      `${resolved.baseUrl}/embeddings`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: resolved.model,
          input: "ping",
        }),
      },
      timeoutMs,
      "嵌入模型测试超时"
    );
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`嵌入模型测试失败：${response.status} ${response.statusText} ${details}`);
    }
    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const dimension = payload.data?.[0]?.embedding?.length ?? 0;
    if (!dimension) {
      throw new Error("嵌入模型测试失败：响应里没有可用向量");
    }
    return {
      tier,
      ok: true,
      model: resolved.model,
      baseUrl: resolved.baseUrl,
      summary: "嵌入模型测试通过",
      details: [`模型：${resolved.model}`, `向量维度：${dimension}`],
    };
  }

  const response = await fetchWithTimeout(
    `${resolved.baseUrl}/rerank`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: resolved.model,
        query: "test query",
        documents: ["first document", "second document"],
        top_n: 2,
      }),
    },
    timeoutMs,
    "重排序模型测试超时"
  );
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`重排序模型测试失败：${response.status} ${response.statusText} ${details}`);
  }
  const payload = (await response.json()) as {
    data?: Array<{ index?: number; score?: number }>;
  };
  const first = payload.data?.[0];
  return {
    tier,
    ok: true,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    summary: "重排序模型测试通过",
    details: [
      `模型：${resolved.model}`,
      `返回条目：${payload.data?.length ?? 0}`,
      first && typeof first.score === "number" ? `最高分：${first.score}` : "已返回排序结果",
    ],
  };
}

export async function updateAdminLlmSettings(input: AdminLlmSettingsUpdateInput) {
  const { record } = await getPersistedLlmSettings();
  const previousResolved = resolveLlmConfigFromRecord(record);
  const prepared = buildNextRecordFromInput(record, input);
  const next = buildNextRecordWithTimestamps({
    currentRecord: record,
    nextRecord: prepared.record,
    previousResolved,
    nextResolved: prepared.resolved,
  });

  await savePersistedLlmSettings(next);
  return getAdminLlmSettingsPayload();
}

export async function testAdminLlmSettings(
  tier: "chat" | "embedding" | "rerank",
  input: AdminLlmSettingsUpdateInput
) {
  const { record } = await getPersistedLlmSettings();
  const prepared = buildNextRecordFromInput(record, input, { validateAllTiers: false });
  if (tier === "embedding" && prepared.nextEmbeddingState.useCustomProvider) {
    const embeddingCustomSecret = readPersistedSecretValue(prepared.record.embedding.apiKey).value;
    assertIndependentProviderConfigured({
      label: "嵌入模型",
      useCustomProvider: true,
      baseUrl: prepared.record.embedding.baseUrl,
      customApiKeyAvailable: Boolean(embeddingCustomSecret),
    });
  }
  if (tier === "rerank") {
    if (prepared.nextRerankState.useCustomProvider) {
      const rerankCustomSecret = readPersistedSecretValue(prepared.record.rerank.apiKey).value;
      assertIndependentProviderConfigured({
        label: "重排序模型",
        useCustomProvider: true,
        baseUrl: prepared.record.rerank.baseUrl,
        customApiKeyAvailable: Boolean(rerankCustomSecret),
      });
    } else if (prepared.nextEmbeddingState.useCustomProvider) {
      const embeddingCustomSecret = readPersistedSecretValue(
        prepared.record.embedding.apiKey
      ).value;
      assertIndependentProviderConfigured({
        label: "嵌入模型",
        useCustomProvider: true,
        baseUrl: prepared.record.embedding.baseUrl,
        customApiKeyAvailable: Boolean(embeddingCustomSecret),
      });
    }
  }
  return runLlmConnectionTest({
    tier,
    resolved: prepared.resolved[tier],
  });
}
