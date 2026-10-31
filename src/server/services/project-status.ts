import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { desc, eq, inArray, lt, or } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import {
  getProjectStatusCatalogEntries,
  type ProjectStatusCatalogEntry,
} from "@/lib/project-catalog";
import {
  PROJECT_STATUS_BATCH_TIMEOUT_MS,
  PROJECT_STATUS_JOB_KEY,
  PROJECT_STATUS_MAX_CONCURRENCY,
  PROJECT_STATUS_RETENTION_MS,
  PROJECT_STATUS_RETRY_DELAY_MS,
  PROJECT_STATUS_STALE_AFTER_MS,
  PROJECT_STATUS_TARGET_TIMEOUT_MS,
  type ProjectStatusFreshness,
  type ProjectStatusHistoryResponse,
  type ProjectStatusOverviewResponse,
  type ProjectStatusResultDto,
  type ProjectStatusRunDto,
  type ProjectStatusRunStatus,
} from "@/lib/project-status";
import { projectStatusResults, projectStatusRuns } from "@/lib/schema";

type Sleep = (ms: number) => Promise<void>;
type Now = () => number;
type IdFactory = () => string;
type ResolveHost = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

export type ProjectStatusServiceDeps = {
  fetch: typeof fetch;
  sleep: Sleep;
  now: Now;
  id: IdFactory;
  resolveHost: ResolveHost;
  targetTimeoutMs?: number;
  retryDelayMs?: number;
};

const productionDeps: ProjectStatusServiceDeps = {
  fetch,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  id: randomUUID,
  resolveHost: (hostname) => lookup(hostname, { all: true, verbatim: true }),
  targetTimeoutMs: PROJECT_STATUS_TARGET_TIMEOUT_MS,
  retryDelayMs: PROJECT_STATUS_RETRY_DELAY_MS,
};

type CheckOutcome = {
  status: "available" | "unavailable" | "unknown";
  attempted: boolean;
  httpStatus: number | null;
  finalUrl: string | null;
  redirected: boolean;
  latencyMs: number | null;
  attemptCount: number;
  errorKind: string | null;
  errorMessage: string | null;
  checkedAt: number | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableHttpStatus(status: number) {
  return status >= 500 && status <= 599;
}

class UnsafeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTargetError";
  }
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split(".").map(Number);
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      (first === 198 && second >= 18 && second <= 19) ||
      first >= 224
    );
  }
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

