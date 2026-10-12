import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import { searchSettings } from "@/lib/schema";
import { NAME_POLICY_VERSION } from "@/lib/search/native-query";
import {
  type AdminSearchSettings,
  type AiSearchMode,
  DEFAULT_SEARCH_POLICY,
  type SearchPolicy,
  type SearchReason,
  type SearchSettings,
  searchPolicySchema,
} from "@/lib/search/settings";
import { getResolvedLlmConfig, type ResolvedTierConfig } from "./llm-settings";
import { SEARCH_MODEL_PROMPTS } from "./search-model";
import { SEARCH_RETRIEVAL_VERSION } from "./search-ranking";

export const SEARCH_PROMPT_VERSION = "search-list-v1";
export const SEARCH_QUALITY_VERSION = {
  rag: "synthetic-search-v2",
  rewrite: "synthetic-retrieval-v3",
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export async function readSearchSettings(): Promise<SearchSettings> {
  await initializeDB();
  const row = await db.select().from(searchSettings).where(eq(searchSettings.id, "default")).get();
  if (!row) return { policy: structuredClone(DEFAULT_SEARCH_POLICY), quality: {} };
  const parsed: SearchSettings = JSON.parse(row.config);
  return { ...parsed, policy: searchPolicySchema.parse(parsed.policy) };
}
export type ResolvedSearchPolicy = {
  policy: SearchPolicy[AiSearchMode];
  reason?: SearchReason;
  chat?: ResolvedTierConfig;
  resolved?: Awaited<ReturnType<typeof getResolvedLlmConfig>>;
  fingerprint?: string;
};
export async function resolveSearchPolicy(
  mode: AiSearchMode,
  settings?: SearchSettings
): Promise<ResolvedSearchPolicy> {
  const stored = settings ?? (await readSearchSettings());
  const policy = stored.policy[mode];
  if (!policy.enabled) return { policy, reason: "disabled" as const };
  let resolved: Awaited<ReturnType<typeof getResolvedLlmConfig>>;
  try {
    resolved = await getResolvedLlmConfig();
  } catch {
    return { policy, reason: "unconfigured" as const };
  }
  const chat = { ...resolved.chat, model: policy.model ?? resolved.chat.model };
  if (!chat.apiKey || !chat.baseUrl || !chat.model)
    return { policy, reason: "unconfigured" as const };
  if (
    mode === "rag" &&
    (!resolved.embedding.apiKey || !resolved.embedding.baseUrl || !resolved.embedding.model)
  )
    return { policy, reason: "unconfigured" as const };
  const fingerprint = hash(
    JSON.stringify({
      mode,
      policy,
      chat: { model: chat.model, baseUrl: chat.baseUrl, key: hash(chat.apiKey) },
      ...(mode === "rag"
        ? {
            embedding: {
              model: resolved.embedding.model,
              baseUrl: resolved.embedding.baseUrl,
              key: hash(resolved.embedding.apiKey ?? ""),
            },
          }
        : {}),
      prompt: { version: SEARCH_PROMPT_VERSION, content: SEARCH_MODEL_PROMPTS[mode] },
      quality: SEARCH_QUALITY_VERSION[mode],
      names: NAME_POLICY_VERSION,
      retrieval: SEARCH_RETRIEVAL_VERSION,
    })
  );
  const quality = stored.quality[mode];
  return {
    policy,
    chat,
    resolved,
    fingerprint,
    ...(!quality?.passed || quality.fingerprint !== fingerprint
      ? { reason: "unvalidated" as const }
      : {}),
  };
}
export async function getAdminSearchSettings(): Promise<AdminSearchSettings> {
  const settings = await readSearchSettings();
  const [rag, rewrite] = await Promise.all([
    resolveSearchPolicy("rag", settings),
    resolveSearchPolicy("rewrite", settings),
  ]);
  return {
    ...settings,
    status: {
      rag: { available: !rag.reason, reason: rag.reason },
      rewrite: { available: !rewrite.reason, reason: rewrite.reason },
    },
  };
}
export async function saveSearchPolicy(input: unknown) {
  const policy = searchPolicySchema.parse(input);
  const previous = await readSearchSettings();
  const quality = { ...previous.quality };
  for (const mode of ["rag", "rewrite"] as const)
    if (JSON.stringify(policy[mode]) !== JSON.stringify(previous.policy[mode]))
      delete quality[mode];
  await db
    .insert(searchSettings)
    .values({ id: "default", config: JSON.stringify({ policy, quality }), updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: searchSettings.id,
      set: { config: JSON.stringify({ policy, quality }), updatedAt: Date.now() },
    });
  return getAdminSearchSettings();
}
/** Compare and save synchronously in the SQLite transaction, so a stale run cannot bless a new policy. */
export async function recordSearchQuality(
  mode: AiSearchMode,
  fingerprint: string,
  passed: boolean
) {
  const current = await resolveSearchPolicy(mode);
  if (current.fingerprint !== fingerprint) return false;
  const settings = await readSearchSettings();
  const expectedPolicy = JSON.stringify(settings.policy);
  const saved = db.transaction((tx) => {
    const row = tx.select().from(searchSettings).where(eq(searchSettings.id, "default")).get();
    const latest: SearchSettings = row
      ? JSON.parse(row.config)
      : { policy: structuredClone(DEFAULT_SEARCH_POLICY), quality: {} };
    if (JSON.stringify(latest.policy) !== expectedPolicy) return false;
    latest.quality[mode] = { fingerprint, passed, validatedAt: Date.now() };
    tx.insert(searchSettings)
      .values({ id: "default", config: JSON.stringify(latest), updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: searchSettings.id,
        set: { config: JSON.stringify(latest), updatedAt: Date.now() },
      })
      .run();
    return true;
  });
  return saved;
}
