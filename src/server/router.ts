import { z } from 'zod';
import { authRouter } from './routers/auth';
import { commentsRouter } from './routers/comments';
import { contentCacheRouter } from './routers/content-cache';
import { memosRouter } from './routers/memos';
import { postsRouter } from './routers/posts';
import { reactionsRouter } from './routers/reactions';
import { searchRouter } from './routers/search';
import { statsRouter } from './routers/stats';
import { vectorizationRouter } from './routers/vectorization';

import { adminProcedure, createTRPCRouter, protectedProcedure, publicProcedure } from './trpc';

// 主应用路由器
export const appRouter = createTRPCRouter({
  // 健康检查
  health: publicProcedure.query(() => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }),

  // 获取当前用户信息
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.user) {
      return null;
    }
    return ctx.user;
  }),

  // 评论相关路由
  comments: commentsRouter,

  // 文章管理相关路由
  posts: postsRouter,

  // Memos 相关路由
  memos: memosRouter,

  // 搜索相关路由
  search: searchRouter,

  // 认证相关路由
  auth: authRouter,

  // 反应相关路由
  reactions: reactionsRouter,

  // 向量化相关路由
  vectorization: vectorizationRouter,

  // 内容缓存相关路由
  contentCache: contentCacheRouter,

  // 统计相关路由
  stats: statsRouter,

  // 示例：受保护的路由
  protected: protectedProcedure.input(z.object({ message: z.string() })).query(({ input, ctx }) => {
    return {
      message: `Hello ${ctx.user.nickname}: ${input.message}`,
      user: ctx.user,
    };
  }),

  // 示例：管理员路由
  admin: adminProcedure.input(z.object({ action: z.string() })).mutation(({ input, ctx }) => {
    return {
      success: true,
      action: input.action,
      admin: ctx.user.email,
    };
  }),
});

// 导出路由器类型
export type AppRouter = typeof appRouter;