async function assertSafeTarget(
  href: string,
  resolveHost: ResolveHost,
  signal: AbortSignal
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new UnsafeTargetError("目标 URL 无效");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeTargetError("只允许检查 HTTP(S) 目标");
  }
  if (url.username || url.password) {
    throw new UnsafeTargetError("目标 URL 不允许包含凭据");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new UnsafeTargetError("目标地址指向本机网络");
  }
  if (isPrivateAddress(hostname)) {
    throw new UnsafeTargetError("目标地址指向私有或保留网络");
  }
  if (isIP(hostname) === 0) {
    let onAbort: (() => void) | null = null;
    const abort = new Promise<never>((_, reject) => {
      onAbort = () => reject(new DOMException("目标请求超时", "AbortError"));
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
    let addresses: Awaited<ReturnType<ResolveHost>>;
    try {
      addresses = await Promise.race([resolveHost(hostname), abort]);
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
    }
    if (addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new UnsafeTargetError("目标地址解析到私有或保留网络");
    }
  }
  return url;
}

function freshnessFor(checkedAt: number | null, now: number): ProjectStatusFreshness {
  if (!checkedAt) return "unknown";
  return now - checkedAt > PROJECT_STATUS_STALE_AFTER_MS ? "stale" : "fresh";
}

async function checkTarget(
  href: string,
  deadline: number,
  deps: ProjectStatusServiceDeps
): Promise<CheckOutcome> {
  let attemptCount = 0;
  let lastOutcome: CheckOutcome | null = null;

  while (attemptCount < 2) {
    const remaining = deadline - deps.now();
    if (remaining <= 0) {
      return {
        status: "unknown",
        attempted: false,
        httpStatus: null,
        finalUrl: null,
        redirected: false,
        latencyMs: null,
        attemptCount,
        errorKind: "batch_timeout",
        errorMessage: "批次截止时间已到",
        checkedAt: null,
      };
    }

    attemptCount += 1;
    const startedAt = deps.now();
    const controller = new AbortController();
    const timeoutMs = Math.min(deps.targetTimeoutMs ?? PROJECT_STATUS_TARGET_TIMEOUT_MS, remaining);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resolveHost = deps.resolveHost;
      let currentUrl = href;
      let response: Response | null = null;
      let redirected = false;
      for (let redirectCount = 0; redirectCount <= 10; redirectCount += 1) {
        const safeUrl = await assertSafeTarget(currentUrl, resolveHost, controller.signal);
        response = await deps.fetch(safeUrl.toString(), {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
        });
        if (response.status < 300 || response.status > 399) break;
        const location = response.headers.get("location");
        if (!location || redirectCount === 10) break;
        currentUrl = new URL(location, safeUrl).toString();
        redirected = true;
      }
      if (!response) throw new Error("目标没有返回响应");
      const latencyMs = Math.max(0, deps.now() - startedAt);
      const available = response.status >= 200 && response.status <= 299;
      lastOutcome = {
        status: available ? "available" : "unavailable",
        attempted: true,
        httpStatus: response.status,
        finalUrl: response.url || currentUrl,
        redirected: redirected || response.redirected,
        latencyMs,
        attemptCount,
        errorKind: available ? null : `http_${response.status}`,
        errorMessage: available ? null : `目标返回 HTTP ${response.status}`,
        checkedAt: deps.now(),
      };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      lastOutcome = {
        status: "unavailable",
        attempted: true,
        httpStatus: null,
        finalUrl: null,
        redirected: false,
        latencyMs: Math.max(0, deps.now() - startedAt),
        attemptCount,
        errorKind: timedOut
          ? "timeout"
          : error instanceof UnsafeTargetError
            ? "unsafe_target"
            : "network",
        errorMessage: timedOut ? "目标请求超时" : errorMessage(error),
        checkedAt: deps.now(),
      };
    } finally {
      clearTimeout(timeout);
    }

    const retryable =
      lastOutcome.status === "unavailable" &&
      (isRetryableHttpStatus(lastOutcome.httpStatus ?? 0) ||
        lastOutcome.errorKind === "network" ||
        lastOutcome.errorKind === "timeout");
    if (!retryable || attemptCount >= 2) return lastOutcome;
    const retryDelayMs = deps.retryDelayMs ?? PROJECT_STATUS_RETRY_DELAY_MS;
    if (deps.now() + retryDelayMs >= deadline) return lastOutcome;
    await deps.sleep(retryDelayMs);
  }

  return (
    lastOutcome ?? {
      status: "unknown",
      attempted: false,
      httpStatus: null,
      finalUrl: null,
      redirected: false,
      latencyMs: null,
      attemptCount,
      errorKind: "unknown",
      errorMessage: "目标没有产生检查结果",
      checkedAt: null,
    }
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function consume() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => consume())
  );
  return results;
}

function runDto(row: typeof projectStatusRuns.$inferSelect, now: number): ProjectStatusRunDto {
  return {
    id: row.id,
    status: row.status as ProjectStatusRunStatus,
    triggeredBy: row.triggeredBy,
    targetCount: row.targetCount,
    attemptedCount: row.attemptedCount,
    availableCount: row.availableCount,
    unavailableCount: row.unavailableCount,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.finishedAt
      ? Math.max(0, row.finishedAt - row.startedAt)
      : Math.max(0, now - row.startedAt),
    errorMessage: row.errorMessage,
  };
}

