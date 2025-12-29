import { z } from "zod";
import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { commentsRouter } from "./routers/comments";
import { memosRouter } from "./routers/memos";
import { postsRouter } from "./routers/posts";
import { reactionsRouter } from "./routers/reactions";
import { searchRouter } from "./routers/search";
import { tagsRouter } from "./routers/tags";
import { createTRPCRouter, publicProcedure } from "./trpc";

export const appRouter = createTRPCRouter({
  // 认证路由
  auth: authRouter,

  // 管理员路由
  admin: adminRouter,

  // 公共文章路由
  posts: postsRouter,

  // Memo 路由
  memos: memosRouter,

  // Tags 路由
  tags: tagsRouter,

  // 评论路由
  comments: commentsRouter,

  // 反应路由
  reactions: reactionsRouter,
  search: searchRouter,

  // 健康检查端点
  health: publicProcedure.query(() => {
    return { status: "ok", timestamp: new Date().toISOString() };
  }),

  // 示例查询
  hello: publicProcedure.input(z.object({ name: z.string().optional() })).query(({ input }) => {
    return { message: `Hello ${input.name || "World"}!` };
  }),
});

export type AppRouter = typeof appRouter;
