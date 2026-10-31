import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { and, desc, eq, exists, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import {
  getProjectStatusCatalogEntries,
  type ProjectStatusCatalogEntry,
} from "@/lib/project-catalog";
import {
  PROJECT_STATUS_BATCH_TIMEOUT_MS,
  PROJECT_STATUS_HEARTBEAT_INTERVAL_MS,
  PROJECT_STATUS_HEARTBEAT_STALE_AFTER_MS,
  PROJECT_STATUS_JOB_KEY,
  PROJECT_STATUS_MAX_CONCURRENCY,
  PROJECT_STATUS_RETENTION_MS,
  PROJECT_STATUS_RETRY_DELAY_MS,
  PROJECT_STATUS_STALE_AFTER_MS,
  PROJECT_STATUS_TARGET_TIMEOUT_MS,
  type ProjectStatusFreshness,
  type ProjectStatusHistoryResponse,
  type ProjectStatusHistoryRunDto,
  type ProjectStatusOverviewResponse,
  type ProjectStatusResultDto,
  type ProjectStatusRunDto,
  type ProjectStatusRunStatus,
} from "@/lib/project-status";
import { projectStatusResults, projectStatusRuns } from "@/lib/schema";

type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;
type Now = () => number;
type IdFactory = () => string;
type ResolveHost = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
type FetchResolved = (
  input: string,
  init: RequestInit,
  address: string | null
) => Promise<Response>;

export type ProjectStatusServiceDeps = {
  fetch: typeof fetch;
  sleep: Sleep;
  now: Now;
  id: IdFactory;
  resolveHost: ResolveHost;
  fetchResolved?: FetchResolved;
  targetTimeoutMs?: number;
  retryDelayMs?: number;
  schedulerOwnerToken?: string;
};

const productionDeps: ProjectStatusServiceDeps = {
  fetch,
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error("Project status run was interrupted"));
        return;
      }
      const timeout = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        resolve();
      }, ms);
      const abort = () => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        reject(new Error("Project status run was interrupted"));
      };
      signal?.addEventListener("abort", abort, { once: true });
    }),
  now: () => Date.now(),
  id: randomUUID,
  resolveHost: (hostname) => lookup(hostname, { all: true, verbatim: true }),
  fetchResolved: fetchResolvedTarget,
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
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (mapped.includes(".")) return isPrivateAddress(mapped);
    const mappedParts = mapped.split(":");
    if (mappedParts.length === 2 && mappedParts.every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
      const high = Number.parseInt(mappedParts[0], 16);
      const low = Number.parseInt(mappedParts[1], 16);
      return isPrivateAddress(`${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`);
    }
  }
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
  const firstHextet = Number.parseInt(normalized.split(":")[0] ?? "", 16);
  const [left, right] = normalized.split("::");
  const leftHextets = left ? left.split(":") : [];
  const rightHextets = right ? right.split(":") : [];
  const expandedHextets = [
    ...leftHextets,
    ...Array(Math.max(0, 8 - leftHextets.length - rightHextets.length)).fill("0"),
    ...rightHextets,
  ].map((part) => Number.parseInt(part, 16));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) ||
    (firstHextet >= 0xfec0 && firstHextet <= 0xfeff) ||
    (expandedHextets[0] === 0x64 && expandedHextets[1] === 0xff9b) ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

function headersForNodeResponse(headers: Record<string, string | string[] | undefined>) {
  const normalized = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) normalized.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return normalized;
}

function fetchResolvedTarget(input: string, init: RequestInit, address: string | null) {
  if (!address) return fetch(input, init);
  const target = new URL(input);
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = new Headers(init.headers);
  headers.set("host", target.host);
  return new Promise<Response>((resolve, reject) => {
    const req = request(
      {
        hostname: address,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: init.method ?? "GET",
        headers: Object.fromEntries(headers.entries()),
        ...(target.protocol === "https:"
          ? { rejectUnauthorized: true, servername: target.hostname.replace(/^\[|\]$/g, "") }
          : {}),
      },
      (response) => {
        response.destroy();
        resolve(
          new Response(null, {
            status: response.statusCode ?? 0,
            headers: headersForNodeResponse(response.headers),
          })
        );
      }
    );
    const abort = () => req.destroy(new DOMException("目标请求超时", "AbortError"));
    if (init.signal?.aborted) {
      abort();
      return;
    }
    init.signal?.addEventListener("abort", abort, { once: true });
    req.once("error", reject);
    req.once("close", () => init.signal?.removeEventListener("abort", abort));
    req.end();
  });
}

