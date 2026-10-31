import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getScheduler, startJobsScheduler } from "../../jobs";
import {
  getProjectStatusHistory,
  getProjectStatusOverview,
  PROJECT_STATUS_KEY,
} from "../../services/project-status";
import { adminProcedure, createTRPCRouter } from "../../trpc";

export const adminProjectStatusRouter = createTRPCRouter({
  overview: adminProcedure.query(() => getProjectStatusOverview()),

  history: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(({ input }) => getProjectStatusHistory(input?.limit ?? 30)),

  trigger: adminProcedure.mutation(async () => {
    try {
      const scheduler = getScheduler();
      if (!scheduler.getDefinition(PROJECT_STATUS_KEY)) {
        await startJobsScheduler();
        return { success: true as const, queued: true as const, runKey: PROJECT_STATUS_KEY };
      }
      scheduler.trigger(PROJECT_STATUS_KEY, "manual");
      return { success: true as const, queued: true as const, runKey: PROJECT_STATUS_KEY };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already running")) {
        throw new TRPCError({ code: "CONFLICT", message: "项目入口状态检查正在运行" });
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
    }
  }),
});
