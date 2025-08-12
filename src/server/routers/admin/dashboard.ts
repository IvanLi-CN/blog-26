import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../lib/db";
import { comments, emailVerificationCodes, posts, users } from "../../../lib/schema";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const adminDashboardRouter = createTRPCRouter({
  // 获取总体统计数据
  stats: adminProcedure.query(async () => {
    try {
      // 文章统计
      const totalPostsResult = await db.select({ count: sql<number>`count(*)` }).from(posts);
      const publishedPostsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(and(eq(posts.draft, false), eq(posts.public, true)));
      const draftPostsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(eq(posts.draft, true));

      // 评论统计
      const totalCommentsResult = await db.select({ count: sql<number>`count(*)` }).from(comments);
      const approvedCommentsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.status, "approved"));
      const pendingCommentsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.status, "pending"));

      // 用户统计
      const totalUsersResult = await db.select({ count: sql<number>`count(*)` }).from(users);

      // 验证码统计（活跃度指标）
      const totalVerificationCodesResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(emailVerificationCodes);

      return {
        posts: {
          total: totalPostsResult[0]?.count || 0,
          published: publishedPostsResult[0]?.count || 0,
          draft: draftPostsResult[0]?.count || 0,
        },
        comments: {
          total: totalCommentsResult[0]?.count || 0,
          approved: approvedCommentsResult[0]?.count || 0,
          pending: pendingCommentsResult[0]?.count || 0,
        },
        users: {
          total: totalUsersResult[0]?.count || 0,
        },
        activity: {
          verificationCodes: totalVerificationCodesResult[0]?.count || 0,
        },
      };
    } catch (error) {
      console.error("获取统计数据失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取统计数据失败",
      });
    }
  }),

  // 获取最近活动
  recentActivity: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const activities: any[] = [];

        // 最近的文章
        const recentPosts = await db
          .select({
            id: posts.id,
            title: posts.title,
            publishDate: posts.publishDate,
            draft: posts.draft,
          })
          .from(posts)
          .orderBy(desc(posts.publishDate))
          .limit(5);

        recentPosts.forEach((post) => {
          activities.push({
            id: `post-${post.id}`,
            type: "post",
            action: post.draft ? "created_draft" : "published",
            title: post.title,
            timestamp: post.publishDate,
            status: post.draft ? "draft" : "published",
          });
        });

        // 最近的评论
        const recentComments = await db
          .select({
            id: comments.id,
            authorName: comments.authorName,
            content: comments.content,
            createdAt: comments.createdAt,
            status: comments.status,
          })
          .from(comments)
          .orderBy(desc(comments.createdAt))
          .limit(5);

        recentComments.forEach((comment) => {
          activities.push({
            id: `comment-${comment.id}`,
            type: "comment",
            action: "created",
            title: `${comment.authorName} 发表了评论`,
            content:
              comment.content.substring(0, 100) + (comment.content.length > 100 ? "..." : ""),
            timestamp: comment.createdAt,
            status: comment.status,
          });
        });

        // 最近的用户
        const recentUsers = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt))
          .limit(3);

        recentUsers.forEach((user) => {
          activities.push({
            id: `user-${user.id}`,
            type: "user",
            action: "registered",
            title: `${user.name || user.email} 注册了账号`,
            timestamp: user.createdAt,
            status: "completed",
          });
        });

        // 按时间排序并限制数量
        activities.sort((a, b) => b.timestamp - a.timestamp);

        return activities.slice(0, input.limit);
      } catch (error) {
        console.error("获取最近活动失败:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "获取最近活动失败",
        });
      }
    }),

  // 获取时间范围内的统计数据
  timeRangeStats: adminProcedure
    .input(
      z.object({
        startDate: z.number(),
        endDate: z.number(),
        granularity: z.enum(["day", "week", "month"]).default("day"),
      })
    )
    .query(async ({ input }) => {
      const { startDate, endDate } = input;

      try {
        // 获取时间范围内的文章数据
        const postsInRange = await db
          .select({
            publishDate: posts.publishDate,
            draft: posts.draft,
          })
          .from(posts)
          .where(and(gte(posts.publishDate, startDate), lte(posts.publishDate, endDate)));

        // 获取时间范围内的评论数据
        const commentsInRange = await db
          .select({
            createdAt: comments.createdAt,
            status: comments.status,
          })
          .from(comments)
          .where(and(gte(comments.createdAt, startDate), lte(comments.createdAt, endDate)));

        // 获取时间范围内的用户数据
        const usersInRange = await db
          .select({
            createdAt: users.createdAt,
          })
          .from(users)
          .where(and(gte(users.createdAt, startDate), lte(users.createdAt, endDate)));

        return {
          posts: {
            total: postsInRange.length,
            published: postsInRange.filter((p) => !p.draft).length,
            draft: postsInRange.filter((p) => p.draft).length,
          },
          comments: {
            total: commentsInRange.length,
            approved: commentsInRange.filter((c) => c.status === "approved").length,
            pending: commentsInRange.filter((c) => c.status === "pending").length,
            rejected: commentsInRange.filter((c) => c.status === "rejected").length,
          },
          users: {
            total: usersInRange.length,
          },
        };
      } catch (error) {
        console.error("获取时间范围统计失败:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "获取时间范围统计失败",
        });
      }
    }),

  // 获取系统健康状态
  health: adminProcedure.query(async () => {
    try {
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      // 检查最近24小时的活动
      const recentPosts = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(gte(posts.publishDate, oneDayAgo));

      const recentComments = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(gte(comments.createdAt, oneDayAgo));

      const recentUsers = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(gte(users.createdAt, oneDayAgo));

      // 检查待处理的内容
      const pendingComments = await db
        .select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.status, "pending"));

      const draftPosts = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(eq(posts.draft, true));

      return {
        status: "healthy",
        timestamp: now,
        activity24h: {
          posts: recentPosts[0]?.count || 0,
          comments: recentComments[0]?.count || 0,
          users: recentUsers[0]?.count || 0,
        },
        pending: {
          comments: pendingComments[0]?.count || 0,
          drafts: draftPosts[0]?.count || 0,
        },
      };
    } catch (error) {
      console.error("获取系统健康状态失败:", error);
      return {
        status: "error",
        timestamp: Date.now(),
        error: "无法获取系统状态",
      };
    }
  }),
});