async function assertSafeTarget(
  href: string,
  resolveHost: ResolveHost,
  signal: AbortSignal
): Promise<{ url: URL; address: string | null }> {
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
  const hostnameAddress = hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostnameAddress) === 6) {
    throw new UnsafeTargetError("暂不支持仅 IPv6 的目标地址");
  }
  let address: string | null = isIP(hostnameAddress) === 0 ? null : hostnameAddress;
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
    const ipv4Address = addresses.find(
      ({ address: resolvedAddress }) => isIP(resolvedAddress) === 4
    );
    if (!ipv4Address) throw new UnsafeTargetError("目标未解析到可检查的 IPv4 地址");
    address = ipv4Address.address;
  }
  return { url, address };
}

function freshnessFor(checkedAt: number | null, now: number): ProjectStatusFreshness {
  if (!checkedAt) return "unknown";
  return now - checkedAt > PROJECT_STATUS_STALE_AFTER_MS ? "stale" : "fresh";
}

async function checkTarget(
  href: string,
  deadline: number,
  deps: ProjectStatusServiceDeps,
  runSignal?: AbortSignal
): Promise<CheckOutcome> {
  let attemptCount = 0;
  let lastOutcome: CheckOutcome | null = null;

  while (attemptCount < 2) {
    if (runSignal?.aborted) throw new Error("Project status run was interrupted");
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
    const abortForLease = () => controller.abort();
    if (runSignal) {
      if (runSignal.aborted) throw new Error("Project status run was interrupted");
      runSignal.addEventListener("abort", abortForLease, { once: true });
    }
    const timeoutMs = Math.min(deps.targetTimeoutMs ?? PROJECT_STATUS_TARGET_TIMEOUT_MS, remaining);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resolveHost = deps.resolveHost;
      let currentUrl = href;
      let response: Response | null = null;
      let redirected = false;
      for (let redirectCount = 0; redirectCount <= 10; redirectCount += 1) {
        const safeTarget = await assertSafeTarget(currentUrl, resolveHost, controller.signal);
        const requestInit = {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
        } as const;
        response = deps.fetchResolved
          ? await deps.fetchResolved(safeTarget.url.toString(), requestInit, safeTarget.address)
          : await deps.fetch(safeTarget.url.toString(), requestInit);
        await response.body?.cancel();
        if (response.status < 300 || response.status > 399) break;
        const location = response.headers.get("location");
        if (!location || redirectCount === 10) break;
        currentUrl = new URL(location, safeTarget.url).toString();
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
      runSignal?.removeEventListener("abort", abortForLease);
    }

    if (runSignal?.aborted) throw new Error("Project status run was interrupted");

    const retryable =
      lastOutcome.status === "unavailable" &&
      (isRetryableHttpStatus(lastOutcome.httpStatus ?? 0) ||
        lastOutcome.errorKind === "network" ||
        lastOutcome.errorKind === "timeout");
    if (!retryable || attemptCount >= 2) return lastOutcome;
    const retryDelayMs = deps.retryDelayMs ?? PROJECT_STATUS_RETRY_DELAY_MS;
    if (deps.now() + retryDelayMs >= deadline) return lastOutcome;
    await deps.sleep(retryDelayMs, runSignal);
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
  worker: (item: T) => Promise<R>,
  onWorkerError?: (error: unknown) => void
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function consume() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index]);
      } catch (error) {
        onWorkerError?.(error);
        throw error;
      }
    }
  }
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => consume())
  );
  const rejected = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (rejected) throw rejected.reason;
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

async function getProjectStatusRunCounts(runId: string) {
  const results = await db
    .select({ attempted: projectStatusResults.attempted, status: projectStatusResults.status })
    .from(projectStatusResults)
    .where(eq(projectStatusResults.runId, runId));
  return {
    attemptedCount: results.filter((result) => result.attempted).length,
    availableCount: results.filter((result) => result.status === "available").length,
    unavailableCount: results.filter((result) => result.status === "unavailable").length,
  };
}

async function updateProjectStatusRunCounts(runId: string) {
  const counts = await getProjectStatusRunCounts(runId);
  await db
    .update(projectStatusRuns)
    .set(counts)
    .where(and(eq(projectStatusRuns.id, runId), eq(projectStatusRuns.status, "running")));
  return counts;
}