function resultDto(
  row: typeof projectStatusResults.$inferSelect,
  now: number
): ProjectStatusResultDto {
  return {
    id: row.id,
    runId: row.runId,
    entryKey: row.entryKey,
    projectSlug: row.projectSlug,
    projectTitle: row.projectTitle,
    domain: row.domain as ProjectStatusResultDto["domain"],
    entryKind: row.entryKind as ProjectStatusResultDto["entryKind"],
    entryLabel: row.entryLabel,
    href: row.href,
    status: row.status,
    freshness: freshnessFor(row.checkedAt, now),
    attempted: row.attempted,
    httpStatus: row.httpStatus,
    finalUrl: row.finalUrl,
    redirected: row.redirected,
    latencyMs: row.latencyMs,
    attemptCount: row.attemptCount,
    errorKind: row.errorKind,
    errorMessage: row.errorMessage,
    checkedAt: row.checkedAt,
  };
}

async function markActiveRunsInterrupted(now: number) {
  await db
    .update(projectStatusRuns)
    .set({ status: "interrupted", finishedAt: now, errorMessage: "服务重启，中断了活动批次" })
    .where(eq(projectStatusRuns.status, "running"));
}

async function pruneHistory(now: number) {
  const cutoff = now - PROJECT_STATUS_RETENTION_MS;
  const expired = await db
    .select({ id: projectStatusRuns.id })
    .from(projectStatusRuns)
    .where(lt(projectStatusRuns.startedAt, cutoff));
  if (!expired.length) return;
  const ids = expired.map((row) => row.id);
  await db.delete(projectStatusResults).where(inArray(projectStatusResults.runId, ids));
  await db.delete(projectStatusRuns).where(inArray(projectStatusRuns.id, ids));
}

export async function runProjectStatusCheck(
  triggeredBy: "scheduler" | "manual" = "scheduler",
  overrides: Partial<ProjectStatusServiceDeps> = {}
) {
  await initializeDB();
  const deps = { ...productionDeps, ...overrides };
  const startedAt = deps.now();
  await markActiveRunsInterrupted(startedAt);
  await pruneHistory(startedAt);

  const entries = getProjectStatusCatalogEntries();
  const runId = deps.id();
  await db.insert(projectStatusRuns).values({
    id: runId,
    status: "running",
    triggeredBy,
    targetCount: entries.length,
    startedAt,
  });
  try {
    await db.insert(projectStatusResults).values(
      entries.map((entry) => ({
        id: deps.id(),
        runId,
        entryKey: entry.entryKey,
        projectSlug: entry.projectSlug,
        projectTitle: entry.projectTitle,
        domain: entry.domain,
        entryKind: entry.kind,
        entryLabel: entry.label,
        href: entry.href,
        status: "unknown" as const,
        attempted: false,
        attemptCount: 0,
      }))
    );

    const deadline = startedAt + PROJECT_STATUS_BATCH_TIMEOUT_MS;
    const byHref = new Map<string, ProjectStatusCatalogEntry[]>();
    for (const entry of entries) {
      const group = byHref.get(entry.href) ?? [];
      group.push(entry);
      byHref.set(entry.href, group);
    }

    const outcomes = await mapWithConcurrency(
      [...byHref.entries()],
      PROJECT_STATUS_MAX_CONCURRENCY,
      async ([href, groupedEntries]) => ({
        groupedEntries,
        outcome: await checkTarget(href, deadline, deps),
      })
    );

    const resultRows = await db
      .select()
      .from(projectStatusResults)
      .where(eq(projectStatusResults.runId, runId));
    const resultByEntry = new Map(resultRows.map((row) => [row.entryKey, row]));
    for (const { groupedEntries, outcome } of outcomes) {
      for (const entry of groupedEntries) {
        const row = resultByEntry.get(entry.entryKey);
        if (!row) continue;
        await db
          .update(projectStatusResults)
          .set(outcome)
          .where(eq(projectStatusResults.id, row.id));
      }
    }

    const attemptedCount = outcomes.reduce(
      (count, item) => count + (item.outcome.attempted ? item.groupedEntries.length : 0),
      0
    );
    const availableCount = outcomes.reduce(
      (count, item) =>
        count + (item.outcome.status === "available" ? item.groupedEntries.length : 0),
      0
    );
    const unavailableCount = outcomes.reduce(
      (count, item) =>
        count + (item.outcome.status === "unavailable" ? item.groupedEntries.length : 0),
      0
    );
    const finishedAt = deps.now();
    const status = attemptedCount === entries.length ? "completed" : "partial";
    await db
      .update(projectStatusRuns)
      .set({ status, attemptedCount, availableCount, unavailableCount, finishedAt })
      .where(eq(projectStatusRuns.id, runId));
    return { id: runId, status, targetCount: entries.length, attemptedCount };
  } catch (error) {
    const finishedAt = deps.now();
    await db
      .update(projectStatusRuns)
      .set({ status: "error", finishedAt, errorMessage: errorMessage(error) })
      .where(eq(projectStatusRuns.id, runId));
    throw error;
  }
}

