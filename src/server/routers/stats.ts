import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '~/lib/db';
import { comments, memos, posts, reactions, users } from '~/lib/schema';
import { adminProcedure, createTRPCRouter } from '../trpc';

// 输入验证 schemas
const getActivityCalendarSchema = z.object({
  year: z.number().int().min(2020).max(2030).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

const getDateRangeStatsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  days: z.number().int().min(1).max(365).default(30),
});

export const statsRouter = createTRPCRouter({
  // 获取总体统计数据
  getOverallStats: adminProcedure.query(async () => {
    try {
      // 并行获取各种统计数据
      const [
        totalPosts,
        totalMemos,
        totalComments,
        totalReactions,
        totalUsers,
        publishedPosts,
        draftPosts,
        publicMemos,
        privateMemos,
        pendingComments,
        approvedComments,
        rejectedComments,
      ] = await Promise.all([
        db.select({ count: count() }).from(posts).get(),
        db.select({ count: count() }).from(memos).get(),
        db.select({ count: count() }).from(comments).get(),
        db.select({ count: count() }).from(reactions).get(),
        db.select({ count: count() }).from(users).get(),
        db.select({ count: count() }).from(posts).where(eq(posts.draft, false)).get(),
        db.select({ count: count() }).from(posts).where(eq(posts.draft, true)).get(),
        db.select({ count: count() }).from(memos).where(eq(memos.public, true)).get(),
        db.select({ count: count() }).from(memos).where(eq(memos.public, false)).get(),
        db.select({ count: count() }).from(comments).where(eq(comments.status, 'pending')).get(),
        db.select({ count: count() }).from(comments).where(eq(comments.status, 'approved')).get(),
        db.select({ count: count() }).from(comments).where(eq(comments.status, 'rejected')).get(),
      ]);

      return {
        content: {
          totalPosts: totalPosts?.count || 0,
          publishedPosts: publishedPosts?.count || 0,
          draftPosts: draftPosts?.count || 0,
          totalMemos: totalMemos?.count || 0,
          publicMemos: publicMemos?.count || 0,
          privateMemos: privateMemos?.count || 0,
        },
        engagement: {
          totalComments: totalComments?.count || 0,
          pendingComments: pendingComments?.count || 0,
          approvedComments: approvedComments?.count || 0,
          rejectedComments: rejectedComments?.count || 0,
          totalReactions: totalReactions?.count || 0,
        },
        users: {
          totalUsers: totalUsers?.count || 0,
        },
      };
    } catch (error) {
      console.error('Failed to get overall stats:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch overall statistics',
      });
    }
  }),

  // 获取活动日历数据
  getActivityCalendar: adminProcedure.input(getActivityCalendarSchema).query(async ({ input }) => {
    try {
      // 简化版本：只返回文章和闪念数据，暂时不按年月过滤
      // TODO: 未来可以根据 input.year 和 input.month 进行过滤
      const [postsActivity, memosActivity] = await Promise.all([
        // 文章发布活动
        db
          .select({
            date: sql<string>`date(${posts.publishDate}, 'unixepoch')`,
            count: count(),
            type: sql<string>`'post'`,
          })
          .from(posts)
          .groupBy(sql`date(${posts.publishDate}, 'unixepoch')`)
          .all(),

        // 闪念发布活动
        db
          .select({
            date: sql<string>`date(${memos.publishDate}, 'unixepoch')`,
            count: count(),
            type: sql<string>`'memo'`,
          })
          .from(memos)
          .groupBy(sql`date(${memos.publishDate}, 'unixepoch')`)
          .all(),
      ]);

      // 合并活动数据
      const allActivities = [...postsActivity, ...memosActivity];

      // 按日期分组
      const activityByDate = allActivities.reduce(
        (acc, activity) => {
          const date = activity.date;
          if (!acc[date]) {
            acc[date] = {
              date,
              total: 0,
              posts: 0,
              memos: 0,
              comments: 0,
              reactions: 0,
            };
          }
          acc[date].total += activity.count;
          if (activity.type === 'post') {
            acc[date].posts += activity.count;
          } else if (activity.type === 'memo') {
            acc[date].memos += activity.count;
          }
          return acc;
        },
        {} as Record<
          string,
          { date: string; total: number; posts: number; memos: number; comments: number; reactions: number }
        >
      );

      return Object.values(activityByDate).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      console.error('Failed to get activity calendar:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch activity calendar data',
      });
    }
  }),

  // 获取时间范围内的趋势数据
  getTrendStats: adminProcedure.input(getDateRangeStatsSchema).query(async ({ input }) => {
    try {
      const { days } = input;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      // 简化版本：只获取文章和闪念趋势
      const [dailyPosts, dailyMemos] = await Promise.all([
        db
          .select({
            date: sql<string>`date(${posts.publishDate}, 'unixepoch')`,
            count: count(),
          })
          .from(posts)
          .where(and(gte(posts.publishDate, startTimestamp), sql`${posts.publishDate} <= ${endTimestamp}`))
          .groupBy(sql`date(${posts.publishDate}, 'unixepoch')`)
          .orderBy(sql`date(${posts.publishDate}, 'unixepoch')`)
          .all(),

        db
          .select({
            date: sql<string>`date(${memos.publishDate}, 'unixepoch')`,
            count: count(),
          })
          .from(memos)
          .where(and(gte(memos.publishDate, startTimestamp), sql`${memos.publishDate} <= ${endTimestamp}`))
          .groupBy(sql`date(${memos.publishDate}, 'unixepoch')`)
          .orderBy(sql`date(${memos.publishDate}, 'unixepoch')`)
          .all(),
      ]);

      return {
        posts: dailyPosts,
        memos: dailyMemos,
        comments: [],
        reactions: [],
      };
    } catch (error) {
      console.error('Failed to get trend stats:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch trend statistics',
      });
    }
  }),

  // 获取最近活动
  getRecentActivity: adminProcedure.query(async () => {
    try {
      // 简化版本：只获取文章和闪念
      const [recentPosts, recentMemos] = await Promise.all([
        db
          .select({
            id: posts.id,
            title: posts.title,
            slug: posts.slug,
            createdAt: posts.publishDate,
            type: sql<string>`'post'`,
          })
          .from(posts)
          .orderBy(desc(posts.publishDate))
          .limit(5)
          .all(),

        db
          .select({
            id: memos.id,
            title: memos.title,
            slug: memos.slug,
            createdAt: memos.publishDate,
            type: sql<string>`'memo'`,
          })
          .from(memos)
          .orderBy(desc(memos.publishDate))
          .limit(5)
          .all(),
      ]);

      // 合并并排序所有活动
      const allActivities = [
        ...recentPosts.map((p) => ({ ...p, createdAt: p.createdAt })),
        ...recentMemos.map((m) => ({ ...m, createdAt: m.createdAt })),
      ]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10);

      return allActivities;
    } catch (error) {
      console.error('Failed to get recent activity:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch recent activity',
      });
    }
  }),
});
