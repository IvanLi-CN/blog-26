import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, initializeDB } from "@/lib/db";
import { readLogSafe } from "@/lib/job-logger";
import { jobRuns } from "@/lib/schema";
import { getJobsOverview, getScheduler } from "@/server/jobs";
import { adminProcedure, createTRPCRouter } from "../../trpc";

function humanSchedule(s: any): string {
  if (!s) return "";
  if (s.kind === "interval") {
    const ms = Number(s.everyMs || 0);
    const m = Math.round(ms / 60000);
    if (m % 60 === 0) return `every ${m / 60}h`;
    return `every ${m}m`;
  }
  if (s.kind === "dailyAt") {
    const hh = String(s.hour).padStart(2, "0");
    const mm = String(s.minute ?? 0).padStart(2, "0");
    return `daily @ ${hh}:${mm}`;
  }
  return "";
}

export const adminJobsRouter = createTRPCRouter({
  list: adminProcedure.query(async () => {
    const overview = await getJobsOverview();
    return overview.map((j) => ({
      key: j.key,
      name: j.name,
      scheduleText: humanSchedule(j.schedule as any),
      lastRunAt: j.lastRunAt ?? null,
      nextRunAt: j.nextRunAt,
      running: j.running,
    }));
  }),

  trigger: adminProcedure.input(z.object({ key: z.string() })).mutation(async ({ input }) => {
    try {
      const s = getScheduler();
      const def = s.getDefinition(input.key);
      if (!def) throw new Error("job not found");
      // 非阻塞：后台触发
      s.trigger(input.key, "manual");
      return { ok: true, queued: true };
    } catch (e) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (e as Error).message });
    }
  }),

  runs: adminProcedure
    .input(
      z
        .object({ key: z.string().optional(), limit: z.number().min(1).max(200).optional() })
        .optional()
    )
    .query(async ({ input }) => {
      await initializeDB();
      const lim = input?.limit ?? 20;
      const rows = await db
        .select()
        .from(jobRuns)
        .where(input?.key ? and(eq(jobRuns.jobKey, input.key)) : (undefined as any))
        .orderBy(desc(jobRuns.startedAt))
        .limit(lim);
      return rows;
    }),

  getRun: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    await initializeDB();
    const rows = await db.select().from(jobRuns).where(eq(jobRuns.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "run not found" });
    return rows[0];
  }),

  getRunLog: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    await initializeDB();
    const rows = await db.select().from(jobRuns).where(eq(jobRuns.id, input.id)).limit(1);
    const run = rows[0];
    if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "run not found" });
    const { content, exists } = readLogSafe(run.logPath);
    if (!exists && !run.logDeleted) {
      await db.update(jobRuns).set({ logDeleted: true }).where(eq(jobRuns.id, input.id));
    }
    return { exists, content };
  }),
});
