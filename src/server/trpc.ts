import { initTRPC } from "@trpc/server";
import { z } from "zod";

// 创建 tRPC 实例
const t = initTRPC.create();

// 导出路由器和过程
export const router = t.router;
export const publicProcedure = t.procedure;
