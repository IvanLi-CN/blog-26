import { router, publicProcedure } from "./trpc";
import { z } from "zod";

export const appRouter = router({
  // 健康检查端点
  health: publicProcedure.query(() => {
    return { status: "ok", timestamp: new Date().toISOString() };
  }),

  // 示例查询
  hello: publicProcedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return { message: `Hello ${input.name || "World"}!` };
    }),
});

export type AppRouter = typeof appRouter;
