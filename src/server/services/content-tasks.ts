import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { contentTaskPercent } from "@/lib/content-task-progress";
import { db } from "@/lib/db";
import { contentTaskCounters, contentTaskItems, contentTasks } from "@/lib/schema";
import { getPlaybookSnapshotStore } from "./playbook-snapshot-store";

export type ContentTask = typeof contentTasks.$inferSelect;
export type ContentTaskItem = typeof contentTaskItems.$inferSelect;
export type ContentTaskOperation = "push" | "pull" | "merge";
export type ContentTaskItemStatus =
  | "pending"
  | "running"
  | "uploaded"
  | "success"
  | "unchanged"
  | "skipped"
  | "blocked"
  | "conflict"
  | "failed";

export interface ContentTaskItemDto {
  path: string;
  contentId: string | null;
  kind: string | null;
  status: ContentTaskItemStatus;
  reason: string | null;
  error: string | null;
  mediaTotal: number;
  mediaProcessed: number;
  mediaFailed: number;
  retryable: boolean;
  updatedAt: number;
}

export interface ContentTaskSummaryDto {
  id: string;
  kind: string;
  source: string;
  operation: ContentTaskOperation | null;
  origin: string;
  status: string;
  phase: string;
  total: number;
  processed: number;
  failed: number;
  skipped: number;
  blocked: number;
  conflicts: number;
  mediaTotal: number;
  mediaProcessed: number;
  mediaFailed: number;
  currentPath: string | null;
  percent: number | null;
  startedAt: number;
  finishedAt: number | null;
  cancelRequested: boolean;
  error: string | null;
}

export interface ContentTaskProgressDto {
  task: ContentTaskSummaryDto;
  items: ContentTaskItemDto[];
  result: unknown;
}

export type ContentTaskUpdate = Partial<
  Pick<
    ContentTask,
    | "phase"
    | "total"
    | "processed"
    | "failed"
    | "skipped"
    | "blocked"
    | "conflicts"
    | "mediaTotal"
    | "mediaProcessed"
    | "mediaFailed"
    | "currentPath"
    | "target"
    | "result"
  >
>;

export interface ContentTaskItemInput {
  path: string;
  ordinal: number;
  contentId?: string | null;
  kind?: string | null;
  status: ContentTaskItemStatus;
  reason?: string | null;
  error?: string | null;
  mediaTotal?: number;
  mediaProcessed?: number;
  mediaFailed?: number;
  retryable?: boolean;
}

/** Whitelisted task view: owner token, host, pid and lease never leave the server. */
export function toContentTaskSummary(task: ContentTask): ContentTaskSummaryDto {
  return {
    id: task.id,
    kind: task.kind,
    source: task.source,
    operation: (task.operation as ContentTaskOperation | null) ?? null,
    origin: task.origin,
    status: task.status,
    phase: task.phase,
    total: task.total,
    processed: task.processed,
    failed: task.failed,
    skipped: task.skipped,
    blocked: task.blocked,
    conflicts: task.conflicts,
    mediaTotal: task.mediaTotal,
    mediaProcessed: task.mediaProcessed,
    mediaFailed: task.mediaFailed,
    currentPath: task.currentPath ?? null,
    percent: contentTaskPercent(task),
    startedAt: task.startedAt,
    finishedAt: task.finishedAt ?? null,
    cancelRequested: task.cancelRequested,
    error: task.error ?? null,
  };
}

export function toContentTaskItemDto(row: ContentTaskItem): ContentTaskItemDto {
  return {
    path: row.path,
    contentId: row.contentId ?? null,
    kind: row.kind ?? null,
    status: row.status as ContentTaskItemStatus,
    reason: row.reason ?? null,
    error: row.error ?? null,
    mediaTotal: row.mediaTotal,
    mediaProcessed: row.mediaProcessed,
    mediaFailed: row.mediaFailed,
    retryable: row.retryable,
    updatedAt: row.updatedAt,
  };
}

