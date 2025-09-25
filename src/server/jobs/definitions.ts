import { SYSTEM_CONFIG } from "@/config/paths";
import { vectorizeAll } from "@/lib/ai/vectorization";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "@/lib/content-sources";
import { isWebDAVEnabled } from "@/lib/webdav";

export type Logger = { info: (msg: string) => void; error: (msg: string) => void };

export type IntervalSchedule = { kind: "interval"; everyMs: number };
export type DailyAtSchedule = { kind: "dailyAt"; hour: number; minute?: number };
export type JobSchedule = IntervalSchedule | DailyAtSchedule;

export type JobDefinition = {
  key: string;
  name: string;
  description?: string;
  schedule: JobSchedule;
  run: (log: Logger) => Promise<void>;
};

function computeNextRunFrom(now: number, s: JobSchedule): number {
  if (s.kind === "interval") return now + s.everyMs;
  const d = new Date(now);
  const minute = s.minute ?? 0;
  const _target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), s.hour, minute, 0, 0)
  );
  // Use local time instead of UTC to be consistent with admin expectations
  const local = new Date(now);
  const localTarget = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    s.hour,
    minute,
    0,
    0
  );
  let t = localTarget.getTime();
  if (t <= now) {
    const next = new Date(localTarget);
    next.setDate(next.getDate() + 1);
    t = next.getTime();
  }
  return t;
}

export function nextRunTime(now: number, schedule: JobSchedule) {
  return computeNextRunFrom(now, schedule);
}

async function ensureContentSourcesRegistered() {
  const manager = getContentSourceManager();
  const sources = manager.getSources();
  if (sources.length > 0) return manager;

  const basePathEnv = process.env.LOCAL_CONTENT_BASE_PATH;
  const localEnabled = typeof basePathEnv === "string" && basePathEnv.trim().length > 0;
  if (localEnabled) {
    const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
      contentPath: SYSTEM_CONFIG.local.basePath,
    });
    const localSource = new LocalContentSource(localConfig);
    await manager.registerSource(localSource);
  }
  if (isWebDAVEnabled()) {
    try {
      const webdavConfig = WebDAVContentSource.createDefaultConfig("webdav", 100);
      const webdavSource = new WebDAVContentSource(webdavConfig);
      await manager.registerSource(webdavSource);
    } catch (_error) {
      // ignore if registration fails
    }
  }
  return manager;
}

export const jobDefinitions: JobDefinition[] = [
  {
    key: "incremental-sync",
    name: "定时增量同步",
    description: "每30分钟增量同步内容源",
    schedule: { kind: "interval", everyMs: 30 * 60 * 1000 },
    run: async (log) => {
      const manager = await ensureContentSourcesRegistered();
      log.info("Trigger incremental sync");
      const res = await manager.syncAll(false);
      log.info(
        `Sync done: processed=${res.stats.totalProcessed} created=${res.stats.created} updated=${res.stats.updated} errors=${res.errors.length}`
      );
    },
  },
  {
    key: "incremental-vectorize",
    name: "定时增量向量化",
    description: "每1小时对增量内容进行向量化",
    schedule: { kind: "interval", everyMs: 60 * 60 * 1000 },
    run: async (log) => {
      log.info("Trigger incremental vectorization");
      const { stats } = await vectorizeAll({ isFull: false });
      log.info(
        `Vectorization done: processed=${stats.processed} success=${stats.success} failed=${stats.failed}`
      );
    },
  },
  {
    key: "cleanup-job-logs",
    name: "清理执行日志",
    description: "每天清理7天前的任务执行日志",
    schedule: { kind: "dailyAt", hour: 3, minute: 0 },
    run: async (log) => {
      // 实际清理在 scheduler 内部统一处理（删除文件并回写 DB 标记）
      log.info("Cleanup job logs older than 7 days");
    },
  },
];
