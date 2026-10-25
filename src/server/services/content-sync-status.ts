import { and, desc, eq, sql } from "drizzle-orm";
import { getContentSourceManager } from "@/lib/content-sources";
import { db } from "@/lib/db";
import { getPlaybookPolicies } from "@/lib/playbook/navigation";
import { contentTasks, posts, searchOutbox } from "@/lib/schema";
import { playbookSyncEnabled } from "./content-sync-runtime";
import { contentSyncTotals, listContentTasks } from "./content-tasks";
import {
  getPlaybookSnapshotStore,
  type PlaybookStoredSnapshot,
  samePlaybookSnapshotIdentity,
} from "./playbook-snapshot-store";
import type { RagScope } from "./rag-index";
import { getAdminSearchSettings } from "./search-policy";

type PlaybookSyncState =
  | "unconfigured"
  | "current"
  | "checking"
  | "stale"
  | "failed"
  | "invalid"
  | "unavailable";

function decodeTaskResult(result: string | null) {
  if (!result) return null;
  try {
    return JSON.parse(result) as {
      sourceStatus?: string;
      comparison?: "current" | "stale";
      error?: string;
    };
  } catch {
    return null;
  }
}

function snapshotMeta(snapshot: PlaybookStoredSnapshot | null) {
  if (!snapshot) return null;
  const edition = snapshot.contentHash;
  const source = {
    releaseId: snapshot.sourceRevision.commit,
    tag: snapshot.sourceRevision.ref,
  };
  return {
    slot: snapshot.slot,
    provider: snapshot.sourceRevision.provider,
    repository: snapshot.sourceRevision.repository,
    ref: snapshot.sourceRevision.ref,
    commit: snapshot.sourceRevision.commit,
    contentHash: snapshot.contentHash,
    checkedAt: snapshot.checkedAt,
    adoptedAt: snapshot.adoptedAt,
    taskId: snapshot.taskId,
    // Keep the old admin identity shape readable while the admin surface moves
    // to provider/repository/ref/commit metadata.
    edition,
    editionDigest: edition,
    source,
    sourceReleaseId: source.releaseId,
    sourceTag: source.tag,
    generatedAt: new Date(snapshot.adoptedAt || snapshot.checkedAt).toISOString(),
  };
}

function countPlaybookContent(snapshot: PlaybookStoredSnapshot | null) {
  if (!snapshot) return { total: 0, byType: {} as Record<string, number> };
  const policies = getPlaybookPolicies(snapshot.catalog);
  const byType = {
    topic: snapshot.catalog.topic_details.length,
    experience: snapshot.catalog.project_details.length,
    policy: policies.length,
  };
  return { total: Object.values(byType).reduce((total, count) => total + count, 0), byType };
}

function emptyRagStatus(scope: RagScope, current: PlaybookStoredSnapshot | null) {
  const empty = () => ({
    total: 0,
    indexed: null,
    unindexed: null,
    outdated: null,
    failed: null,
    coverage: null,
  });
  const wantsBlog = scope.source !== "playbook";
  const wantsPlaybook = scope.source !== "blog";
  const identity = {
    source: scope.source ?? "all",
    type: scope.type ?? "all",
    access: "public" as const,
    fingerprint: null,
    model: null,
    configuredDim: null,
    policy: null,
    playbook: current
      ? {
          edition: current.contentHash,
          sourceReleaseId: current.sourceRevision.commit,
          sourceTag: current.sourceRevision.ref,
        }
      : null,
  };
  return {
    available: false,
    reason: wantsPlaybook && !current ? "snapshot-unavailable" : "semantic-projection-pending",
    missingSources: wantsPlaybook && !current ? ["playbook"] : [],
    identity,
    details: [],
    lastIndexedAt: null,
    incompleteSources: wantsPlaybook && !current ? ["playbook"] : [],
    contents: empty(),
    chunks: empty(),
    bySource: [
      { source: "blog", available: wantsBlog, contents: empty(), chunks: empty() },
      {
        source: "playbook",
        available: wantsPlaybook && Boolean(current),
        contents: empty(),
        chunks: empty(),
      },
    ],
  };
}

async function readStatus(scope: RagScope = {}) {
  const store = getPlaybookSnapshotStore();
  const current = store.getCurrent();
  const previous = store.getPrevious();
  const currentIdentity = current
    ? { sourceRevision: current.sourceRevision, contentHash: current.contentHash }
    : null;
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
  const playbookCounts = countPlaybookContent(current);
  const byType: Record<string, number> = { ...playbookCounts.byType },
    bySource: Record<string, number> = { playbook: playbookCounts.total };
  for (const row of local) {
    byType[row.type] = (byType[row.type] ?? 0) + row.count;
    bySource[row.source] = (bySource[row.source] ?? 0) + row.count;
  }
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
      total: playbookCounts.total,
      lastCheckAt: null as number | null,
      lastSuccessAt: null as number | null,
    },
  ];
  let playbookTask: typeof contentTasks.$inferSelect | undefined;
  let playbookSuccess: typeof contentTasks.$inferSelect | undefined;
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
    if (source.name === "playbook") {
      playbookTask = latest;
      playbookSuccess = success;
    }
    Object.assign(source, {
      lastCheckAt: latest?.startedAt ?? null,
      lastSuccessAt: success?.finishedAt ?? null,
    });
  }
  const taskResult = decodeTaskResult(playbookTask?.result ?? null);
  const active = Boolean(playbookTask && playbookTask.finishedAt === null);
  const completedSuccessfully = Boolean(
    playbookTask && ["success", "unchanged"].includes(playbookTask.status)
  );
  const sourceState: PlaybookSyncState = active
    ? "checking"
    : taskResult?.sourceStatus === "unconfigured"
      ? "unconfigured"
      : taskResult?.sourceStatus === "invalid"
        ? "invalid"
        : taskResult?.sourceStatus === "failed"
          ? "failed"
          : taskResult?.comparison === "stale" && !completedSuccessfully
            ? "stale"
            : current
              ? "current"
              : "unavailable";
  const totals = await contentSyncTotals();
  const tasks = await listContentTasks({ limit: 10 });
  const rag = emptyRagStatus(scope, scope.edition === "previous" ? previous : current);
  if (before !== watermark() || !samePlaybookSnapshotIdentity(currentIdentity, store.getCurrent()))
    throw new Error("content-status-changed");
  return {
    observedAt: Date.now(),
    summary: {
      registeredSources: sources.length,
      enabledSources: sources.filter((x) => x.enabled).length,
      total: local.reduce((sum, row) => sum + row.count, 0) + playbookCounts.total,
      ...totals,
    },
    content: { byType, bySource },
    sources,
    playbook: {
      adopted: Boolean(current),
      state: sourceState,
      sourceStatus: taskResult?.sourceStatus ?? (current ? "ready" : "unavailable"),
      repository: current?.sourceRevision.repository ?? null,
      ref: current?.sourceRevision.ref ?? null,
      adoptedAt: current?.adoptedAt ?? null,
      current: snapshotMeta(current),
      previous: snapshotMeta(previous),
      lexical: {
        status: current ? "ready" : "unavailable",
        count: playbookCounts.total,
      },
      semantic: {
        status: "unavailable",
        lastError: taskResult?.error ?? null,
      },
      lastCheckAt: playbookTask?.startedAt ?? null,
      lastSuccessAt: playbookSuccess?.finishedAt ?? null,
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
