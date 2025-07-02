import { TRPCError } from '@trpc/server';
import { and, eq, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getAvatarUrl } from '~/lib/avatar';
import { verifyCaptcha } from '~/lib/captcha';
import { db } from '~/lib/db';
import { signJwt } from '~/lib/jwt';
import { comments, users } from '~/lib/schema';
import { adminProcedure, createTRPCRouter, publicProcedure } from '../trpc';

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

// 类型定义
interface CommentWithAuthor {
  id: string;
  content: string;
  createdAt: number; // UNIX timestamp
  parentId: string | null;
  author: {
    id: string;
    nickname: string;
    avatarUrl: string;
  };
}

interface CommentWithAuthorAndReplies extends CommentWithAuthor {
  replies: CommentWithAuthorAndReplies[];
}

// 获取评论的辅助函数
async function getComments(postSlug: string, currentUserId?: string, isAdmin = false): Promise<CommentWithAuthor[]> {
  const commentsWithAuthors = await db
    .select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      parentId: comments.parentId,
      author: {
        id: users.id,
        nickname: users.nickname,
        email: users.email,
      },
    })
    .from(comments)
    .innerJoin(users, eq(comments.authorId, users.id))
    .where(
      and(
        eq(comments.postSlug, postSlug),
        or(eq(comments.status, 'approved'), isAdmin ? undefined : eq(comments.authorId, currentUserId || ''))
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

    const allComments = await getComments(slug, ctx.user?.id, ctx.isAdmin);
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

  // 创建评论
  createComment: publicProcedure.input(postCommentSchema).mutation(async ({ input, ctx }) => {
    const { postSlug, content, parentId, captchaResponse, author } = input;
    const ipAddress = ctx.clientAddress;
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
          nickname: authorNickname,
          email: authorEmail,
          ipAddress: ipAddress || 'unknown',
          createdAt: Date.now(),
        });
      } else {
        userId = user.id;
        // 更新昵称（如果不同）
        if (user.nickname !== authorNickname) {
          await db.update(users).set({ nickname: authorNickname }).where(eq(users.id, user.id));
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
      authorId: userId,
      parentId: parentId || null,
      status: 'approved', // 可以根据需要调整审核逻辑
      createdAt: now,
      ipAddress: ipAddress || 'unknown',
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
});