export async function getProjectStatusOverview(
  now = Date.now()
): Promise<ProjectStatusOverviewResponse> {
  await initializeDB();
  const catalog = getProjectStatusCatalogEntries();
  const activeRows = await db
    .select()
    .from(projectStatusRuns)
    .where(eq(projectStatusRuns.status, "running"))
    .orderBy(desc(projectStatusRuns.startedAt))
    .limit(1);
  const latestRows = await db
    .select()
    .from(projectStatusRuns)
    .where(or(eq(projectStatusRuns.status, "completed"), eq(projectStatusRuns.status, "partial")))
    .orderBy(desc(projectStatusRuns.startedAt))
    .limit(1);
  const latestRun = latestRows[0] ?? null;
  const resultRows = latestRun
    ? await db
        .select()
        .from(projectStatusResults)
        .where(eq(projectStatusResults.runId, latestRun.id))
    : [];
  const results = resultRows.map((row) => resultDto(row, now));
  const resultByEntry = new Map(results.map((result) => [result.entryKey, result]));
  const completeResults = catalog.map(
    (entry) =>
      resultByEntry.get(entry.entryKey) ?? {
        id: `unknown:${entry.entryKey}`,
        runId: latestRun?.id ?? "",
        entryKey: entry.entryKey,
        projectSlug: entry.projectSlug,
        projectTitle: entry.projectTitle,
        domain: entry.domain,
        entryKind: entry.kind,
        entryLabel: entry.label,
        href: entry.href,
        status: "unknown" as const,
        freshness: "unknown" as const,
        attempted: false,
        httpStatus: null,
        finalUrl: null,
        redirected: false,
        latencyMs: null,
        attemptCount: 0,
        errorKind: null,
        errorMessage: null,
        checkedAt: null,
      }
  );
  return {
    catalog: catalog.map((entry) => ({
      entryKey: entry.entryKey,
      projectSlug: entry.projectSlug,
      projectTitle: entry.projectTitle,
      domain: entry.domain,
      entryKind: entry.kind,
      entryLabel: entry.label,
      href: entry.href,
    })),
    latestRun: latestRun ? runDto(latestRun, now) : null,
    activeRun: activeRows[0] ? runDto(activeRows[0], now) : null,
    summary: {
      total: completeResults.length,
      available: completeResults.filter((row) => row.status === "available").length,
      unavailable: completeResults.filter((row) => row.status === "unavailable").length,
      unknown: completeResults.filter((row) => row.status === "unknown").length,
      stale: completeResults.filter((row) => row.freshness === "stale").length,
    },
    results: completeResults,
  };
}

export async function getProjectStatusHistory(limit = 30): Promise<ProjectStatusHistoryResponse> {
  await initializeDB();
  const rows = await db
    .select()
    .from(projectStatusRuns)
    .orderBy(desc(projectStatusRuns.startedAt))
    .limit(Math.max(1, Math.min(100, limit)));
  return { runs: rows.map((row) => runDto(row, Date.now())) };
}

export { checkTarget as checkProjectStatusTarget };
export const PROJECT_STATUS_KEY = PROJECT_STATUS_JOB_KEY;
