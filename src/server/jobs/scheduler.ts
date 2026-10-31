import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db, initializeDB } from "@/lib/db";
import { cleanupOldLogs, createRunLog } from "@/lib/job-logger";
import { jobRuns, jobSchedulerLeases } from "@/lib/schema";
import { interruptActiveProjectStatusRuns } from "@/server/services/project-status";
import type { JobDefinition } from "./definitions";
import { jobDefinitions, nextRunTime } from "./definitions";

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 16);
const SCHEDULER_LEASE_ID = "global";
const SCHEDULER_LEASE_TTL_MS = 15_000;
const SCHEDULER_LEASE_HEARTBEAT_MS = 5_000;

export async function markOrphanedSchedulerRuns(now: number) {
  await db
    .update(jobRuns)
    .set({
      status: "error",
      finishedAt: now,
      errorMessage: "调度器租约失效，中断了未完成的任务",
    })
    .where(and(eq(jobRuns.status, "running"), eq(jobRuns.triggeredBy, "scheduler")));
}

type TimerRef = ReturnType<typeof setTimeout> | null;
type SchedulerStartOptions = { runOnStart?: boolean };

type InternalJobState = {
  def: JobDefinition;
  nextAt: number;
  timer: TimerRef;
  running: boolean;
  queued: boolean;
  abortController: AbortController | null;
};

class JobsScheduler {
  private jobs = new Map<string, InternalJobState>();
  private started = false;
  private leader = false;
  private leaseTimer: TimerRef = null;
  private readonly ownerToken = nanoid();
  private startupRetryUsed = new Set<string>();

  async start(options: SchedulerStartOptions = {}) {
    if (this.started) return;
    await initializeDB();
    this.started = true;
    for (const def of jobDefinitions) {
      const nextAt = nextRunTime(Date.now(), def.schedule);
      const st: InternalJobState = {
        def,
        nextAt,
        timer: null,
        running: false,
        queued: false,
        abortController: null,
      };
      this.jobs.set(def.key, st);
    }
    await this.tryBecomeLeader(options);
    this.leaseTimer = setInterval(() => {
      void this.tryBecomeLeader(options);
    }, SCHEDULER_LEASE_HEARTBEAT_MS);
  }

  stop() {
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.leaseTimer = null;
    for (const st of this.jobs.values()) if (st.timer) clearTimeout(st.timer);
    this.jobs.clear();
    if (this.leader) {
      void db
        .delete(jobSchedulerLeases)
        .where(
          and(
            eq(jobSchedulerLeases.id, SCHEDULER_LEASE_ID),
            eq(jobSchedulerLeases.ownerToken, this.ownerToken)
          )
        );
    }
    this.leader = false;
    this.started = false;
  }

  private async tryBecomeLeader(options: SchedulerStartOptions) {
    const now = Date.now();
    await db
      .insert(jobSchedulerLeases)
      .values({ id: SCHEDULER_LEASE_ID, ownerToken: this.ownerToken, heartbeatAt: now })
      .onConflictDoNothing();
    const acquired = await db
      .update(jobSchedulerLeases)
      .set({ ownerToken: this.ownerToken, heartbeatAt: now })
      .where(
        and(
          eq(jobSchedulerLeases.id, SCHEDULER_LEASE_ID),
          or(
            eq(jobSchedulerLeases.ownerToken, this.ownerToken),
            lt(jobSchedulerLeases.heartbeatAt, now - SCHEDULER_LEASE_TTL_MS)
          )
        )
      )
      .returning({ id: jobSchedulerLeases.id });
    if (!acquired.length) {
      if (this.leader) {
        this.leader = false;
        for (const st of this.jobs.values()) {
          if (st.timer) clearTimeout(st.timer);
          st.timer = null;
          st.abortController?.abort(new Error("调度器租约失效"));
        }
        void interruptActiveProjectStatusRuns(Date.now(), true, this.ownerToken);
      }
      return;
    }
    if (this.leader) return;
    this.leader = true;
    this.startupRetryUsed.clear();
    await interruptActiveProjectStatusRuns(now);
    await markOrphanedSchedulerRuns(now);
    for (const st of this.jobs.values()) {
      st.nextAt = this.computeNext(st.def);
      this.armTimer(st);
    }
    if (options.runOnStart !== false) {
      for (const def of jobDefinitions) {
        if (def.runOnStart) this.trigger(def.key, "scheduler");
      }
    }
  }

