import { eq } from "drizzle-orm";
import { ASSISTANT_DISCUSSION_MIGRATION_ID } from "@/lib/assistant-discussion-migration";
import { db, initializeDB } from "@/lib/db";
import { assistantMigrationState, memoClippings } from "@/lib/schema";

export type AssistantMigrationGate = {
  ready: boolean;
  status: "not-needed" | "pending" | "running" | "blocked" | "complete";
  reason: string | null;
};

function hasLegacyConversationReference(row: { conversationId: string | null; manifest: string }) {
  if (row.conversationId) return true;
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

/** Old Pi-backed discussions must be backfilled before the unified clipping chat is exposed. */
export async function readAssistantMigrationGate(): Promise<AssistantMigrationGate> {
  await initializeDB();
  if (!db) {
    return { ready: false, status: "pending", reason: "assistant-database-unavailable" };
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
    if (isMissingTable(error)) return { ready: true, status: "not-needed", reason: null };
    throw error;
  }
  if (!legacy.some(hasLegacyConversationReference))
    return { ready: true, status: "not-needed", reason: null };
  return {
    ready: false,
    status: "pending",
    reason: "assistant-discussion-migration-required",
  };
}
