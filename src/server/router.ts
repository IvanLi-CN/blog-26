import { z } from "zod";
import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { postsRouter } from "./routers/posts";
import { createTRPCRouter, publicProcedure } from "./trpc";

export const appRouter = createTRPCRouter({
  // 认证路由
  auth: authRouter,

  // 管理员路由
  admin: adminRouter,

  // 公共文章路由
  posts: postsRouter,

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
