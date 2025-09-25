import { and, desc, eq, inArray } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db, initializeDB } from "@/lib/db";
import { cleanupOldLogs, createRunLog } from "@/lib/job-logger";
import { jobRuns } from "@/lib/schema";
import type { JobDefinition } from "./definitions";
import { jobDefinitions, nextRunTime } from "./definitions";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);

type TimerRef = ReturnType<typeof setTimeout> | null;

type InternalJobState = {
  def: JobDefinition;
  nextAt: number;
  timer: TimerRef;
  running: boolean;
};

class JobsScheduler {
  private jobs = new Map<string, InternalJobState>();
  private started = false;

  async start() {
    if (this.started) return;
    this.started = true;
    await initializeDB();
    for (const def of jobDefinitions) {
      const nextAt = nextRunTime(Date.now(), def.schedule);
      const st: InternalJobState = { def, nextAt, timer: null, running: false };
      this.jobs.set(def.key, st);
      this.armTimer(st);
    }
  }

  stop() {
    for (const st of this.jobs.values()) if (st.timer) clearTimeout(st.timer);
    this.jobs.clear();
    this.started = false;
  }

  private armTimer(st: InternalJobState) {
    const ms = Math.max(0, st.nextAt - Date.now());
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      this.runJob(st.def.key, "scheduler").catch((e) => console.error("job error", e));
    }, ms);
  }

  private computeNext(def: JobDefinition) {
    return nextRunTime(Date.now(), def.schedule);
  }

  /**
   * 非阻塞触发：立即在下一个事件循环中运行，不阻塞调用方。
   */
  trigger(jobKey: string, triggeredBy: "scheduler" | "manual" = "manual") {
    const st = this.jobs.get(jobKey);
    if (!st) throw new Error(`Unknown job: ${jobKey}`);
    if (st.running) throw new Error(`Job is already running: ${jobKey}`);
    setTimeout(() => {
      this.runJob(jobKey, triggeredBy).catch((e) => console.error("job error", e));
    }, 0);
  }

  async runJob(jobKey: string, triggeredBy: "scheduler" | "manual") {
    const st = this.jobs.get(jobKey);
    if (!st) throw new Error(`Unknown job: ${jobKey}`);
    if (st.running) throw new Error(`Job is already running: ${jobKey}`);
    st.running = true;

    const runId = nanoid();
    const log = createRunLog(jobKey, runId);
    const startedAt = Date.now();

    const logger = {
      info: (message: string, data?: Record<string, unknown>) =>
        log.write({ level: "info", message, data }),
      error: (message: string, data?: Record<string, unknown>) =>
        log.write({ level: "error", message, data }),
    } as const;

    logger.info("run_initialized", { triggeredBy });

    await initializeDB();
    await db.insert(jobRuns).values({
      id: runId,
      jobKey,
      jobName: st.def.name,
      status: "running",
      triggeredBy,
      startedAt,
      logPath: log.filePath,
      logDeleted: false,
      attempt: 1,
    });

    try {
      await st.def.run(logger);
      await db
        .update(jobRuns)
        .set({ status: "success", finishedAt: Date.now() })
        .where(eq(jobRuns.id, runId));
      logger.info("run_completed", { status: "success", durationMs: Date.now() - startedAt });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error("run_failed", {
        message: msg,
        stack: e instanceof Error ? e.stack : undefined,
      });
      await db
        .update(jobRuns)
        .set({ status: "error", finishedAt: Date.now(), errorMessage: msg })
        .where(eq(jobRuns.id, runId));
      logger.info("run_completed", { status: "error", durationMs: Date.now() - startedAt });
    } finally {
      st.running = false;
      st.nextAt = this.computeNext(st.def);
      this.armTimer(st);

      // Special hook: if cleanup job, perform file deletion and DB backfill here
      if (jobKey === "cleanup-job-logs") {
        const removed = cleanupOldLogs(7);
        if (removed.length) {
          try {
            const chunkSize = 500;
            for (let i = 0; i < removed.length; i += chunkSize) {
              const slice = removed.slice(i, i + chunkSize);
              await db
                .update(jobRuns)
                .set({ logDeleted: true })
                .where(inArray(jobRuns.logPath, slice));
            }
            logger.info("cleanup_removed_logs", {
              removedCount: removed.length,
              keepDays: 7,
              sample: removed.slice(0, 5),
            });
          } catch (e) {
            logger.error("cleanup_update_failed", {
              message: e instanceof Error ? e.message : String(e),
            });
          }
        } else {
          logger.info("cleanup_removed_logs", { removedCount: 0, keepDays: 7 });
        }
      }
      log.close();
    }
  }

  getOverview() {
    return Array.from(this.jobs.values()).map((st) => ({
      key: st.def.key,
      name: st.def.name,
      schedule: st.def.schedule,
      running: st.running,
      nextRunAt: st.nextAt,
    }));
  }

  getDefinition(jobKey: string) {
    return this.jobs.get(jobKey)?.def;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __jobsScheduler: JobsScheduler | undefined;
}

export function getScheduler() {
  if (!global.__jobsScheduler) global.__jobsScheduler = new JobsScheduler();
  return global.__jobsScheduler;
}

export async function startJobsScheduler() {
  const s = getScheduler();
  await s.start();
  return s;
}

export type JobOverview = ReturnType<JobsScheduler["getOverview"]>[number];

export async function getJobsOverview(): Promise<(JobOverview & { lastRunAt?: number | null })[]> {
  await initializeDB();
  const s = getScheduler();
  const base = s.getOverview();
  const results: (JobOverview & { lastRunAt?: number | null })[] = [];
  for (const j of base) {
    const last = await db
      .select({ startedAt: jobRuns.startedAt })
      .from(jobRuns)
      .where(and(eq(jobRuns.jobKey, j.key)))
      .orderBy(desc(jobRuns.startedAt))
      .limit(1);
    results.push({ ...j, lastRunAt: last[0]?.startedAt ?? null });
  }
  return results;
}
