import { and, desc, eq, sql } from "drizzle-orm";
import { getContentSourceManager } from "@/lib/content-sources";
import { db } from "@/lib/db";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import { contentTasks, posts, searchOutbox } from "@/lib/schema";
import { playbookSyncEnabled } from "./content-sync-runtime";
import { contentSyncTotals, listContentTasks } from "./content-tasks";
import { listPlaybookCandidates } from "./playbook-search";
import { type RagScope, ragCoverage } from "./rag-index";
import { getAdminSearchSettings } from "./search-policy";

async function readStatus(scope: RagScope = {}) {
  const store = getRuntimePlaybookStore();
  await store.load();
  const current = store.current;
  const watermark = () =>
    db
      .select({ seq: sql<number>`coalesce(max(${searchOutbox.seq}),0)` })
      .from(searchOutbox)
      .get()?.seq ?? 0;
  const before = watermark();
  const local = await db
    .select({ source: posts.source, type: posts.type, count: sql<number>`count(*)` })
    .from(posts)
    .groupBy(posts.source, posts.type);
  const playbook = current ? listPlaybookCandidates(current) : [];
  const byType: Record<string, number> = {},
    bySource: Record<string, number> = {};
  for (const row of local) {
    byType[row.type] = (byType[row.type] ?? 0) + row.count;
    bySource[row.source] = (bySource[row.source] ?? 0) + row.count;
  }
  bySource.playbook = playbook.length;
  for (const row of playbook) byType[row.type] = (byType[row.type] ?? 0) + 1;
  const manager = getContentSourceManager();
  const localSources = manager.getSources();
  const sources = [
    ...localSources.map((source) => ({
      name: source.name,
      type: source.type,
      enabled: source.enabled,
      total: bySource[source.name] ?? 0,
      lastCheckAt: null as number | null,
      lastSuccessAt: null as number | null,
    })),
    {
      name: "playbook",
      type: "playbook",
      enabled: playbookSyncEnabled(),
      total: playbook.length,
      lastCheckAt: null as number | null,
      lastSuccessAt: null as number | null,
    },
  ];
  for (const source of sources) {
    const latest = db
      .select()
      .from(contentTasks)
      .where(and(eq(contentTasks.kind, "sync"), eq(contentTasks.source, source.name)))
      .orderBy(desc(contentTasks.startedAt))
      .get();
    const success = db
      .select()
      .from(contentTasks)
      .where(
        and(
          eq(contentTasks.kind, "sync"),
          eq(contentTasks.source, source.name),
          sql`${contentTasks.status} IN ('success','unchanged')`
        )
      )
      .orderBy(desc(contentTasks.finishedAt))
      .get();
    Object.assign(source, {
      lastCheckAt: latest?.startedAt ?? null,
      lastSuccessAt: success?.finishedAt ?? null,
    });
  }
  const totals = await contentSyncTotals(),
    tasks = await listContentTasks({ limit: 10 });
  const selected = scope.edition === "previous" ? store.previous : current;
  const coverage = (await ragCoverage({ ...scope, playbook: selected ?? null })).status;
  const unavailable = !coverage.available || coverage.missingSources.length > 0;
  const metrics = (counts: typeof coverage.contents, unknown: boolean) => ({
    ...counts,
    indexed: unknown ? null : counts.indexed,
    unindexed: unknown ? null : counts.unindexed,
    outdated: unknown ? null : counts.outdated,
    failed: unknown ? null : counts.failed,
    coverage: unknown ? null : counts.coverage,
  });
  const rag = {
    ...coverage,
    contents: metrics(coverage.contents, unavailable),
    chunks: metrics(coverage.chunks, unavailable),
    bySource: coverage.bySource.map((row) => ({
      ...row,
      contents: metrics(row.contents, !row.available),
      chunks: metrics(row.chunks, !row.available),
    })),
  };
  if (before !== watermark() || current !== store.current) {
    throw new Error("content-status-changed");
  }
  return {
    observedAt: Date.now(),
    summary: {
      registeredSources: sources.length,
      enabledSources: sources.filter((x) => x.enabled).length,
      total: local.reduce((sum, row) => sum + row.count, 0) + playbook.length,
      ...totals,
    },
    content: { byType, bySource },
    sources,
    playbook: {
      adopted: Boolean(current),
      adoptedAt: store.adoption?.at ?? null,
      current: current?.edition ?? null,
      previous: store.previous?.edition ?? null,
    },
    rag,
    tasks,
    policy: (await getAdminSearchSettings()).status,
  };
}
export async function contentSyncStatus(scope: RagScope = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await readStatus(scope);
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Error) || error.message !== "content-status-changed")
        throw error;
    }
  }
}
export type UnifiedContentSyncStatus = Awaited<ReturnType<typeof contentSyncStatus>>;
