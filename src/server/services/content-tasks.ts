import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentTaskCounters, contentTasks } from "@/lib/schema";

export type ContentTask = typeof contentTasks.$inferSelect;
export const taskControllers = new Map<string, AbortController>();
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
    if (active) {
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
      tx.update(contentTasks)
        .set({
          requestKey: input.requestKey,
          target: input.target,
          status: "running",
          phase: "recovering",
        })
        .where(eq(contentTasks.id, previous.id))
        .run();
      return {
        task: {
          ...previous,
          requestKey: input.requestKey,
          target: input.target,
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
      status: "running",
      phase: "preparing",
      total: 0,
      processed: 0,
      failed: 0,
      error: null,
      startedAt: now,
      finishedAt: null,
      cancelRequested: false,
    };
    tx.insert(contentTasks).values(task).run();
    return { task, reused: false };
  });
  if (!result.reused) taskControllers.set(result.task.id, new AbortController());
  return result;
}

export async function updateContentTask(
  id: string,
  values: Partial<Pick<ContentTask, "phase" | "total" | "processed" | "failed" | "target">>
) {
  await db
    .update(contentTasks)
    .set(values)
    .where(and(eq(contentTasks.id, id), eq(contentTasks.status, "running")));
}
export function finishContentTask(
  id: string,
  status: "success" | "unchanged" | "failed" | "cancelled",
  error?: string
) {
  db.transaction((tx) => {
    const task = tx.select().from(contentTasks).where(eq(contentTasks.id, id)).get();
    if (!task || task.finishedAt !== null) return;
    const terminal = task.cancelRequested && task.phase !== "adopted" ? "cancelled" : status;
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
  taskControllers.delete(id);
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
  const task = await getContentTask(id);
  if (!task) throw new Error("Task not found");
  if (task.finishedAt !== null) return { taskId: id, status: task.status };
  if (task.phase === "adopted") return { taskId: id, status: "completed" };
  await db.update(contentTasks).set({ cancelRequested: true }).where(eq(contentTasks.id, id));
  taskControllers.get(id)?.abort(new DOMException("Task cancelled", "AbortError"));
  if (!taskControllers.has(id)) finishContentTask(id, "cancelled");
  return { taskId: id, status: "cancelling" };
}
