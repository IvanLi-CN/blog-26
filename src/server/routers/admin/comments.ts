import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCommentMigrationReady } from "../../../lib/comment-migration";
import { db } from "../../../lib/db";
import { comments } from "../../../lib/schema";
import { adminProcedure, createTRPCRouter } from "../../trpc";

const statusSchema = z.enum(["all", "approved", "pending", "rejected", "deleted"]);

const getCommentsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: statusSchema.default("all"),
  targetType: z.enum(["article", "memo", "project"]).optional(),
  sortBy: z.enum(["createdAt", "authorName"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const updateCommentSchema = z.object({
  id: z.string(),
  content: z.string().trim().min(1).max(1000).optional(),
  authorName: z.string().trim().min(1).max(100).optional(),
  authorEmail: z.string().email().nullable().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  expectedRevision: z.number().int().positive().optional(),
  action: z.enum(["update", "restore"]).default("update"),
});

const deleteCommentSchema = z.object({
  id: z.string(),
  expectedRevision: z.number().int().positive().optional(),
});

async function updateRevision(
  id: string,
  expectedRevision: number | undefined,
  values: Partial<typeof comments.$inferInsert>
) {
  const existing = await db.select().from(comments).where(eq(comments.id, id)).get();
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
  if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
    throw new TRPCError({ code: "CONFLICT", message: "评论已被其他操作更新，请刷新后重试" });
  }
  const changedValues = Object.entries(values).filter(([, value]) => value !== undefined);
  if (
    changedValues.length === 0 ||
    changedValues.every(([key, value]) => (existing as Record<string, unknown>)[key] === value)
  ) {
    return existing;
  }
  const updated = await db
    .update(comments)
    .set({ ...values, revision: existing.revision + 1 })
    .where(and(eq(comments.id, id), eq(comments.revision, existing.revision)))
    .returning()
    .get();
  if (!updated)
    throw new TRPCError({ code: "CONFLICT", message: "评论已被其他操作更新，请刷新后重试" });
  return updated;
}

export const adminCommentsRouter = createTRPCRouter({
  list: adminProcedure.input(getCommentsSchema).query(async ({ input }) => {
    await assertCommentMigrationReady();
    const conditions = [];
    if (input.status === "deleted") conditions.push(sql`${comments.deletedAt} IS NOT NULL`);
    else if (input.status !== "all") conditions.push(eq(comments.status, input.status));
    if (input.status !== "deleted" && input.status !== "all")
      conditions.push(isNull(comments.deletedAt));
    if (input.targetType) conditions.push(eq(comments.targetType, input.targetType));
    if (input.search) {
      conditions.push(
        or(
          like(comments.content, `%${input.search}%`),
          like(comments.authorName, `%${input.search}%`),
          like(comments.authorEmail, `%${input.search}%`)
        )
      );
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;
    const sortField = input.sortBy === "createdAt" ? comments.createdAt : comments.authorName;
    const rows = await db
      .select()
      .from(comments)
      .where(whereClause)
      .orderBy(input.sortOrder === "desc" ? desc(sortField) : asc(sortField))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit)
      .all();
    const total =
      (await db.select({ count: sql<number>`count(*)` }).from(comments).where(whereClause).get())
        ?.count || 0;
    return {
      comments: rows.map((row) => ({ ...row, deleted: Boolean(row.deletedAt) })),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / input.limit)),
      },
    };
  }),

  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    await assertCommentMigrationReady();
    const comment = await db.select().from(comments).where(eq(comments.id, input.id)).get();
    if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
    return { ...comment, deleted: Boolean(comment.deletedAt) };
  }),

  update: adminProcedure.input(updateCommentSchema).mutation(async ({ input }) => {
    await assertCommentMigrationReady();
    const existing = await db.select().from(comments).where(eq(comments.id, input.id)).get();
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
    if (input.action === "restore") {
      if (!existing.deletedAt) return { success: true, message: "评论无需恢复" };
      await updateRevision(input.id, input.expectedRevision, {
        deletedAt: null,
        status: existing.authorRole === "admin" ? "approved" : "pending",
      });
      return {
        success: true,
        message:
          existing.authorRole === "admin" ? "管理员评论已恢复并公开" : "评论已恢复并进入待审",
      };
    }
    if (existing.deletedAt && input.status === "approved") {
      throw new TRPCError({ code: "CONFLICT", message: "已删除评论不能直接通过" });
    }
    if (existing.authorRole === "admin" && input.status && input.status !== "approved") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "管理员评论只能保持已公开状态" });
    }
    const { id: _id, expectedRevision: _expectedRevision, action: _action, ...values } = input;
    await updateRevision(input.id, input.expectedRevision, values);
    return { success: true, message: "评论更新成功" };
  }),

  delete: adminProcedure.input(deleteCommentSchema).mutation(async ({ input }) => {
    await assertCommentMigrationReady();
    const existing = await db.select().from(comments).where(eq(comments.id, input.id)).get();
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
    if (!existing.deletedAt)
      await updateRevision(input.id, input.expectedRevision, { deletedAt: Date.now() });
    return { success: true, message: "评论已软删除" };
  }),

  batchUpdate: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1),
        action: z.enum(["approve", "reject", "pending", "delete", "restore"]),
        expectedRevisions: z.record(z.string(), z.number().int().positive()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await assertCommentMigrationReady();
      const results = [];
      for (const id of new Set(input.ids)) {
        const row = await db.select().from(comments).where(eq(comments.id, id)).get();
        if (!row) {
          results.push({ id, result: "failed", reason: "not_found" });
          continue;
        }
        if (input.action === "delete") {
          if (row.deletedAt) results.push({ id, result: "skipped", reason: "deleted" });
          else {
            try {
              await updateRevision(id, input.expectedRevisions?.[id] ?? row.revision, {
                deletedAt: Date.now(),
              });
              results.push({ id, result: "success" });
            } catch (error) {
              results.push({
                id,
                result: "failed",
                reason: error instanceof TRPCError ? error.code.toLowerCase() : "error",
              });
            }
          }
          continue;
        }
        if (input.action === "restore") {
          if (!row.deletedAt) results.push({ id, result: "skipped", reason: "not_deleted" });
          else {
            try {
              await updateRevision(id, input.expectedRevisions?.[id] ?? row.revision, {
                deletedAt: null,
                status: row.authorRole === "admin" ? "approved" : "pending",
              });
              results.push({ id, result: "success" });
            } catch (error) {
              results.push({
                id,
                result: "failed",
                reason: error instanceof TRPCError ? error.code.toLowerCase() : "error",
              });
            }
          }
          continue;
        }
        if (row.deletedAt) {
          results.push({ id, result: "skipped", reason: "deleted" });
          continue;
        }
        const targetStatus =
          input.action === "approve"
            ? "approved"
            : input.action === "reject"
              ? "rejected"
              : "pending";
        if (row.authorRole === "admin" && targetStatus !== "approved") {
          results.push({ id, result: "skipped", reason: "admin_always_approved" });
          continue;
        }
        if (row.status === targetStatus) {
          results.push({ id, result: "skipped", reason: "already_status" });
          continue;
        }
        try {
          await updateRevision(id, input.expectedRevisions?.[id] ?? row.revision, {
            status: targetStatus,
          });
          results.push({ id, result: "success" });
        } catch (error) {
          results.push({
            id,
            result: "failed",
            reason: error instanceof TRPCError ? error.code.toLowerCase() : "error",
          });
        }
      }
      return { success: true, results };
    }),
});
