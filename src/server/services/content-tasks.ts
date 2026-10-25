import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentTaskCounters, contentTasks } from "@/lib/schema";
import { getPlaybookSnapshotStore } from "./playbook-snapshot-store";

export type ContentTask = typeof contentTasks.$inferSelect;
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
export async function beginContentTask(input: {
  kind: "sync" | "rag";
  source: "local" | "playbook";
  requestKey: string;
  origin: string;
  target: string;
  resumeId?: string;
}) {
  const result = db.transaction((tx) => {
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
      requestKey: input.requestKey,
      origin: input.origin,
      target: input.target,
      result: null,
      status: "running",
      phase: "preparing",
      total: 0,
      processed: 0,
      failed: 0,
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
  values: Partial<
    Pick<ContentTask, "phase" | "total" | "processed" | "failed" | "target" | "result">
  >,
  token = owners.get(id)?.token
) {
  await db
    .update(contentTasks)
    .set(values)
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
    const terminal = committed
      ? "success"
      : task.cancelRequested && task.phase !== "adopted"
        ? "cancelled"
        : status;
    tx.update(contentTasks)
      .set({ status: terminal, phase: terminal, error: error ?? null, finishedAt: Date.now() })
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
