import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { commentMigrationState } from "./schema";

export const COMMENT_MIGRATION_ID = "reader-comments";

export type CommentMigrationStatus = (typeof commentMigrationState.$inferSelect)["status"];

export async function getCommentMigrationState() {
  try {
    return await db
      .select()
      .from(commentMigrationState)
      .where(eq(commentMigrationState.id, COMMENT_MIGRATION_ID))
      .get();
  } catch {
    // A missing state table means the structural migration has not completed.
    return undefined;
  }
}

export async function assertCommentMigrationReady() {
  const state = await getCommentMigrationState();
  if (state?.status === "complete") return state;
  throw new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: "评论迁移尚未完成，请稍后再试",
  });
}
