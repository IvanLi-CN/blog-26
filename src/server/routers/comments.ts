import { TRPCError } from '@trpc/server';
import { and, asc, count, desc, eq, gte, inArray, like, lte, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getAvatarUrl } from '~/lib/avatar';
import { verifyCaptcha } from '~/lib/captcha';
import { db } from '~/lib/db';
import { signJwt } from '~/lib/jwt';
import { comments, users } from '~/lib/schema';
import { adminProcedure, createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';

// 输入验证 schemas
const postCommentSchema = z.object({
  postSlug: z.string(),
  content: z.string().min(1).max(1000),
  parentId: z.string().optional(),
  captchaResponse: z.string().optional(),
  author: z
    .object({
      nickname: z.string().min(2).max(50),
      email: z.string().email(),
    })
    .optional(),
});

const getCommentsSchema = z.object({
  slug: z.string(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const moderateCommentSchema = z.object({
  commentId: z.string(),
  status: z.enum(['approved', 'rejected']),
});

const editCommentSchema = z.object({
  commentId: z.string(),
  content: z.string().min(1).max(1000),
});

const deleteCommentSchema = z.object({
  commentId: z.string(),
});

const getCommentCountsSchema = z.object({
  slugs: z.array(z.string()).max(50), // 限制最多50个slug
});

// 管理员专用的评论查询schema
const getAdminCommentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('all'),
  search: z.string().optional(),
  postSlug: z.string().optional(),
  startDate: z.string().optional(), // ISO date string
  endDate: z.string().optional(), // ISO date string
  sortBy: z.enum(['createdAt', 'postSlug', 'author']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// 批量操作schema
const batchModerateSchema = z.object({
  commentIds: z.array(z.string()).min(1),
  status: z.enum(['approved', 'rejected']),
});

const batchDeleteSchema = z.object({
  commentIds: z.array(z.string()).min(1),
});

// 类型定义
interface CommentWithAuthor {
  id: string;
  content: string;
  createdAt: number; // UNIX timestamp
  parentId: string | null;
  authorEmail: string; // 使用authorEmail字段用于权限判断
  author: {
    id: string;
    nickname: string | null;
    avatarUrl: string;
  };
}

interface CommentWithAuthorAndReplies extends CommentWithAuthor {
  replies: CommentWithAuthorAndReplies[];
}

// 获取评论的辅助函数
async function getComments(postSlug: string, currentUserEmail?: string, isAdmin = false): Promise<CommentWithAuthor[]> {
  const commentsWithAuthors = await db
    .select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      parentId: comments.parentId,
      authorEmail: comments.authorEmail, // 使用authorEmail字段
      author: {
        id: users.id,
        nickname: users.name, // 使用name字段作为nickname
        email: users.email,
      },
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorEmail, users.email))
    .where(
      and(
        eq(comments.postSlug, postSlug),
        or(eq(comments.status, 'approved'), isAdmin ? undefined : eq(comments.authorEmail, currentUserEmail || ''))
      )
    )
    .orderBy(comments.createdAt)
    .all();

  return commentsWithAuthors.map((c) => {
    const { email, ...authorWithoutEmail } = c.author;
    return {
      ...c,
      author: {
        ...authorWithoutEmail,
        avatarUrl: getAvatarUrl(email),
      },
    };
  });
}

export const commentsRouter = createTRPCRouter({
  // 获取评论列表
  getComments: publicProcedure.input(getCommentsSchema).query(async ({ input, ctx }) => {
    const { slug, page, limit } = input;
    const offset = (page - 1) * limit;

    const allComments = await getComments(slug, ctx.user?.email, ctx.isAdmin);
    const topLevelComments = allComments.filter((c) => !c.parentId);

    const paginatedTopLevelComments = topLevelComments.slice(offset, offset + limit);

    const getReplies = (commentId: string): CommentWithAuthorAndReplies[] => {
      return allComments
        .filter((c) => c.parentId === commentId)
        .map((reply) => ({
          ...reply,
          replies: [], // Max 2 levels of nesting
        }));
    };

    const finalComments = paginatedTopLevelComments.map((c) => ({
      ...c,
      replies: getReplies(c.id).map((reply) => ({
        ...reply,
        replies: [], // Max 2 levels of nesting
      })),
    }));

    return {
      comments: finalComments,
      totalPages: Math.ceil(topLevelComments.length / limit),
      isAdmin: ctx.isAdmin,
    };
  }),

  // 批量获取评论数
  getCommentCounts: publicProcedure.input(getCommentCountsSchema).query(async ({ input, ctx }) => {
    const { slugs } = input;

    if (slugs.length === 0) {
      return {};
    }

    try {
      // 批量查询评论数，只统计已批准的评论
      const commentCounts = await db
        .select({
          postSlug: comments.postSlug,
          count: count(),
        })
        .from(comments)
        .where(and(inArray(comments.postSlug, slugs), eq(comments.status, 'approved')))
        .groupBy(comments.postSlug)
        .all();

      // 转换为 slug -> count 的映射
      const result: Record<string, number> = {};
      commentCounts.forEach(({ postSlug, count: commentCount }) => {
        result[postSlug] = commentCount;
      });

      return result;
    } catch (error) {
      console.error('Failed to get comment counts:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to get comment counts',
      });
    }
  }),

  // 创建评论
  createComment: publicProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/comments',
        tags: ['comments'],
        summary: '创建评论',
        description: '为文章创建新评论，支持回复和访客评论',
      },
    })
    .input(postCommentSchema)
    .output(
      z.object({
        success: z.boolean(),
        commentId: z.string(),
        message: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { postSlug, content, parentId, captchaResponse, author } = input;
      let userId: string | undefined = ctx.user?.id;
      let authorNickname: string | undefined = ctx.user?.nickname;
      let authorEmail: string | undefined = ctx.user?.email;

      // 如果没有登录用户，处理访客评论
      if (!ctx.user && author) {
        // 验证人机验证码
        if (!captchaResponse) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '请完成人机验证',
          });
        }

        const isHuman = await verifyCaptcha(captchaResponse);
        if (!isHuman) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: '人机验证失败，请重试',
          });
        }

        authorNickname = author.nickname;
        authorEmail = author.email;

        // 查找或创建用户
        let user = await db.select().from(users).where(eq(users.email, authorEmail)).get();

        if (!user) {
          userId = uuidv4();
          await db.insert(users).values({
            id: userId,
            name: authorNickname,
            email: authorEmail,
            createdAt: Date.now(),
          });
        } else {
          userId = user.id;
          // 更新名称（如果不同）
          if (user.name !== authorNickname) {
            await db.update(users).set({ name: authorNickname }).where(eq(users.id, user.id));
          }
        }

        // 为访客用户创建 JWT token
        const token = await signJwt({
          sub: userId,
          nickname: authorNickname,
          email: authorEmail,
        });

        // 设置 cookie（这里需要在响应中处理）
        ctx.resHeaders.set('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`);
      }

      if (!userId || !authorNickname || !authorEmail) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '缺少必要的用户信息',
        });
      }

      // 创建评论
      const commentId = uuidv4();
      const now = Date.now(); // UNIX timestamp

      await db.insert(comments).values({
        id: commentId,
        postSlug,
        content,
        authorName: authorNickname,
        authorEmail: authorEmail,
        parentId: parentId || null,
        status: 'approved', // 可以根据需要调整审核逻辑
        createdAt: now,
      });

      // 处理邮件通知逻辑（简化版本）
      // 这里可以添加回复通知和提及通知的逻辑

      return {
        success: true,
        commentId,
        message: '评论发布成功',
      };
    }),

  // 审核评论（仅管理员）
  moderateComment: adminProcedure.input(moderateCommentSchema).mutation(async ({ input }) => {
    const { commentId, status } = input;

    try {
      // 更新评论状态
      await db.update(comments).set({ status }).where(eq(comments.id, commentId));

      return {
        success: true,
        message: `评论已${status === 'approved' ? '批准' : '拒绝'}`,
      };
    } catch (error) {
      console.error('Failed to moderate comment:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: '审核评论失败',
      });
    }
  }),

  // 编辑评论（作者或管理员）
  editComment: protectedProcedure.input(editCommentSchema).mutation(async ({ input, ctx }) => {
    const { commentId, content } = input;

    // 获取评论信息
    const comment = await db
      .select({
        id: comments.id,
        authorEmail: comments.authorEmail,
        postSlug: comments.postSlug,
      })
      .from(comments)
      .where(eq(comments.id, commentId))
      .get();

    if (!comment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: '评论不存在',
      });
    }

    // 权限检查：只有评论作者或管理员可以编辑
    if (comment.authorEmail !== ctx.user.email && !ctx.isAdmin) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: '没有权限编辑此评论',
      });
    }

    try {
      // 更新评论内容
      await db.update(comments).set({ content }).where(eq(comments.id, commentId));

      return {
        success: true,
        message: '评论已更新',
      };
    } catch (error) {
      console.error('Failed to edit comment:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: '编辑评论失败',
      });
    }
  }),

  // 删除评论（作者或管理员）
  deleteComment: protectedProcedure.input(deleteCommentSchema).mutation(async ({ input, ctx }) => {
    const { commentId } = input;

    // 获取评论信息
    const comment = await db
      .select({
        id: comments.id,
        authorEmail: comments.authorEmail,
        postSlug: comments.postSlug,
      })
      .from(comments)
      .where(eq(comments.id, commentId))
      .get();

    if (!comment) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: '评论不存在',
      });
    }

    // 权限检查：只有评论作者或管理员可以删除
    if (comment.authorEmail !== ctx.user.email && !ctx.isAdmin) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: '没有权限删除此评论',
      });
    }

    try {
      // 删除评论（这里可以选择软删除或硬删除）
      // 硬删除：直接从数据库中删除
      await db.delete(comments).where(eq(comments.id, commentId));

      return {
        success: true,
        message: '评论已删除',
      };
    } catch (error) {
      console.error('Failed to delete comment:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: '删除评论失败',
      });
    }
  }),

  // 管理员专用：获取评论列表（支持复杂筛选）
  getAdminComments: adminProcedure.input(getAdminCommentsSchema).query(async ({ input }) => {
    const { page, limit, status, search, postSlug, startDate, endDate, sortBy, sortOrder } = input;
    const offset = (page - 1) * limit;

    // 构建查询条件
    const conditions: any[] = [];

    // 状态筛选
    if (status !== 'all') {
      conditions.push(eq(comments.status, status));
    }

    // 文章筛选
    if (postSlug) {
      conditions.push(eq(comments.postSlug, postSlug));
    }

    // 时间范围筛选（现有数据库使用秒级时间戳）
    if (startDate) {
      const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
      conditions.push(gte(comments.createdAt, startTimestamp));
    }
    if (endDate) {
      const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
      conditions.push(lte(comments.createdAt, endTimestamp));
    }

    // 搜索条件（搜索评论内容或作者姓名）
    if (search) {
      conditions.push(or(like(comments.content, `%${search}%`), like(comments.authorName, `%${search}%`)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // 排序
    const orderBy =
      sortBy === 'createdAt'
        ? sortOrder === 'asc'
          ? asc(comments.createdAt)
          : desc(comments.createdAt)
        : sortBy === 'postSlug'
          ? sortOrder === 'asc'
            ? asc(comments.postSlug)
            : desc(comments.postSlug)
          : sortOrder === 'asc'
            ? asc(comments.authorName)
            : desc(comments.authorName);

    // 获取评论列表
    const commentsData = await db
      .select({
        id: comments.id,
        content: comments.content,
        postSlug: comments.postSlug,
        status: comments.status,
        createdAt: comments.createdAt,
        parentId: comments.parentId,
        authorName: comments.authorName,
        authorEmail: comments.authorEmail,
      })
      .from(comments)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset)
      .all();

    // 获取总数
    const totalCountResult = await db.select({ count: count() }).from(comments).where(whereClause).get();

    const totalCount = totalCountResult?.count || 0;

    // 转换为前端期望的格式
    const commentsWithAuthors = commentsData.map((comment) => ({
      ...comment,
      createdAt: comment.createdAt * 1000, // 转换为毫秒时间戳
      ipAddress: 'unknown', // 现有schema没有这个字段
      author: {
        id: comment.authorEmail, // 使用email作为临时ID
        nickname: comment.authorName,
        email: comment.authorEmail,
        avatarUrl: getAvatarUrl(comment.authorEmail),
      },
    }));

    return {
      comments: commentsWithAuthors,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
    };
  }),

  // 管理员专用：获取评论统计
  getCommentStats: adminProcedure.query(async () => {
    // 获取各状态评论数量
    const statusStats = await db
      .select({
        status: comments.status,
        count: count(),
      })
      .from(comments)
      .groupBy(comments.status)
      .all();

    // 获取总评论数
    const totalResult = await db.select({ count: count() }).from(comments).get();

    // 获取今日评论数（转换为秒级时间戳）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(today.getTime() / 1000);

    const todayResult = await db
      .select({ count: count() })
      .from(comments)
      .where(gte(comments.createdAt, todayTimestamp))
      .get();

    // 获取本周评论数（转换为秒级时间戳）
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);
    const weekTimestamp = Math.floor(weekAgo.getTime() / 1000);

    const weekResult = await db
      .select({ count: count() })
      .from(comments)
      .where(gte(comments.createdAt, weekTimestamp))
      .get();

    // 格式化状态统计
    const stats = {
      pending: 0,
      approved: 0,
      rejected: 0,
    };

    statusStats.forEach((stat) => {
      if (stat.status in stats) {
        stats[stat.status as keyof typeof stats] = stat.count;
      }
    });

    return {
      total: totalResult?.count || 0,
      today: todayResult?.count || 0,
      thisWeek: weekResult?.count || 0,
      byStatus: stats,
    };
  }),

  // 管理员专用：批量审核评论
  batchModerate: adminProcedure.input(batchModerateSchema).mutation(async ({ input }) => {
    const { commentIds, status } = input;

    try {
      // 批量更新评论状态
      for (const commentId of commentIds) {
        await db.update(comments).set({ status }).where(eq(comments.id, commentId));
      }

      return {
        success: true,
        message: `已${status === 'approved' ? '批准' : '拒绝'} ${commentIds.length} 条评论`,
        updatedCount: commentIds.length,
      };
    } catch (error) {
      console.error('Failed to batch moderate comments:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: '批量审核失败',
      });
    }
  }),

  // 管理员专用：批量删除评论
  batchDelete: adminProcedure.input(batchDeleteSchema).mutation(async ({ input }) => {
    const { commentIds } = input;

    try {
      // 批量删除评论
      for (const commentId of commentIds) {
        await db.delete(comments).where(eq(comments.id, commentId));
      }

      return {
        success: true,
        message: `已删除 ${commentIds.length} 条评论`,
        deletedCount: commentIds.length,
      };
    } catch (error) {
      console.error('Failed to batch delete comments:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: '批量删除失败',
      });
    }
  }),
});
