import { z } from "zod";

export const llmTierSchema = z.enum(["chat", "embedding", "rerank"]);
export type LlmTier = z.infer<typeof llmTierSchema>;

export const inheritModeSchema = z.enum(["inherit", "custom"]);
export type InheritMode = z.infer<typeof inheritModeSchema>;

export const modelCapabilitySchema = z.enum([
  "chat",
  "embeddings",
  "rerank",
  "vision",
  "audio",
  "tools",
  "structured-output",
]);
export type ModelCapability = z.infer<typeof modelCapabilitySchema>;

export const encryptedSecretPayloadSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal("aes-256-gcm"),
  keyDerivation: z.literal("sha256-utf8"),
  iv: z.string().min(1),
  tag: z.string().min(1),
  ciphertext: z.string().min(1),
});
export type EncryptedSecretPayload = z.infer<typeof encryptedSecretPayloadSchema>;

export const persistedChatSettingsSchema = z.object({
  model: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().min(1).optional(),
  apiKey: encryptedSecretPayloadSchema.nullable().optional(),
});
export type PersistedChatSettings = z.infer<typeof persistedChatSettingsSchema>;

export const persistedInheritedTierSettingsSchema = z.object({
  model: z.string().trim().min(1).optional(),
  baseUrlMode: inheritModeSchema.default("inherit"),
  baseUrl: z.string().trim().min(1).optional(),
  apiKeyMode: inheritModeSchema.default("inherit"),
  apiKey: encryptedSecretPayloadSchema.nullable().optional(),
});
export type PersistedInheritedTierSettings = z.infer<typeof persistedInheritedTierSettingsSchema>;

export const settingsTierUpdatedAtSchema = z.object({
  chat: z.number().nullable().default(null),
  embedding: z.number().nullable().default(null),
  rerank: z.number().nullable().default(null),
});
export type SettingsTierUpdatedAt = z.infer<typeof settingsTierUpdatedAtSchema>;

export const llmSettingsRecordSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  updatedAt: settingsTierUpdatedAtSchema.default({
    chat: null,
    embedding: null,
    rerank: null,
  }),
  chat: persistedChatSettingsSchema.default({}),
  embedding: persistedInheritedTierSettingsSchema.default({}),
  rerank: persistedInheritedTierSettingsSchema.default({}),
});
export type LlmSettingsRecord = z.infer<typeof llmSettingsRecordSchema>;

export function createEmptyLlmSettingsRecord(): LlmSettingsRecord {
  return llmSettingsRecordSchema.parse({
    schemaVersion: 1,
    updatedAt: {
      chat: null,
      embedding: null,
      rerank: null,
    },
    chat: {},
    embedding: {},
    rerank: {},
  });
}

export const adminSecretStateSchema = z.object({
  hasValue: z.boolean(),
  maskedValue: z.string().nullable(),
  source: z.enum(["db", "env", "inherited", "missing"]),
  requiresMasterKey: z.boolean().optional(),
});
export type AdminSecretState = z.infer<typeof adminSecretStateSchema>;

export const resolvedValueSourceSchema = z.enum(["db", "env", "default", "inherited", "missing"]);
export type ResolvedValueSource = z.infer<typeof resolvedValueSourceSchema>;

export const adminChatSettingsSchema = z.object({
  model: z.string(),
  baseUrl: z.string(),
  apiKey: adminSecretStateSchema,
});
export type AdminChatSettings = z.infer<typeof adminChatSettingsSchema>;

export const adminInheritedTierSettingsSchema = z.object({
  model: z.string(),
  useCustomProvider: z.boolean().default(false),
  baseUrlMode: inheritModeSchema,
  baseUrl: z.string(),
  apiKeyMode: inheritModeSchema,
  apiKey: adminSecretStateSchema,
});
export type AdminInheritedTierSettings = z.infer<typeof adminInheritedTierSettingsSchema>;

