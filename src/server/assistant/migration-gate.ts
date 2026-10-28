import { eq, sql } from "drizzle-orm";
import { ASSISTANT_DISCUSSION_MIGRATION_ID } from "@/lib/assistant-discussion-migration";
import { db, initializeDB } from "@/lib/db";
import { assistantConversations, assistantMigrationState, memoClippings } from "@/lib/schema";

export type AssistantMigrationGate = {
  ready: boolean;
  status: "not-needed" | "pending" | "running" | "blocked" | "complete";
  reason: string | null;
};

function hasLegacyJobConversationReference(versions: unknown) {
  if (versions === undefined) return false;
  if (!Array.isArray(versions)) return true;
  return versions.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
    const jobConversationId = (entry as Record<string, unknown>).jobConversationId;
    if (jobConversationId === undefined || jobConversationId === null) return false;
    return true;
  });
}

function hasLegacyConversationReference(row: {
  conversationId: string | null;
  manifest?: string;
  previousConversations?: unknown;
  versions?: unknown;
}) {
  if (row.conversationId !== null) return true;
  if (row.previousConversations !== undefined) {
    if (!Array.isArray(row.previousConversations)) return true;
    if (row.previousConversations.length > 0) return true;
  }
  if (row.manifest === undefined) {
    if (!("previousConversations" in row && row.previousConversations !== undefined)) return true;
    return hasLegacyJobConversationReference(row.versions);
  }
  try {
    const manifest: unknown = JSON.parse(row.manifest);
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return true;
    const record = manifest as Record<string, unknown>;
    if (!("conversationId" in record) || !("previousConversations" in record)) return true;
    if ("conversationId" in record) {
      if (record.conversationId !== null && typeof record.conversationId !== "string") return true;
      if (typeof record.conversationId === "string" && record.conversationId.trim()) return true;
    }
    if (!("previousConversations" in record)) return false;
    if (!Array.isArray(record.previousConversations)) return true;
    const malformed = record.previousConversations.some((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return true;
      const conversationId = (entry as Record<string, unknown>).conversationId;
      return typeof conversationId !== "string" || !conversationId.trim();
    });
    if (malformed || record.previousConversations.length > 0) return true;
    return hasLegacyJobConversationReference(record.versions);
  } catch {
    return true;
  }
}

function isMissingTable(error: unknown) {
  return error instanceof Error && /no such table:/iu.test(error.message);
}

type MigrationGateOptions = {
  manifests?: Array<{
    conversationId: string | null;
    previousConversations: unknown;
    versions?: unknown;
  }>;
};

/** Old Pi-backed discussions must be backfilled before the unified clipping chat is exposed. */
export async function readAssistantMigrationGate(
  options: MigrationGateOptions = {}
): Promise<AssistantMigrationGate> {
  await initializeDB();
  if (!db) {
    return { ready: false, status: "pending", reason: "assistant-database-unavailable" };
  }

  const requiredTables = [
    "frontend_users",
    "memo_clippings",
    "assistant_conversations",
    "assistant_messages",
    "assistant_message_citations",
    "assistant_generation_jobs",
    "assistant_migration_state",
    "ai_usage_records",
    "ai_usage_daily_summaries",
    "assistant_quota_policies",
    "assistant_quota_resets",
  ];
  const tableRows = await db.all<{ name: string }>(sql`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${sql.join(
      requiredTables.map((name) => sql`${name}`),
      sql`, `
    )})
  `);
  if (tableRows.length !== requiredTables.length)
    return { ready: false, status: "pending", reason: "assistant-schema-required" };

  try {
    await db.select({ id: assistantConversations.id }).from(assistantConversations).limit(1).get();
  } catch (error) {
    if (isMissingTable(error)) {
      return { ready: false, status: "pending", reason: "assistant-schema-required" };
    }
    throw error;
  }

  let state: typeof assistantMigrationState.$inferSelect | undefined;
  try {
    state = await db
      .select()
      .from(assistantMigrationState)
      .where(eq(assistantMigrationState.id, ASSISTANT_DISCUSSION_MIGRATION_ID))
      .get();
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  if (state?.status === "complete") return { ready: true, status: "complete", reason: null };
  if (state) {
    return {
      ready: false,
      status: state.status,
      reason: state.lastError ?? "assistant-discussion-migration-incomplete",
    };
  }

  let legacy: Array<{ conversationId: string | null; manifest: string }>;
  try {
    legacy = await db
      .select({ conversationId: memoClippings.conversationId, manifest: memoClippings.manifest })
      .from(memoClippings)
      .all();
  } catch (error) {
    if (isMissingTable(error))
      return { ready: false, status: "pending", reason: "clipping-schema-required" };
    throw error;
  }
  if (
    !legacy.some(hasLegacyConversationReference) &&
    !options.manifests?.some((manifest) => hasLegacyConversationReference(manifest))
  )
    return { ready: true, status: "not-needed", reason: null };
  return {
    ready: false,
    status: "pending",
    reason: "assistant-discussion-migration-required",
  };
}
