import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../lib/db";
import { comments } from "../../../lib/schema";
import { adminProcedure, createTRPCRouter } from "../../trpc";

// 输入验证 schemas
const getCommentsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["all", "approved", "pending", "rejected"]).default("all"),
  sortBy: z.enum(["createdAt", "authorName"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const updateCommentSchema = z.object({
  id: z.string(),
  content: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().email().optional(),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
});

const deleteCommentSchema = z.object({
  id: z.string(),
});

export const adminCommentsRouter = createTRPCRouter({
  // 获取评论列表
  list: adminProcedure.input(getCommentsSchema).query(async ({ input }) => {
    const { page, limit, search, status, sortBy, sortOrder } = input;
    const offset = (page - 1) * limit;

    try {
      // 构建查询条件
      const conditions = [];

      // 搜索条件
      if (search) {
        conditions.push(
          or(
            like(comments.content, `%${search}%`),
            like(comments.authorName, `%${search}%`),
            like(comments.authorEmail, `%${search}%`)
          )
        );
      }

      // 状态过滤
      if (status === "approved") {
        conditions.push(eq(comments.status, "approved"));
      } else if (status === "pending") {
        conditions.push(eq(comments.status, "pending"));
      } else if (status === "rejected") {
        conditions.push(eq(comments.status, "rejected"));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // 排序字段映射
      const sortField = {
        createdAt: comments.createdAt,
        authorName: comments.authorName,
      }[sortBy];

      // 获取评论列表
      const commentsList = await db
        .select()
        .from(comments)
        .where(whereClause)
        .orderBy(sortOrder === "desc" ? desc(sortField) : sortField)
        .limit(limit)
        .offset(offset);

      // 获取总数
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(whereClause);

      const total = totalResult[0]?.count || 0;

      return {
        comments: commentsList,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("获取评论列表失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取评论列表失败",
      });
    }
  }),

  // 获取单个评论
  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    try {
      const comment = await db.select().from(comments).where(eq(comments.id, input.id)).get();

      if (!comment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "评论不存在",
        });
      }

      return comment;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("获取评论失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取评论失败",
      });
    }
  }),

  // 更新评论
  update: adminProcedure.input(updateCommentSchema).mutation(async ({ input }) => {
    const { id, ...updateData } = input;

    try {
      // 检查评论是否存在
      const existingComment = await db.select().from(comments).where(eq(comments.id, id)).get();

      if (!existingComment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "评论不存在",
        });
      }

      // 更新评论 - 注意：comments 表没有 updatedAt 字段
      const updatedData = {
        ...updateData,
      };

      await db.update(comments).set(updatedData).where(eq(comments.id, id));

      return {
        success: true,
        message: "评论更新成功",
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("更新评论失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "更新评论失败",
      });
    }
  }),

  // 删除评论
  delete: adminProcedure.input(deleteCommentSchema).mutation(async ({ input }) => {
    try {
      // 检查评论是否存在
      const existingComment = await db
        .select()
        .from(comments)
        .where(eq(comments.id, input.id))
        .get();

      if (!existingComment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "评论不存在",
        });
      }

      // 删除评论
      await db.delete(comments).where(eq(comments.id, input.id));

      return {
        success: true,
        message: "评论删除成功",
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("删除评论失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "删除评论失败",
      });
    }
  }),

  // 批量操作
  batchUpdate: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        action: z.enum(["approve", "reject", "pending", "delete"]),
      })
    )
    .mutation(async ({ input }) => {
      const { ids, action } = input;

      try {
        let _result;

        switch (action) {
          case "approve":
            _result = await db
              .update(comments)
              .set({ status: "approved" })
              .where(or(...ids.map((id) => eq(comments.id, id))));
            break;

          case "reject":
            _result = await db
              .update(comments)
              .set({ status: "rejected" })
              .where(or(...ids.map((id) => eq(comments.id, id))));
            break;

          case "pending":
            _result = await db
              .update(comments)
              .set({ status: "pending" })
              .where(or(...ids.map((id) => eq(comments.id, id))));
            break;

          case "delete":
            _result = await db.delete(comments).where(or(...ids.map((id) => eq(comments.id, id))));
            break;

          default:
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "无效的操作类型",
            });
        }

        return {
          success: true,
          message: `批量${
            action === "approve"
              ? "批准"
              : action === "reject"
                ? "拒绝"
                : action === "pending"
                  ? "设为待审"
                  : "删除"
          }成功`,
          affectedCount: ids.length,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("批量操作失败:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "批量操作失败",
        });
      }
    }),

  // 获取评论统计
  stats: adminProcedure.query(async () => {
    try {
      const totalResult = await db.select({ count: sql<number>`count(*)` }).from(comments);
      const approvedResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.status, "approved"));
      const pendingResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.status, "pending"));
      const rejectedResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.status, "rejected"));

      return {
        total: totalResult[0]?.count || 0,
        approved: approvedResult[0]?.count || 0,
        pending: pendingResult[0]?.count || 0,
        rejected: rejectedResult[0]?.count || 0,
      };
    } catch (error) {
      console.error("获取评论统计失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取评论统计失败",
      });
    }
  }),
});