export async function interruptActiveProjectStatusRuns(
  now = Date.now(),
  force = false,
  schedulerOwnerToken?: string
) {
  const activeRuns = await db
    .select({ id: projectStatusRuns.id })
    .from(projectStatusRuns)
    .where(
      and(
        eq(projectStatusRuns.status, "running"),
        schedulerOwnerToken
          ? eq(projectStatusRuns.schedulerOwnerToken, schedulerOwnerToken)
          : undefined,
        force
          ? undefined
          : or(
              isNull(projectStatusRuns.heartbeatAt),
              lt(projectStatusRuns.heartbeatAt, now - PROJECT_STATUS_HEARTBEAT_STALE_AFTER_MS)
            )
      )
    );

  for (const activeRun of activeRuns) {
    const interrupted = await db.transaction(async (tx) => {
      const results = await tx
        .select({ attempted: projectStatusResults.attempted, status: projectStatusResults.status })
        .from(projectStatusResults)
        .where(eq(projectStatusResults.runId, activeRun.id));
      const counts = {
        attemptedCount: results.filter((result) => result.attempted).length,
        availableCount: results.filter((result) => result.status === "available").length,
        unavailableCount: results.filter((result) => result.status === "unavailable").length,
      };
      return tx
        .update(projectStatusRuns)
        .set({
          status: "interrupted",
          finishedAt: now,
          heartbeatAt: null,
          errorMessage: "服务重启，中断了活动批次",
          ...counts,
        })
        .where(and(eq(projectStatusRuns.id, activeRun.id), eq(projectStatusRuns.status, "running")))
        .returning({ id: projectStatusRuns.id });
    });
    if (!interrupted.length) continue;
  }
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
  const deps = {
    ...productionDeps,
    ...overrides,
    ...(overrides.fetch && !overrides.fetchResolved ? { fetchResolved: undefined } : {}),
  };
  const startedAt = deps.now();
  await interruptActiveProjectStatusRuns(startedAt);
  const activeRuns = await db
    .select({ id: projectStatusRuns.id })
    .from(projectStatusRuns)
    .where(eq(projectStatusRuns.status, "running"))
    .limit(1);
  if (activeRuns.length > 0) throw new Error("Project status check is already running");
  await pruneHistory(startedAt);

  const entries = getProjectStatusCatalogEntries();
  const runId = deps.id();
  try {
    await db.insert(projectStatusRuns).values({
      id: runId,
      status: "running",
      triggeredBy,
      targetCount: entries.length,
      startedAt,
      heartbeatAt: startedAt,
      schedulerOwnerToken: triggeredBy === "scheduler" ? (deps.schedulerOwnerToken ?? null) : null,
    });
  } catch (error) {
    const message = errorMessage(error);
    if (
      message.includes("project_status_runs_uq_running") ||
      message.includes("project_status_runs.status")
    ) {
      throw new Error("Project status check is already running");
    }
    throw error;
  }
  const leaseController = new AbortController();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
    void (async () => {
      try {
        const touched = await db
          .update(projectStatusRuns)
          .set({ heartbeatAt: deps.now() })
          .where(and(eq(projectStatusRuns.id, runId), eq(projectStatusRuns.status, "running")))
          .returning({ id: projectStatusRuns.id });
        if (!touched.length) leaseController.abort();
      } catch {
        // A transient heartbeat write failure must not interrupt a live run.
      }
    })();
  }, PROJECT_STATUS_HEARTBEAT_INTERVAL_MS);
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

    const resultRows = await db
      .select()
      .from(projectStatusResults)
      .where(eq(projectStatusResults.runId, runId));
    const resultByEntry = new Map(resultRows.map((row) => [row.entryKey, row]));
    let progressQueue = Promise.resolve();
    const persistOutcome = (groupedEntries: ProjectStatusCatalogEntry[], outcome: CheckOutcome) => {
      const next = progressQueue.then(async () => {
        await assertProjectStatusRunActive(runId);
        for (const entry of groupedEntries) {
          const row = resultByEntry.get(entry.entryKey);
          if (!row) continue;
          const updated = await db
            .update(projectStatusResults)
            .set(outcome)
            .where(
              and(
                eq(projectStatusResults.id, row.id),
                exists(
                  db
                    .select({ id: projectStatusRuns.id })
                    .from(projectStatusRuns)
                    .where(
                      and(eq(projectStatusRuns.id, runId), eq(projectStatusRuns.status, "running"))
                    )
                )
              )
            )
            .returning({ id: projectStatusResults.id });
          if (!updated.length) throw new Error("Project status run was interrupted");
        }
        await updateProjectStatusRunCounts(runId);
      });
      progressQueue = next.catch(() => undefined);
      return next;
    };

    await mapWithConcurrency(
      [...byHref.entries()],
      PROJECT_STATUS_MAX_CONCURRENCY,
      async ([href, groupedEntries]) => {
        await assertProjectStatusRunActive(runId);
        const outcome = await checkTarget(href, deadline, deps, leaseController.signal);
        await persistOutcome(groupedEntries, outcome);
        return {
          groupedEntries,
          outcome,
        };
      },
      () => leaseController.abort()
    );

    const { attemptedCount, availableCount, unavailableCount } =
      await getProjectStatusRunCounts(runId);
    const finishedAt = deps.now();
    const status = attemptedCount === entries.length ? "completed" : "partial";
    await assertProjectStatusRunActive(runId);
    await db
      .update(projectStatusRuns)
      .set({
        status,
        attemptedCount,
        availableCount,
        unavailableCount,
        finishedAt,
        heartbeatAt: null,
      })
      .where(and(eq(projectStatusRuns.id, runId), eq(projectStatusRuns.status, "running")));
    const savedRun = await db
      .select({ status: projectStatusRuns.status })
      .from(projectStatusRuns)
      .where(eq(projectStatusRuns.id, runId))
      .limit(1);
    if (savedRun[0]?.status !== status) throw new Error("Project status run was interrupted");
    return { id: runId, status, targetCount: entries.length, attemptedCount };
  } catch (error) {
    leaseController.abort();
    const finishedAt = deps.now();
    const message = errorMessage(error);
    await db.transaction(async (tx) => {
      const results = await tx
        .select({ attempted: projectStatusResults.attempted, status: projectStatusResults.status })
        .from(projectStatusResults)
        .where(eq(projectStatusResults.runId, runId));
      const counts = {
        attemptedCount: results.filter((result) => result.attempted).length,
        availableCount: results.filter((result) => result.status === "available").length,
        unavailableCount: results.filter((result) => result.status === "unavailable").length,
      };
      await tx
        .update(projectStatusRuns)
        .set({ status: "error", finishedAt, heartbeatAt: null, errorMessage: message, ...counts })
        .where(and(eq(projectStatusRuns.id, runId), eq(projectStatusRuns.status, "running")));
    });
    throw error;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function assertProjectStatusRunActive(runId: string) {
  const rows = await db
    .select({ status: projectStatusRuns.status })
    .from(projectStatusRuns)
    .where(eq(projectStatusRuns.id, runId))
    .limit(1);
  if (rows[0]?.status !== "running") throw new Error("Project status run was interrupted");
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
    .where(ne(projectStatusRuns.status, "running"))
    .orderBy(desc(projectStatusRuns.startedAt))
    .limit(1);
  const latestRun = latestRows[0] ?? null;
  const activeRun = activeRows[0] ?? null;
  const currentRun = activeRun ?? latestRun;
  const resultRows = currentRun
    ? await db
        .select()
        .from(projectStatusResults)
        .where(eq(projectStatusResults.runId, currentRun.id))
    : [];
  const results = resultRows.map((row) => resultDto(row, now));
  const resultByEntry = new Map(results.map((result) => [result.entryKey, result]));
  const completeResults = catalog.map(
    (entry) =>
      resultByEntry.get(entry.entryKey) ?? {
        id: `unknown:${entry.entryKey}`,
        runId: currentRun?.id ?? "",
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
    activeRun: activeRun ? runDto(activeRun, now) : null,
    summary: {
      total: completeResults.length,
      available: completeResults.filter(
        (row) => row.status === "available" && row.freshness !== "stale"
      ).length,
      unavailable: completeResults.filter((row) => row.status === "unavailable").length,
      unknown: completeResults.filter((row) => row.status === "unknown").length,
      stale: completeResults.filter((row) => row.freshness === "stale").length,
    },
    results: completeResults,
  };
}

export async function getProjectStatusHistory(
  limit?: number
): Promise<ProjectStatusHistoryResponse> {
  await initializeDB();
  const cutoff = Date.now() - PROJECT_STATUS_RETENTION_MS;
  const rows = await db
    .select()
    .from(projectStatusRuns)
    .where(gte(projectStatusRuns.startedAt, cutoff))
    .orderBy(desc(projectStatusRuns.startedAt))
    .then((history) => (limit ? history.slice(0, Math.max(1, limit)) : history));
  const resultRows = rows.length
    ? await db
        .select()
        .from(projectStatusResults)
        .where(
          inArray(
            projectStatusResults.runId,
            rows.map((row) => row.id)
          )
        )
    : [];
  const resultsByRun = new Map<string, ProjectStatusResultDto[]>();
  for (const row of resultRows) {
    const results = resultsByRun.get(row.runId) ?? [];
    results.push(resultDto(row, Date.now()));
    resultsByRun.set(row.runId, results);
  }
  return {
    runs: rows.map(
      (row): ProjectStatusHistoryRunDto => ({
        ...runDto(row, Date.now()),
        results: resultsByRun.get(row.id) ?? [],
      })
    ),
  };
}

export { checkTarget as checkProjectStatusTarget };
export const PROJECT_STATUS_KEY = PROJECT_STATUS_JOB_KEY;
