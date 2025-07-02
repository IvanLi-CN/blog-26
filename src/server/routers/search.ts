import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { performRAGQuery, streamChatQuery, streamRAGQuery } from '~/lib/rag';
import { rateLimiter, rateLimiterHourly } from '~/lib/rateLimiter';
import { createTRPCRouter, publicProcedure } from '../trpc';

// 输入验证 schemas
const searchQuerySchema = z.object({
  query: z.string().min(1, '查询不能为空').max(500, '查询过长'),
});

const chatQuerySchema = z.object({
  query: z.string().min(1, '查询不能为空').max(500, '查询过长'),
  history: z.array(
    z.object({
      type: z.enum(['user', 'ai']),
      text: z.string(),
      sources: z
        .array(
          z.object({
            id: z.string(),
            title: z.string(),
            slug: z.string(),
            permalink: z.string(),
            score: z.number().optional(),
          })
        )
        .optional(),
    })
  ),
});

// 速率限制中间件
const rateLimitMiddleware = publicProcedure.use(async ({ next }) => {
  try {
    await rateLimiter.consume('global');
    await rateLimiterHourly.consume('global');
    return next();
  } catch (_rejRes) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too Many Requests',
    });
  }
});

export const searchRouter = createTRPCRouter({
  // 基础搜索查询
  query: rateLimitMiddleware.input(searchQuerySchema).query(async ({ input }) => {
    try {
      const result = await performRAGQuery(input.query);
      return result;
    } catch (error) {
      console.error('Search query error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Search failed',
      });
    }
  }),

  // 流式搜索查询
  streamQuery: rateLimitMiddleware.input(searchQuerySchema).mutation(async ({ input }) => {
    try {
      // 注意：tRPC 不直接支持流式响应
      // 这里我们返回一个异步生成器的结果数组
      const chunks: string[] = [];
      const streamGenerator = streamRAGQuery(input.query);

      for await (const chunk of streamGenerator) {
        chunks.push(chunk);
      }

      return {
        success: true,
        result: chunks.join(''),
        message: 'Stream query completed',
      };
    } catch (error) {
      console.error('Stream search error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Stream search failed',
      });
    }
  }),

  // 聊天查询
  chat: rateLimitMiddleware.input(chatQuerySchema).mutation(async ({ input }) => {
    try {
      // 同样，这里我们处理流式响应为完整结果
      const chunks: string[] = [];
      const streamGenerator = streamChatQuery(input.query, input.history);

      for await (const chunk of streamGenerator) {
        chunks.push(chunk);
      }

      return {
        success: true,
        result: chunks.join(''),
        message: 'Chat query completed',
      };
    } catch (error) {
      console.error('Chat query error:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Chat query failed',
      });
    }
  }),

  // 获取搜索建议（示例功能）
  suggestions: publicProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(10).default(5),
      })
    )
    .query(async ({ input }) => {
      // 这里可以实现搜索建议逻辑
      // 暂时返回一些示例建议
      const suggestions = [
        `${input.query} 教程`,
        `${input.query} 最佳实践`,
        `${input.query} 问题解决`,
        `${input.query} 配置`,
        `${input.query} 示例`,
      ].slice(0, input.limit);

      return {
        suggestions,
        query: input.query,
      };
    }),
});
