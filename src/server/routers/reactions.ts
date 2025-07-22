import { TRPCError } from '@trpc/server';
import { and, count, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '~/lib/db';
import { verifyJwt } from '~/lib/jwt';
import { reactions } from '~/lib/schema';
import { createTRPCRouter, publicProcedure } from '../trpc';

// 输入验证 schemas
const toggleReactionSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string(),
  emoji: z.string().min(1),
});

const getReactionsSchema = z.object({
  targetType: z.enum(['post', 'comment']),
  targetId: z.string(),
});

// 用户识别辅助函数
async function identifyUser(ctx: any): Promise<string | undefined> {
  // 1. 尝试从 JWT token 获取用户 email
  const cookieHeader = ctx.req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const token = cookies.token;

    if (token) {
      try {
        const payload = await verifyJwt(token);
        if (typeof payload.email === 'string') {
          return payload.email;
        }
      } catch {
        // Invalid token
      }
    }
  }

  // 2. 如果没有有效的 token，返回 undefined
  return undefined;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });

  return cookies;
}

export const reactionsRouter = createTRPCRouter({
  // 切换反应（添加或删除）
  toggle: publicProcedure.input(toggleReactionSchema).mutation(async ({ input, ctx }) => {
    const { targetType, targetId, emoji } = input;

    // 识别用户
    const userEmail = await identifyUser(ctx);

    if (!userEmail) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'User identification is required.',
      });
    }

    try {
      // 检查反应是否已存在
      const existingReaction = await db
        .select()
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, targetType),
            eq(reactions.targetId, targetId),
            eq(reactions.emoji, emoji),
            eq(reactions.userEmail, userEmail)
          )
        )
        .get();

      if (existingReaction) {
        // 如果存在，删除它（切换关闭）
        await db.delete(reactions).where(eq(reactions.id, existingReaction.id));
      } else {
        // 如果不存在，创建它（切换开启）
        await db.insert(reactions).values({
          id: `reac_${uuidv4()}`,
          targetType,
          targetId,
          emoji,
          userEmail,
          createdAt: Date.now(),
        });
      }

      // 返回新的计数
      const result = await db
        .select({ count: count() })
        .from(reactions)
        .where(and(eq(reactions.targetType, targetType), eq(reactions.targetId, targetId), eq(reactions.emoji, emoji)))
        .get();

      return {
        reacted: !existingReaction,
        count: result?.count ?? 0,
      };
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database operation failed.',
      });
    }
  }),

  // 获取反应列表
  getReactions: publicProcedure.input(getReactionsSchema).query(async ({ input, ctx }) => {
    const { targetType, targetId } = input;

    // 识别用户
    const userEmail = await identifyUser(ctx);

    try {
      // 获取所有反应，按 emoji 分组
      const reactionCounts = await db
        .select({
          emoji: reactions.emoji,
          count: count(),
        })
        .from(reactions)
        .where(and(eq(reactions.targetType, targetType), eq(reactions.targetId, targetId)))
        .groupBy(reactions.emoji);

      // 获取当前用户的反应
      let userReactions: { emoji: string }[] = [];
      if (userEmail) {
        userReactions = await db
          .select({ emoji: reactions.emoji })
          .from(reactions)
          .where(
            and(
              eq(reactions.targetType, targetType),
              eq(reactions.targetId, targetId),
              eq(reactions.userEmail, userEmail)
            )
          )
          .all();
      }

      const userReactedEmojis = new Set(userReactions.map((r) => r.emoji));

      // 合并数据
      const response = reactionCounts.map((row) => ({
        ...row,
        userReacted: userReactedEmojis.has(row.emoji),
      }));

      return { reactions: response };
    } catch (error) {
      console.error('Failed to get reactions:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch reactions.',
      });
    }
  }),
});
