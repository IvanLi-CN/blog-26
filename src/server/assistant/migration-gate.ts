import { eq } from "drizzle-orm";
import { ASSISTANT_DISCUSSION_MIGRATION_ID } from "@/lib/assistant-discussion-migration";
import { db, initializeDB } from "@/lib/db";
import { assistantConversations, assistantMigrationState, memoClippings } from "@/lib/schema";

export type AssistantMigrationGate = {
  ready: boolean;
  status: "not-needed" | "pending" | "running" | "blocked" | "complete";
  reason: string | null;
};

function hasLegacyConversationReference(row: {
  conversationId: string | null;
  manifest?: string;
  previousConversations?: Array<{ conversationId: string }>;
}) {
  if (row.conversationId) return true;
  if (row.previousConversations?.length) return true;
  if (row.manifest === undefined) return false;
  try {
    const manifest = JSON.parse(row.manifest) as {
      conversationId?: unknown;
      previousConversations?: unknown;
    };
    return Boolean(
      manifest.conversationId ||
        (Array.isArray(manifest.previousConversations) && manifest.previousConversations.length)
    );
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
    previousConversations: Array<{ conversationId: string }>;
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