function itemValues(
  taskId: string,
  item: ContentTaskItemInput
): typeof contentTaskItems.$inferInsert {
  return {
    taskId,
    path: item.path,
    ordinal: item.ordinal,
    contentId: item.contentId ?? null,
    kind: item.kind ?? null,
    status: item.status,
    reason: item.reason ?? null,
    error: item.error ?? null,
    mediaTotal: item.mediaTotal ?? 0,
    mediaProcessed: item.mediaProcessed ?? 0,
    mediaFailed: item.mediaFailed ?? 0,
    retryable: item.retryable ?? true,
    updatedAt: Date.now(),
  };
}

export async function upsertContentTaskItem(taskId: string, item: ContentTaskItemInput) {
  const values = itemValues(taskId, item);
  await db
    .insert(contentTaskItems)
    .values(values)
    .onConflictDoUpdate({
      target: [contentTaskItems.taskId, contentTaskItems.path],
      set: {
        ordinal: values.ordinal,
        contentId: values.contentId,
        kind: values.kind,
        status: values.status,
        reason: values.reason,
        error: values.error,
        mediaTotal: values.mediaTotal,
        mediaProcessed: values.mediaProcessed,
        mediaFailed: values.mediaFailed,
        retryable: values.retryable,
        updatedAt: values.updatedAt,
      },
    });
}

/** Bulk insert used when a task starts: one statement, no per-item round trips. */
export async function initializeContentTaskItems(taskId: string, items: ContentTaskItemInput[]) {
  if (!items.length) return;
  await db
    .insert(contentTaskItems)
    .values(items.map((item) => itemValues(taskId, item)))
    .onConflictDoNothing({ target: [contentTaskItems.taskId, contentTaskItems.path] });
}

export async function updateContentTaskItem(
  taskId: string,
  path: string,
  values: Partial<Omit<ContentTaskItemInput, "path" | "ordinal">>
) {
  await db
    .update(contentTaskItems)
    .set({ ...values, updatedAt: Date.now() })
    .where(and(eq(contentTaskItems.taskId, taskId), eq(contentTaskItems.path, path)));
}

export async function listContentTaskItems(taskId: string) {
  return db
    .select()
    .from(contentTaskItems)
    .where(eq(contentTaskItems.taskId, taskId))
    .orderBy(contentTaskItems.ordinal);
}

/** Recount the task from its item rows so retries and restarts cannot double count. */
export async function refreshContentTaskCounters(taskId: string) {
  const rows = await listContentTaskItems(taskId);
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let blocked = 0;
  let conflicts = 0;
  let mediaTotal = 0;
  let mediaProcessed = 0;
  let mediaFailed = 0;
  for (const row of rows) {
    if (row.status !== "pending" && row.status !== "running") processed += 1;
    if (row.status === "failed") failed += 1;
    if (row.status === "skipped" || row.status === "unchanged") skipped += 1;
    if (row.status === "blocked") blocked += 1;
    if (row.status === "conflict") conflicts += 1;
    mediaTotal += row.mediaTotal;
    mediaProcessed += row.mediaProcessed;
    mediaFailed += row.mediaFailed;
  }
  await db
    .update(contentTasks)
    .set({
      total: rows.length,
      processed,
      failed,
      skipped,
      blocked,
      conflicts,
      mediaTotal,
      mediaProcessed,
      mediaFailed,
      updatedAt: Date.now(),
    })
    .where(eq(contentTasks.id, taskId));
}

export async function readContentTaskProgress(
  taskId: string
): Promise<ContentTaskProgressDto | null> {
  const task = await getContentTask(taskId);
  if (!task) return null;
  const items = await listContentTaskItems(taskId);
  let result: unknown = null;
  if (task.result) {
    try {
      result = JSON.parse(task.result);
    } catch {
      result = null;
    }
  }
  return { task: toContentTaskSummary(task), items: items.map(toContentTaskItemDto), result };
}