  private armTimer(st: InternalJobState) {
    const ms = Math.max(0, st.nextAt - Date.now());
    if (st.timer) clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      if (!this.leader) return;
      this.runJob(st.def.key, "scheduler").catch((e) => console.error("job error", e));
    }, ms);
  }

  private computeNext(def: JobDefinition) {
    return nextRunTime(Date.now(), def.schedule);
  }

  private async assertSchedulerLease(triggeredBy: "scheduler" | "manual") {
    if (triggeredBy !== "scheduler") return;
    const lease = await db
      .select({ ownerToken: jobSchedulerLeases.ownerToken })
      .from(jobSchedulerLeases)
      .where(eq(jobSchedulerLeases.id, SCHEDULER_LEASE_ID))
      .limit(1);
    if (!this.leader || lease[0]?.ownerToken !== this.ownerToken) {
      throw new Error("调度器租约失效");
    }
  }

  /**
   * 非阻塞触发：立即在下一个事件循环中运行，不阻塞调用方。
   */
  trigger(jobKey: string, triggeredBy: "scheduler" | "manual" = "manual") {
    const st = this.jobs.get(jobKey);
    if (!st) throw new Error(`Unknown job: ${jobKey}`);
    if (triggeredBy === "scheduler" && !this.leader) {
      st.queued = false;
      return;
    }
    if (st.running || st.queued) throw new Error(`Job is already running: ${jobKey}`);
    st.queued = true;
    setTimeout(() => {
      this.runJob(jobKey, triggeredBy).catch((e) => console.error("job error", e));
    }, 0);
  }

  async runJob(jobKey: string, triggeredBy: "scheduler" | "manual") {
    const st = this.jobs.get(jobKey);
    if (!st) throw new Error(`Unknown job: ${jobKey}`);
    if (triggeredBy === "scheduler" && !this.leader) {
      st.queued = false;
      return;
    }
    if (st.running) throw new Error(`Job is already running: ${jobKey}`);
    st.queued = false;
    st.running = true;
    const abortController = triggeredBy === "scheduler" ? new AbortController() : null;
    st.abortController = abortController;

    const runId = nanoid();
    const log = createRunLog(jobKey, runId);
    const startedAt = Date.now();

    const logger = {
      info: (message: string, data?: Record<string, unknown>) =>
        log.write({ level: "info", message, data }),
      error: (message: string, data?: Record<string, unknown>) =>
        log.write({ level: "error", message, data }),
    } as const;

    try {
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
      await this.assertSchedulerLease(triggeredBy);
      await st.def.run(logger, {
        schedulerOwnerToken: this.ownerToken,
        triggeredBy,
        signal: abortController?.signal,
      });
      abortController?.signal.throwIfAborted();
      await this.assertSchedulerLease(triggeredBy);
      await db
        .update(jobRuns)
        .set({ status: "success", finishedAt: Date.now() })
        .where(and(eq(jobRuns.id, runId), eq(jobRuns.status, "running")));
      logger.info("run_completed", { status: "success", durationMs: Date.now() - startedAt });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        triggeredBy === "scheduler" &&
        jobKey === "project-entry-status" &&
        msg.includes("already running") &&
        this.leader &&
        !this.startupRetryUsed.has(jobKey)
      ) {
        this.startupRetryUsed.add(jobKey);
        const retry = setTimeout(() => {
          if (this.leader) this.trigger(jobKey, "scheduler");
        }, SCHEDULER_LEASE_TTL_MS + 1_000);
        retry.unref?.();
      }
      logger.error("run_failed", {
        message: msg,
        stack: e instanceof Error ? e.stack : undefined,
      });
      await db
        .update(jobRuns)
        .set({ status: "error", finishedAt: Date.now(), errorMessage: msg })
        .where(and(eq(jobRuns.id, runId), eq(jobRuns.status, "running")));
      logger.info("run_completed", { status: "error", durationMs: Date.now() - startedAt });
    } finally {
      st.running = false;
      st.abortController = null;
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
      running: st.running || st.queued,
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

export async function startJobsScheduler(options?: SchedulerStartOptions) {
  const s = getScheduler();
  await s.start(options);
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
