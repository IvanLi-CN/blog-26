import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getScheduler, startJobsScheduler } from "../../jobs";
import {
  getProjectStatusHistory,
  getProjectStatusOverview,
  PROJECT_STATUS_KEY,
} from "../../services/project-status";
import { adminProcedure, createTRPCRouter } from "../../trpc";

type ProjectStatusScheduler = {
  getDefinition: (jobKey: string) => unknown;
  trigger: (jobKey: string, triggeredBy: "scheduler" | "manual") => void;
};

type SchedulerFactory = () => ProjectStatusScheduler;
type SchedulerStarter = () => Promise<ProjectStatusScheduler>;

export async function queueProjectStatusCheck(
  getSchedulerImpl: SchedulerFactory = getScheduler,
  startSchedulerImpl: SchedulerStarter = startJobsScheduler
) {
  try {
    const scheduler = getSchedulerImpl();
    if (!scheduler.getDefinition(PROJECT_STATUS_KEY)) {
      await startSchedulerImpl();
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
}

export const adminProjectStatusRouter = createTRPCRouter({
  overview: adminProcedure.query(() => getProjectStatusOverview()),

  history: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(({ input }) => getProjectStatusHistory(input?.limit ?? 30)),

  trigger: adminProcedure.mutation(() => queueProjectStatusCheck()),
});