export const taskControllers = new Map<string, AbortController>();
const owners = new Map<string, { token: string; timer: ReturnType<typeof setInterval> }>();
export const CONTENT_TASK_LEASE_MS = 30000;
export function taskOwnerIsLive(task: ContentTask) {
  if (
    task.finishedAt !== null ||
    task.status === "interrupted" ||
    !task.ownerToken ||
    !task.leaseUntil ||
    task.leaseUntil <= Date.now()
  )
    return false;
  if (task.ownerHost === hostname() && task.ownerPid) {
    try {
      process.kill(task.ownerPid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    }
  }
  return true;
}
export function assertContentTaskOwner(
  task: ContentTask | undefined,
  token: string | null | undefined
) {
  if (
    task?.status !== "running" ||
    task.cancelRequested ||
    !token ||
    task.ownerToken !== token ||
    !task.leaseUntil ||
    task.leaseUntil <= Date.now()
  )
    throw new DOMException("Task ownership lost or cancelled", "AbortError");
}
function retainOwner(task: ContentTask) {
  const token = task.ownerToken;
  if (!token) throw new Error("Task owner missing");
  const previous = owners.get(task.id);
  if (previous) {
    clearInterval(previous.timer);
    taskControllers
      .get(task.id)
      ?.abort(new DOMException("Task execution superseded", "AbortError"));
  }
  const controller = new AbortController();
  taskControllers.set(task.id, controller);
  const timer = setInterval(() => {
    const current = db.select().from(contentTasks).where(eq(contentTasks.id, task.id)).get();
    if (
      !current ||
      current.finishedAt !== null ||
      current.ownerToken !== token ||
      !current.leaseUntil ||
      current.leaseUntil <= Date.now()
    ) {
      clearInterval(timer);
      owners.delete(task.id);
      taskControllers.delete(task.id);
      controller.abort(new DOMException("Task lease lost", "AbortError"));
      return;
    }
    if (current.cancelRequested) controller.abort(new DOMException("Task cancelled", "AbortError"));
    db.update(contentTasks)
      .set({ leaseUntil: Date.now() + CONTENT_TASK_LEASE_MS })
      .where(
        and(
          eq(contentTasks.id, task.id),
          eq(contentTasks.ownerToken, token),
          sql`${contentTasks.finishedAt} IS NULL`,
          sql`${contentTasks.leaseUntil} > ${Date.now()}`
        )
      )
      .run();
  }, 5000);
  timer.unref?.();
  owners.set(task.id, { token, timer });
}
export async function waitContentTask(id: string, timeout = 300000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const task = await getContentTask(id);
    if (!task) throw new Error("Task not found");
    if (task.finishedAt !== null) return task;
    if (!taskOwnerIsLive(task)) throw new Error(`Task interrupted: ${id}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Task wait timed out: ${id}`);
}
type TaskTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * Mark active content-repo tasks whose owner lease expired or whose process is
 * gone as interrupted. Runs inside the starting transaction so a restart can
 * never see two live tasks.
 */
export function reconcileStaleContentTasks(tx: TaskTransaction = db) {
  const now = Date.now();
  const active = tx
    .select()
    .from(contentTasks)
    .where(
      and(
        eq(contentTasks.source, "content-repo"),
        inArray(contentTasks.status, ["queued", "running"])
      )
    )
    .all();
  const interrupted: string[] = [];
  for (const task of active) {
    if (taskOwnerIsLive(task)) continue;
    tx.update(contentTasks)
      .set({
        status: "interrupted",
        phase: "interrupted",
        error: task.error ?? "Task owner is no longer running",
        finishedAt: now,
        updatedAt: now,
        leaseUntil: null,
      })
      .where(and(eq(contentTasks.id, task.id), inArray(contentTasks.status, ["queued", "running"])))
      .run();
    interrupted.push(task.id);
  }
  return interrupted;
}

export async function beginContentTask(input: {
  kind: "sync" | "rag";
  source: "local" | "playbook" | "content-repo";
  requestKey: string;
  origin: string;
  target: string;
  resumeId?: string;
  operation?: ContentTaskOperation;
  /** Content-repo starts reject or recover a live task instead of attaching to it. */
  exclusive?: boolean;
  /** Reconcile a dead active content-repo task before starting a new one. */
  recoverStale?: boolean;
}) {
  const result = db.transaction((tx) => {
    if (input.exclusive && input.source === "content-repo" && input.recoverStale)
      reconcileStaleContentTasks(tx);
    const active = tx
      .select()
      .from(contentTasks)
      .where(
        and(
          eq(contentTasks.kind, input.kind),
          eq(contentTasks.source, input.source),
          inArray(contentTasks.status, ["queued", "running"])
        )
      )
      .get();
    if (active && input.exclusive && input.source === "content-repo")
      return { task: active, reused: true, busy: true };
    if (active && !(input.resumeId === active.id && !taskOwnerIsLive(active))) {
      if (input.resumeId && active.id !== input.resumeId)
        throw new Error(`Task conflict: ${active.id}`);
      if (active.requestKey !== input.requestKey) throw new Error(`Task conflict: ${active.id}`);
      return { task: active, reused: true };
    }
    const now = Date.now();
    if (input.resumeId) {
      const previous = tx
        .select()
        .from(contentTasks)
        .where(eq(contentTasks.id, input.resumeId))
        .get();
      if (!previous || previous.finishedAt !== null || previous.cancelRequested)
        throw new Error("Task is not resumable");
      if (
        previous.kind !== input.kind ||
        previous.source !== input.source ||
        previous.requestKey !== input.requestKey
      )
        throw new Error("Recovery task identity mismatch");
      if (previous.status === "running" && taskOwnerIsLive(previous))
        return { task: previous, reused: true };
      if (
        input.kind !== "rag" &&
        input.target &&
        input.target !== previous.target &&
        input.target !== "local-content" &&
        input.target !== "null"
      )
        throw new Error("Recovery target mismatch");
      const ownership = {
        ownerToken: randomUUID(),
        ownerHost: hostname(),
        ownerPid: process.pid,
        leaseUntil: now + CONTENT_TASK_LEASE_MS,
      };
      tx.update(contentTasks)
        .set({
          ...ownership,
          requestKey: previous.requestKey,
          target: previous.target,
          status: "running",
          phase: "recovering",
          updatedAt: now,
        })
        .where(eq(contentTasks.id, previous.id))
        .run();
      return {
        task: {
          ...previous,
          ...ownership,
          requestKey: previous.requestKey,
          target: previous.target,
          status: "running",
          phase: "recovering",
        },
        reused: false,
      };
    }
    const task: ContentTask = {
      id: randomUUID(),
      kind: input.kind,
      source: input.source,
      operation: input.operation ?? null,
      requestKey: input.requestKey,
      origin: input.origin,
      target: input.target,
      result: null,
      status: "running",
      phase: "preparing",
      total: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      conflicts: 0,
      mediaTotal: 0,
      mediaProcessed: 0,
      mediaFailed: 0,
      currentPath: null,
      updatedAt: now,
      error: null,
      startedAt: now,
      finishedAt: null,
      cancelRequested: false,
      ownerToken: randomUUID(),
      ownerHost: hostname(),
      ownerPid: process.pid,
      leaseUntil: now + CONTENT_TASK_LEASE_MS,
    };
    tx.insert(contentTasks).values(task).run();
    return { task, reused: false };
  });
  if (!result.reused) retainOwner(result.task);
  return result;
}

export async function updateContentTask(
  id: string,
  values: ContentTaskUpdate,
  token = owners.get(id)?.token
) {
  await db
    .update(contentTasks)
    .set({ ...values, updatedAt: Date.now() })
    .where(
      and(
        eq(contentTasks.id, id),
        eq(contentTasks.status, "running"),
        eq(contentTasks.cancelRequested, false),
        eq(contentTasks.ownerToken, token ?? ""),
        sql`${contentTasks.leaseUntil} > ${Date.now()}`
      )
    );
}
export function finishContentTask(
  id: string,
  status: "success" | "unchanged" | "failed" | "cancelled",
  error?: string,
  token?: string
) {
  db.transaction((tx) => {
    const task = tx.select().from(contentTasks).where(eq(contentTasks.id, id)).get();
    if (!task || task.finishedAt !== null) return;
    const localOwner = owners.get(id);
    const ownerToken =
      token ??
      (localOwner && task.leaseUntil && task.leaseUntil > Date.now()
        ? localOwner.token
        : undefined);
    const committed =
      task.kind === "sync" &&
      task.source === "playbook" &&
      getPlaybookSnapshotStore().getCurrent()?.taskId === id;
    if (
      !committed &&
      (ownerToken
        ? task.ownerToken !== ownerToken || !task.leaseUntil || task.leaseUntil <= Date.now()
        : taskOwnerIsLive(task))
    )
      return;
    // A task in the committed phase already moved the remote ref; the commit is
    // not rollbackable, so cancellation must not rewrite the outcome.
    const terminal =
      committed || task.phase === "committed"
        ? "success"
        : task.cancelRequested && task.phase !== "adopted"
          ? "cancelled"
          : status;
    tx.update(contentTasks)
      .set({
        status: terminal,
        phase: terminal,
        error: error ?? null,
        finishedAt: Date.now(),
        updatedAt: Date.now(),
        currentPath: null,
      })
      .where(eq(contentTasks.id, id))
      .run();
    if (task.kind === "sync")
      tx.insert(contentTaskCounters)
        .values({ source: task.source, total: 1, trackingSince: task.startedAt })
        .onConflictDoUpdate({
          target: contentTaskCounters.source,
          set: { total: sql`${contentTaskCounters.total}+1` },
        })
        .run();
  });
  const owner = owners.get(id);
  if (owner && owner.token === token) {
    clearInterval(owner.timer);
    owners.delete(id);
    taskControllers.delete(id);
  }
}
export async function getContentTask(id: string) {
  return (await db.select().from(contentTasks).where(eq(contentTasks.id, id)).get()) ?? null;
}
export async function listContentTasks(
  input: { source?: string; kind?: string; offset?: number; limit?: number } = {}
) {
  const conditions = [];
  if (input.source && input.source !== "all")
    conditions.push(eq(contentTasks.source, input.source));
  if (input.kind) conditions.push(eq(contentTasks.kind, input.kind));
  const rows = await db
    .select()
    .from(contentTasks)
    .where(and(...conditions))
    .orderBy(desc(contentTasks.startedAt), desc(contentTasks.id))
    .limit(input.limit ?? 20)
    .offset(input.offset ?? 0);
  const count = await db
    .select({ total: sql<number>`count(*)` })
    .from(contentTasks)
    .where(and(...conditions))
    .get();
  return { items: rows, total: count?.total ?? 0 };
}
export async function contentSyncTotals() {
  const counters = await db.select().from(contentTaskCounters);
  const latest = await db
    .select()
    .from(contentTasks)
    .where(and(eq(contentTasks.kind, "sync"), sql`${contentTasks.finishedAt} IS NOT NULL`))
    .orderBy(desc(contentTasks.finishedAt))
    .get();
  return {
    totalSyncs: counters.reduce((n, row) => n + row.total, 0),
    trackingSince: counters.length ? Math.min(...counters.map((x) => x.trackingSince)) : null,
    lastSyncTime: latest?.finishedAt ?? null,
  };
}
export async function cancelContentTask(id: string) {
  const result = db.transaction((tx) => {
    const task = tx.select().from(contentTasks).where(eq(contentTasks.id, id)).get();
    if (!task) throw new Error("Task not found");
    if (task.finishedAt !== null) return { taskId: id, status: task.status };
    if (
      task.phase === "adopted" ||
      (task.kind === "sync" &&
        task.source === "playbook" &&
        getPlaybookSnapshotStore().getCurrent()?.taskId === id)
    ) {
      return { taskId: id, status: "completed" };
    }
    tx.update(contentTasks)
      .set({ cancelRequested: true })
      .where(and(eq(contentTasks.id, id), sql`${contentTasks.finishedAt} IS NULL`))
      .run();
    return { taskId: id, status: "cancelling" };
  });
  const task = await getContentTask(id);
  if (result.status === "completed") finishContentTask(id, "success");
  if (result.status === "cancelling") {
    taskControllers.get(id)?.abort(new DOMException("Task cancelled", "AbortError"));
    if (task && !taskOwnerIsLive(task)) finishContentTask(id, "cancelled");
  }
  return result;
}