export const resolvedTierSummarySchema = z.object({
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  apiKeyAvailable: z.boolean(),
  sources: z.object({
    model: resolvedValueSourceSchema,
    baseUrl: resolvedValueSourceSchema,
    apiKey: resolvedValueSourceSchema,
  }),
});
export type ResolvedTierSummary = z.infer<typeof resolvedTierSummarySchema>;

export const adminLlmSettingsPayloadSchema = z.object({
  savedAt: z.number().nullable(),
  settings: z.object({
    chat: adminChatSettingsSchema,
    embedding: adminInheritedTierSettingsSchema,
    rerank: adminInheritedTierSettingsSchema,
  }),
  resolved: z.object({
    chat: resolvedTierSummarySchema,
    embedding: resolvedTierSummarySchema,
    rerank: resolvedTierSummarySchema,
  }),
  hints: z.object({
    embeddingReindexRequired: z.boolean(),
    embeddingReindexSuggested: z.boolean(),
    currentIndexedModel: z.string().nullable(),
    currentResolvedModel: z.string().nullable(),
    currentIndexedUpdatedAt: z.number().nullable(),
    embeddingConfigUpdatedAt: z.number().nullable(),
  }),
});
export type AdminLlmSettingsPayload = z.infer<typeof adminLlmSettingsPayloadSchema>;

export const adminLlmSettingsUpdateSchema = z.object({
  chat: z.object({
    model: z.string(),
    baseUrl: z.string(),
    apiKeyInput: z.string().optional(),
    clearApiKey: z.boolean().optional(),
  }),
  embedding: z.object({
    model: z.string(),
    useCustomProvider: z.boolean().default(false),
    baseUrlMode: inheritModeSchema,
    baseUrl: z.string(),
    apiKeyMode: inheritModeSchema,
    apiKeyInput: z.string().optional(),
    clearApiKey: z.boolean().optional(),
  }),
  rerank: z.object({
    model: z.string(),
    useCustomProvider: z.boolean().default(false),
    baseUrlMode: inheritModeSchema,
    baseUrl: z.string(),
    apiKeyMode: inheritModeSchema,
    apiKeyInput: z.string().optional(),
    clearApiKey: z.boolean().optional(),
  }),
});
export type AdminLlmSettingsUpdateInput = z.infer<typeof adminLlmSettingsUpdateSchema>;

export const adminLlmSettingsTestRequestSchema = z.object({
  tier: llmTierSchema,
  settings: adminLlmSettingsUpdateSchema,
});
export type AdminLlmSettingsTestRequest = z.infer<typeof adminLlmSettingsTestRequestSchema>;

export const adminLlmSettingsTestResponseSchema = z.object({
  tier: llmTierSchema,
  ok: z.boolean(),
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  summary: z.string(),
  details: z.array(z.string()),
});
export type AdminLlmSettingsTestResponse = z.infer<typeof adminLlmSettingsTestResponseSchema>;

export const modelCatalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  contextLength: z.number().int().positive().nullable(),
  capabilities: z.array(modelCapabilitySchema),
  availableOnProvider: z.boolean().nullable(),
  source: z.enum(["openrouter", "fallback", "curated", "provider"]),
});
export type ModelCatalogEntry = z.infer<typeof modelCatalogEntrySchema>;

export const adminLlmCatalogResponseSchema = z.object({
  generatedAt: z.string().nullable(),
  source: z.enum(["generated", "fallback", "mixed"]),
  items: z.array(modelCatalogEntrySchema),
});
export type AdminLlmCatalogResponse = z.infer<typeof adminLlmCatalogResponseSchema>;

export const MODEL_CAPABILITY_LABELS: Record<ModelCapability, string> = {
  chat: "chat/text",
  embeddings: "embeddings",
  rerank: "rerank",
  vision: "vision",
  audio: "audio",
  tools: "tools",
  "structured-output": "structured-output",
};
