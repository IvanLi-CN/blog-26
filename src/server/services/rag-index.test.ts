import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { projectionDigest } from "@/lib/ai/embedding-target";
import {
  getContentSourceManager,
  LocalContentSource,
  resetContentSourceManager,
} from "@/lib/content-sources";
import { ContentSourceManager } from "@/lib/content-sources/manager";
import { db, initializeDB } from "@/lib/db";
import { publicFixtureCatalog, publicFixtureSearch } from "@/lib/playbook/fixture";
import { computePlaybookContentHash } from "@/lib/playbook/manifest";
import type { PlaybookGitHubSnapshot } from "@/lib/playbook/types";
import {
  contentTaskCounters,
  contentTasks,
  playbookSnapshots,
  postEmbeddings,
  posts,
  ragIndexConfigs,
  ragIndexManifests,
  ragIndexTargets,
  searchSemanticEmbeddings,
  users,
} from "@/lib/schema";
import { syncEventManager } from "@/lib/sync-events";
import { makePublicBundle } from "../../../tests/lib/playbook-fixture";
import {
  checkPlaybook,
  PLAYBOOK_SYNC_REQUEST_KEY,
  startContentSyncRuntime,
} from "./content-sync-runtime";
import { contentSyncStatus } from "./content-sync-status";
import {
  assertContentTaskOwner,
  beginContentTask,
  cancelContentTask,
  contentSyncTotals,
  finishContentTask,
  getContentTask,
  updateContentTask,
} from "./content-tasks";
import { PlaybookSnapshotStore } from "./playbook-snapshot-store";
import { ragCoverage, runRagIndex, summarizeCoverage, triggerRagIndex } from "./rag-index";

const originalFetch = globalThis.fetch;
const environment = { ...process.env };
let root: string;
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "rag-coverage-test-"));
  process.env.DB_PATH = join(root, "db.sqlite");
  process.env.OPENAI_API_KEY = "synthetic";
  process.env.OPENAI_API_BASE_URL = "https://synthetic.example.test";
  process.env.EMBEDDING_MODEL_NAME = "synthetic";
  process.env.EMBED_CHUNK_SIZE = "100";
  process.env.EMBED_CHUNK_OVERLAP = "10";
  delete process.env.EMBEDDING_DIMENSION;
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
});
beforeEach(async () => {
  await db.delete(posts);
  await db.delete(postEmbeddings);
  await db.delete(playbookSnapshots);
  await db.delete(ragIndexTargets);
  await db.delete(ragIndexConfigs);
  await db.delete(contentTasks);
  await db.delete(contentTaskCounters);
  await db.delete(ragIndexManifests);
  await db.delete(searchSemanticEmbeddings);
  globalThis.fetch = Object.assign(async () => Response.json({ data: [{ embedding: [1, 0] }] }), {
    preconnect: originalFetch.preconnect,
  });
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  rmSync(root, { recursive: true, force: true });
});
const fixture = (id: string, body = "Public synthetic content") => ({
  id,
  slug: id,
  type: "post",
  title: id,
  body,
  publishDate: 1,
  public: true,
  draft: false,
  contentHash: id,
  dataSource: "local",
});
function snapshotFor(bundle: ReturnType<typeof makePublicBundle>): PlaybookGitHubSnapshot {
  const normalized = {
    catalog: bundle.edition.catalog,
    search: bundle.edition.search,
  };
  return {
    ...normalized,
    sourceRevision: {
      provider: "github",
      repository: bundle.edition.edition.source.repository,
      ref: bundle.edition.edition.source.tag,
      commit: bundle.edition.edition.source.commit,
    },
    contentHash: computePlaybookContentHash(normalized),
  };
}
function snapshotIdentity(snapshot: PlaybookGitHubSnapshot) {
  return { sourceRevision: snapshot.sourceRevision, contentHash: snapshot.contentHash };
}
async function completed(id: string) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const task = await getContentTask(id);
    if (task?.finishedAt !== null && task) return task;
    await Bun.sleep(10);
  }
  throw new Error("Task did not reach terminal state");
}
test("parent coverage conserves totals with fifty chunks and partial failure", () => {
  const rows = Array.from({ length: 50 }, () => ({
    parentId: "policy",
    state: "indexed" as const,
  }));
  expect(summarizeCoverage(rows).contents).toMatchObject({ total: 1, indexed: 1 });
  const mixed = [...rows.slice(1), { parentId: "policy", state: "failed" as const }];
  const result = summarizeCoverage(mixed);
  expect(result.contents).toMatchObject({ total: 1, indexed: 0, failed: 1 });
  expect(result.chunks.total).toBe(
    result.chunks.indexed + result.chunks.failed + result.chunks.outdated + result.chunks.unindexed
  );
  expect(summarizeCoverage([]).contents.coverage).toBeNull();
});
test("no records still expose expected public targets; projects and private drafts excluded", async () => {
  await db
    .insert(posts)
    .values([
      fixture("public", "x".repeat(350)),
      { ...fixture("private"), public: false },
      { ...fixture("draft"), draft: true },
      { ...fixture("project"), type: "project" },
    ]);
  const { status } = await ragCoverage({ source: "blog" });
  expect(status.contents).toMatchObject({ total: 1, indexed: 0, unindexed: 1 });
  expect(status.chunks.total).toBeGreaterThan(1);
  expect(status.incompleteSources).toEqual(["blog"]);
});
test("producer and coverage agree, reject corrupted vectors and revoked content", async () => {
  await db.insert(posts).values(fixture("content", "x".repeat(250)));
  const { taskId } = await runRagIndex({ source: "blog" }, "repair");
  expect((await completed(taskId)).status).toBe("success");
  let coverage = await ragCoverage({ source: "blog" });
  expect(coverage.status.contents).toMatchObject({ total: 1, indexed: 1 });
  expect(coverage.status.incompleteSources).toEqual([]);
  const vector = (await db.select().from(postEmbeddings))[0];
  await db
    .update(postEmbeddings)
    .set({ vector: Buffer.from(new Float32Array([NaN, 0]).buffer) })
    .where(eq(postEmbeddings.id, vector.id));
  coverage = await ragCoverage({ source: "blog" });
  expect(coverage.status.contents.outdated).toBe(1);
  expect(coverage.eligibleVectorIds.has(vector.id)).toBe(false);
  await db.update(posts).set({ public: false }).where(eq(posts.id, "content"));
  expect((await ragCoverage({ source: "blog" })).status.contents.total).toBe(0);
});
test("history vectors without provenance remain stale, isolated rows add no contents", async () => {
  await db.insert(posts).values(fixture("legacy"));
  await db.insert(postEmbeddings).values({
    id: "old",
    chunkIndex: 0,
    postId: "legacy",
    slug: "legacy",
    type: "post",
    modelName: "synthetic",
    dim: 2,
    contentHash: "old",
    vector: Buffer.from(new Float32Array([1, 0]).buffer),
    createdAt: 1,
    updatedAt: 1,
  });
  await db.insert(postEmbeddings).values({
    id: "orphan",
    postId: "missing",
    slug: "missing",
    type: "post",
    modelName: "synthetic",
    dim: 2,
    contentHash: "old",
    vector: Buffer.from(new Float32Array([1, 0]).buffer),
    createdAt: 1,
    updatedAt: 1,
  });
  expect((await ragCoverage({ source: "blog" })).status.contents).toMatchObject({
    total: 1,
    indexed: 0,
    outdated: 1,
  });
});
test("singleflight and terminal transaction count each content task once", async () => {
  const input = {
    kind: "sync" as const,
    source: "local" as const,
    requestKey: "same",
    origin: "test",
    target: "{}",
  };
  const [first, second] = await Promise.all([beginContentTask(input), beginContentTask(input)]);
  expect(first.task.id).toBe(second.task.id);
  expect(second.reused).toBe(true);
  await expect(beginContentTask({ ...input, requestKey: "different" })).rejects.toThrow(
    "Task conflict:"
  );
  const before = (await contentSyncTotals()).totalSyncs;
  finishContentTask(first.task.id, "success");
  finishContentTask(first.task.id, "success");
  expect((await contentSyncTotals()).totalSyncs).toBe(before + 1);
  const rag = await beginContentTask({ ...input, kind: "rag" });
  finishContentTask(rag.task.id, "success");
  expect((await contentSyncTotals()).totalSyncs).toBe(before + 1);
});
test("cancel is durable and a late provider result cannot commit", async () => {
  await db.insert(posts).values(fixture("cancelled"));
  let resolve: (response: Response) => void = () => {
    /* Replaced when the synthetic request starts. */
  };
  let requested = false;
  globalThis.fetch = Object.assign(
    async () => {
      requested = true;
      return await new Promise<Response>((done) => {
        resolve = done;
      });
    },
    { preconnect: originalFetch.preconnect }
  );
  const { taskId } = await runRagIndex({ source: "blog" }, "repair");
  while (!requested) await Bun.sleep(5);
  await cancelContentTask(taskId);
  expect((await getContentTask(taskId))?.cancelRequested).toBe(true);
  resolve(Response.json({ data: [{ embedding: [1, 0] }] }));
  expect((await completed(taskId)).status).toBe("cancelled");
  expect((await db.select().from(postEmbeddings)).length).toBe(0);
  expect((await ragCoverage({ source: "blog" })).status.contents.unindexed).toBe(1);
  expect(
    (await db.select().from(contentTasks).where(eq(contentTasks.id, taskId)))[0].finishedAt
  ).not.toBeNull();
});

test("Playbook current and previous projections retain content identity across reload", async () => {
  const store = new PlaybookSnapshotStore();
  const first = snapshotFor(makePublicBundle("v3.0.0", "100"));
  store.adopt(first, { expectedCurrent: null });
  const job = await runRagIndex({ source: "playbook" }, "repair");
  expect((await completed(job.taskId)).status).toBe("success");
  expect((await ragCoverage({ source: "playbook" })).status.contents.indexed).toBe(3);
  const second = snapshotFor(makePublicBundle("v3.0.1", "101"));
  store.adopt(second, { expectedCurrent: snapshotIdentity(first) });
  expect((await ragCoverage({ source: "playbook" })).status.contents.indexed).toBe(3);
  expect(
    (await ragCoverage({ source: "playbook", edition: "previous" })).status.contents.indexed
  ).toBe(3);
  const reloaded = new PlaybookSnapshotStore();
  expect(reloaded.current?.sourceRevision.ref).toBe("v3.0.1");
  expect(reloaded.previous?.sourceRevision.ref).toBe("v3.0.0");
});

test("Playbook RAG reuses vectors when only source provenance changes", async () => {
  const store = new PlaybookSnapshotStore();
  const first = snapshotFor(makePublicBundle("v3.0.0", "100"));
  store.adopt(first, { expectedCurrent: null });
  let requests = 0;
  globalThis.fetch = Object.assign(
    async () => {
      requests++;
      return Response.json({ data: [{ embedding: [1, 0] }] });
    },
    { preconnect: originalFetch.preconnect }
  );

  const initialJob = await runRagIndex({ source: "playbook" }, "repair");
  expect((await completed(initialJob.taskId)).status).toBe("success");
  const beforeProvenanceOnlyRefresh = requests;
  const next = {
    ...first,
    sourceRevision: { ...first.sourceRevision, commit: "c".repeat(40) },
  };
  store.adopt(next, { expectedCurrent: snapshotIdentity(first) });

  expect((await ragCoverage({ source: "playbook" })).status.contents.indexed).toBe(3);
  const refreshJob = await runRagIndex({ source: "playbook" }, "repair");
  expect(refreshJob.reused).toBe(false);
  expect((await completed(refreshJob.taskId)).status).toBe("success");
  expect(requests).toBe(beforeProvenanceOnlyRefresh);

  const initialTarget = JSON.parse((await getContentTask(initialJob.taskId))?.target ?? "{}") as {
    targetKey?: string;
  };
  const refreshedTarget = JSON.parse((await getContentTask(refreshJob.taskId))?.target ?? "{}") as {
    targetKey?: string;
  };
  expect(refreshedTarget.targetKey).toBe(initialTarget.targetKey);
});

test("Playbook adoption queues RAG preparation after the sync task completes", async () => {
  const previousToken = process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  const store = new PlaybookSnapshotStore();
  const current = snapshotFor(makePublicBundle("v3.2.0", "120"));
  const next = snapshotFor(makePublicBundle("v3.2.1", "121"));
  store.adopt(current, { expectedCurrent: null });

  try {
    expect(
      await checkPlaybook("manual", undefined, {
        store,
        sourceLoader: async () => ({ status: "ready", snapshot: next }),
      })
    ).toEqual({ cancelled: false, adopted: true });

    let ragTask = db.select().from(contentTasks).where(eq(contentTasks.kind, "rag")).get();
    for (let attempt = 0; attempt < 200 && !ragTask; attempt++) {
      await Bun.sleep(5);
      ragTask = db.select().from(contentTasks).where(eq(contentTasks.kind, "rag")).get();
    }
    expect(ragTask?.source).toBe("playbook");
    expect((await completed(ragTask?.id ?? "")).status).toBe("success");
  } finally {
    if (previousToken === undefined) delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
    else process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = previousToken;
  }
});

test("Playbook adoption retries RAG after an older task releases its source lock", async () => {
  const previousToken = process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  const store = new PlaybookSnapshotStore();
  const current = snapshotFor(makePublicBundle("v3.3.0", "130"));
  const nextCatalog = structuredClone(publicFixtureCatalog);
  nextCatalog.snapshot.topics[0].token = "Changed topic";
  const next = snapshotFor(makePublicBundle("v3.3.1", "131", nextCatalog));
  store.adopt(current, { expectedCurrent: null });
  let release: ((response: Response) => void) | undefined;
  let requests = 0;
  globalThis.fetch = Object.assign(
    async () => {
      requests++;
      if (requests === 1)
        return await new Promise<Response>((resolve) => {
          release = resolve;
        });
      return Response.json({ data: [{ embedding: [1, 0] }] });
    },
    { preconnect: originalFetch.preconnect }
  );

  try {
    const first = await runRagIndex({ source: "playbook" }, "repair");
    while (!release) await Bun.sleep(5);
    expect(
      await checkPlaybook("manual", undefined, {
        store,
        sourceLoader: async () => ({ status: "ready", snapshot: next }),
      })
    ).toEqual({ cancelled: false, adopted: true });
    release(new Response(JSON.stringify({ data: [{ embedding: [1, 0] }] }), { status: 200 }));

    let retry = (await db.select().from(contentTasks)).find(
      (task) => task.kind === "rag" && task.id !== first.taskId
    );
    for (let attempt = 0; attempt < 1000 && !retry; attempt++) {
      await Bun.sleep(5);
      retry = (await db.select().from(contentTasks)).find(
        (task) => task.kind === "rag" && task.id !== first.taskId
      );
    }
    expect(retry?.source).toBe("playbook");
    expect((await completed(retry?.id ?? "")).status).toBe("success");
    expect((await ragCoverage({ source: "playbook" })).status.contents.indexed).toBe(3);
  } finally {
    release?.(Response.json({ data: [{ embedding: [1, 0] }] }));
    if (previousToken === undefined) delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
    else process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = previousToken;
  }
});

test("startup prepares missing current Playbook coverage after a persisted snapshot", async () => {
  const previousToken = process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  const store = new PlaybookSnapshotStore();
  store.adopt(snapshotFor(makePublicBundle("v3.4.0", "140")), { expectedCurrent: null });
  const stop = await startContentSyncRuntime({
    store,
    schedule: () => () => undefined,
  });

  try {
    let ragTask = db.select().from(contentTasks).where(eq(contentTasks.kind, "rag")).get();
    for (let attempt = 0; attempt < 200 && !ragTask; attempt++) {
      await Bun.sleep(5);
      ragTask = db.select().from(contentTasks).where(eq(contentTasks.kind, "rag")).get();
    }
    expect(ragTask?.source).toBe("playbook");
    expect((await completed(ragTask?.id ?? "")).status).toBe("success");
    expect((await ragCoverage({ source: "playbook" })).status.contents.indexed).toBe(3);
  } finally {
    stop();
    if (previousToken === undefined) delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
    else process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = previousToken;
  }
});

test("summary includes both sources, unique current parents and disabled cached content", async () => {
  const catalog = structuredClone(publicFixtureCatalog);
  for (let i = 0; i < 77; i++) {
    const topic = structuredClone(catalog.snapshot.topics[0]);
    topic.slug = `topic-${i}`;
    topic.token = `Topic ${i}`;
    catalog.snapshot.topics.push(topic);
    const detail = structuredClone(catalog.topic_details[0]);
    detail.item = topic;
    detail.policy_skills = [];
    catalog.topic_details.push(detail);
  }
  catalog.snapshot.index.topic_count = 78;
  const bundle = makePublicBundle("v3.1.0", "102", catalog, publicFixtureSearch);
  new PlaybookSnapshotStore().adopt(snapshotFor(bundle), { expectedCurrent: null });
  await db.insert(posts).values(Array.from({ length: 324 }, (_, i) => fixture(`content-${i}`)));
  const manager = getContentSourceManager();
  if (!manager.getSources().length) {
    const config = LocalContentSource.createDefaultConfig("local", 50, { contentPath: root });
    config.enabled = false;
    await manager.registerSource(new LocalContentSource(config));
  }
  const status = await contentSyncStatus();
  expect(status.summary).toMatchObject({ registeredSources: 2, enabledSources: 0, total: 404 });
  expect(Object.values(status.content.byType).reduce((n, x) => n + x, 0)).toBe(404);
  expect(status.content.bySource).toMatchObject({ local: 324, playbook: 80 });
});
test("interrupted RAG tasks resume with the same target identity", async () => {
  process.env.PLAYBOOK_SYNC_ENABLED = "false";
  await db.insert(posts).values(fixture("recover"));
  const catalog = await ragCoverage({ source: "blog" });
  const previous = await beginContentTask({
    kind: "rag",
    source: "local",
    requestKey: projectionDigest({
      targetKey: projectionDigest({
        source: "blog",
        type: "all",
        targets: catalog.catalog.targets.map((row) => row.id),
        fingerprint: catalog.status.identity.fingerprint,
        playbook: catalog.status.identity.playbook,
      }),
      mode: "repair",
    }),
    origin: "test",
    target: JSON.stringify({
      source: "blog",
      mode: "repair",
      edition: "current",
      identity: catalog.status.identity,
    }),
  });
  await db
    .update(contentTasks)
    .set({ status: "interrupted", phase: "interrupted" })
    .where(eq(contentTasks.id, previous.task.id));
  const stop = await startContentSyncRuntime();
  try {
    expect((await completed(previous.task.id)).status).toBe("success");
    expect((await ragCoverage({ source: "blog" })).status.contents.indexed).toBe(1);
  } finally {
    stop();
  }
});

test("new inputs invalidate coverage and a bound provider dimension cannot change silently", async () => {
  await db.insert(posts).values(fixture("changed"));
  const first = await runRagIndex({ source: "blog" }, "repair");
  expect((await completed(first.taskId)).status).toBe("success");
  await db
    .update(posts)
    .set({ body: "Changed synthetic input", contentHash: "different" })
    .where(eq(posts.id, "changed"));
  expect((await ragCoverage({ source: "blog" })).status.contents.outdated).toBe(1);
  globalThis.fetch = Object.assign(
    async () => Response.json({ data: [{ embedding: [1, 0, 0] }] }),
    { preconnect: originalFetch.preconnect }
  );
  const next = await runRagIndex({ source: "blog" }, "repair");
  expect((await completed(next.taskId)).status).toBe("failed");
  expect((await ragCoverage({ source: "blog" })).status.contents.failed).toBe(1);
});

test("administrator contracts enforce access and share the canonical snapshot", async () => {
  const { appRouter } = await import("@/server/router");
  const { handleAdminApiRequest } = await import("@/server/admin-api/router");
  const context = {
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    isAdmin: false,
  };
  const guest = appRouter.createCaller(context);
  await expect(guest.admin.contentSync.getStatus()).rejects.toThrow();
  for (const route of [
    "/content-sync/status",
    "/content-sync/tasks",
    "/content-sync/tasks/550e8400-e29b-41d4-a716-446655440000",
  ]) {
    const response = await handleAdminApiRequest(
      new Request(`http://localhost/api/admin${route}`),
      route
    );
    expect([401, 403]).toContain(response.status);
  }
  const administrator = appRouter.createCaller({
    ...context,
    isAdmin: true,
    user: { id: "synthetic-admin", email: "synthetic@example.test", nickname: "Synthetic" },
  });
  const status = await administrator.admin.contentSync.getStatus({
    source: "blog",
    type: "all",
    edition: "current",
  });
  const direct = await contentSyncStatus({ source: "blog" });
  expect(status.summary).toEqual(direct.summary);
  expect(status.rag.contents).toEqual(direct.rag.contents);
  await expect(
    administrator.admin.contentSync.getStatus({ source: "all", type: "all", edition: "previous" })
  ).rejects.toThrow("Previous edition");
  await expect(
    administrator.admin.contentSync.getTask({ taskId: "550e8400-e29b-41d4-a716-446655440000" })
  ).rejects.toThrow("Task not found");
});

test("cancelled targets stay cancelled across startup without automatic model calls", async () => {
  await db.insert(posts).values(fixture("cancel-recovery"));
  let requests = 0;
  globalThis.fetch = Object.assign(
    async () => {
      requests++;
      return Response.json({ data: [{ embedding: [1, 0] }] });
    },
    { preconnect: originalFetch.preconnect }
  );
  const task = await runRagIndex({ source: "blog" }, "repair");
  await cancelContentTask(task.taskId);
  await completed(task.taskId);
  const before = requests;
  const stop = await startContentSyncRuntime();
  await Bun.sleep(30);
  stop();
  expect((await getContentTask(task.taskId))?.status).toBe("cancelled");
  expect(requests).toBe(before);
  expect((await triggerRagIndex("blog", "repair", "content-sync")).taskIds).toEqual([]);
  expect(requests).toBe(before);
  const explicit = await runRagIndex({ source: "blog" }, "repair");
  expect((await completed(explicit.taskId)).status).toBe("success");
  expect(requests).toBeGreaterThan(before);
});

test("a committed adoption checkpoint outranks a stale cancellation on restart", async () => {
  const { task } = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: "public-deployment-pointer",
    origin: "test",
    target: "null",
  });
  await db
    .update(contentTasks)
    .set({ phase: "adopting", cancelRequested: true, leaseUntil: 0 })
    .where(eq(contentTasks.id, task.id));
  const store = new PlaybookSnapshotStore();
  store.adopt(snapshotFor(makePublicBundle("v9.0.1", "901")), {
    taskId: task.id,
    checkedAt: 1,
    adoptedAt: 1,
    expectedCurrent: null,
  });
  const enabled = process.env.PLAYBOOK_SYNC_ENABLED;
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.PLAYBOOK_SYNC_ENABLED = "false";
  const stop = await startContentSyncRuntime();
  stop();
  process.env.OPENAI_API_KEY = key;
  expect((await getContentTask(task.id))?.status).toBe("success");
  expect((await cancelContentTask(task.id)).status).toBe("success");
  expect((await contentSyncTotals()).totalSyncs).toBe(1);
  if (enabled === undefined) delete process.env.PLAYBOOK_SYNC_ENABLED;
  else process.env.PLAYBOOK_SYNC_ENABLED = enabled;
});

test("cancellation in local task setup prevents full-sync deletion", async () => {
  await db.insert(posts).values(fixture("retain-on-early-cancel"));
  const manager = getContentSourceManager();
  const result = manager.syncAll(true);
  const task = db.select().from(contentTasks).where(eq(contentTasks.source, "local")).get();
  if (!task) throw new Error("Task not registered synchronously");
  await cancelContentTask(task.id);
  await result;
  expect((await getContentTask(task.id))?.status).toBe("cancelled");
  expect(
    await db.select().from(posts).where(eq(posts.id, "retain-on-early-cancel")).get()
  ).toBeDefined();
});

for (const change of ["rotate", "remove"] as const) {
  test(`embedding retry observes credential ${change} without changing target fingerprint`, async () => {
    await db.insert(posts).values(fixture(`credential-${change}`));
    const originalKey = process.env.OPENAI_API_KEY;
    const fingerprint = (await ragCoverage({ source: "blog" })).status.identity.fingerprint;
    const authorizations: (string | null)[] = [];
    globalThis.fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        authorizations.push(new Headers(init?.headers).get("authorization"));
        if (authorizations.length === 1) {
          if (change === "rotate") process.env.OPENAI_API_KEY = "synthetic-rotated";
          else delete process.env.OPENAI_API_KEY;
          return new Response("unavailable", { status: 503 });
        }
        return Response.json({ data: [{ embedding: [1, 0] }] });
      },
      { preconnect: originalFetch.preconnect }
    );
    try {
      const task = await runRagIndex({ source: "blog" }, "repair");
      expect((await completed(task.taskId)).status).toBe(
        change === "rotate" ? "success" : "failed"
      );
      expect((await ragCoverage({ source: "blog" })).status.identity.fingerprint).toBe(fingerprint);
      expect(
        JSON.parse((await getContentTask(task.taskId))?.target ?? "{}").identity.fingerprint
      ).toBe(fingerprint);
      expect(authorizations).toEqual(
        change === "rotate"
          ? [`Bearer ${originalKey}`, "Bearer synthetic-rotated"]
          : [`Bearer ${originalKey}`]
      );
    } finally {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });
}

test("manifest preparation is task-owned and cancellation prevents target filling", async () => {
  await db.insert(posts).values(fixture("cancel-manifest", "many chunks ".repeat(1200)));
  const { taskId } = await runRagIndex({ source: "blog" }, "repair");
  await cancelContentTask(taskId);
  expect((await completed(taskId)).status).toBe("cancelled");
  expect((await db.select().from(postEmbeddings)).length).toBe(0);
  const expected = (await ragCoverage({ source: "blog" })).status.chunks;
  expect(expected.total).toBeGreaterThan(100);
  expect(expected.indexed).toBe(0);
});

test("authenticated HTTP status filters and durable task operations match their contracts", async () => {
  const { handleAdminApiRequest } = await import("@/server/admin-api/router");
  const adminEmail = "synthetic-admin-http@example.test";
  const savedEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = adminEmail;
  await db.insert(posts).values(fixture("http-scope"));
  let release: ((response: Response) => void) | undefined;
  globalThis.fetch = Object.assign(
    async () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    { preconnect: originalFetch.preconnect }
  );
  const request = (path: string, method = "GET", body?: unknown, admin = true) =>
    handleAdminApiRequest(
      new Request(`http://localhost/api/admin${path}`, {
        method,
        headers: admin ? { "Remote-Email": adminEmail, "content-type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      path.split("?")[0]
    );
  let taskId: string | undefined;
  try {
    const filtered = await request("/content-sync/status?source=blog&type=memo&edition=current");
    expect(filtered.status).toBe(200);
    expect((await filtered.json()).rag.contents.total).toBe(0);
    const invalid = await request("/content-sync/status?source=all&edition=previous");
    expect(invalid.status).toBe(400);
    expect(
      (
        await request(
          "/content-sync/rag/trigger",
          "POST",
          { source: "blog", mode: "repair" },
          false
        )
      ).status
    ).toBe(401);
    const trigger = await request("/content-sync/rag/trigger", "POST", {
      source: "blog",
      mode: "repair",
    });
    expect(trigger.status).toBe(202);
    taskId = (await trigger.json()).taskIds[0];
    if (!taskId) throw new Error("Missing HTTP task identity");
    const listing = await request("/content-sync/tasks?source=local&kind=rag&limit=1&offset=0");
    const list = await listing.json();
    expect(listing.status).toBe(200);
    expect(list.total).toBe(1);
    expect(list.items[0].id).toBe(taskId);
    expect(
      (
        await (
          await request("/content-sync/tasks?source=playbook&kind=rag&limit=1&offset=0")
        ).json()
      ).total
    ).toBe(0);
    expect(
      (await (await request("/content-sync/tasks?source=local&kind=rag&limit=1&offset=1")).json())
        .items
    ).toEqual([]);
    const detail = await request(`/content-sync/tasks/${taskId}`);
    expect(detail.status).toBe(200);
    expect((await detail.json()).id).toBe(taskId);
    expect(
      (await request(`/content-sync/tasks/${taskId}/cancel`, "POST", undefined, false)).status
    ).toBe(401);
    const cancelled = await request(`/content-sync/tasks/${taskId}/cancel`, "POST");
    expect(cancelled.status).toBe(200);
    expect((await cancelled.json()).taskId).toBe(taskId);
    release?.(Response.json({ data: [{ embedding: [1, 0] }] }));
    expect((await completed(taskId)).status).toBe("cancelled");
  } finally {
    release?.(Response.json({ data: [{ embedding: [1, 0] }] }));
    if (savedEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = savedEmail;
    await db.delete(users).where(eq(users.email, adminEmail));
  }
});

test("superseded content recovery preserves the later adopted edition", async () => {
  const store = new PlaybookSnapshotStore();
  const retained = snapshotFor(makePublicBundle("v9.0.3", "903"));
  store.adopt(retained, { expectedCurrent: null });
  const current = snapshotFor(makePublicBundle("v9.0.4", "904"));
  store.adopt(current, { expectedCurrent: snapshotIdentity(retained) });
  const { task } = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: PLAYBOOK_SYNC_REQUEST_KEY,
    origin: "test",
    target: JSON.stringify({
      base: snapshotIdentity(retained),
      candidate: snapshotIdentity(retained),
    }),
  });
  await db
    .update(contentTasks)
    .set({ status: "interrupted", phase: "interrupted" })
    .where(eq(contentTasks.id, task.id));
  const enabled = process.env.PLAYBOOK_SYNC_ENABLED;
  process.env.PLAYBOOK_SYNC_ENABLED = "true";
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let requests = 0;
  globalThis.fetch = Object.assign(
    async () => {
      requests++;
      throw new Error("Deployment pointer must not be read during retained recovery");
    },
    { preconnect: originalFetch.preconnect }
  );
  try {
    await expect(checkPlaybook("recovery", task.id)).rejects.toThrow(
      "Recovery adoption superseded"
    );
    expect((await getContentTask(task.id))?.status).toBe("failed");
    expect((await getContentTask(task.id))?.target).toBe(
      JSON.stringify({
        base: snapshotIdentity(retained),
        candidate: snapshotIdentity(retained),
      })
    );
    expect(store.current?.sourceRevision.ref).toBe("v9.0.4");
    expect(requests).toBe(0);
  } finally {
    if (enabled === undefined) delete process.env.PLAYBOOK_SYNC_ENABLED;
    else process.env.PLAYBOOK_SYNC_ENABLED = enabled;
    process.env.OPENAI_API_KEY = key;
  }
});

test("historical chunks do not mark never-indexed sibling chunks outdated", async () => {
  await db.insert(posts).values(fixture("partial-history", "synthetic long body ".repeat(40)));
  await db.insert(postEmbeddings).values({
    id: "partial-old",
    postId: "partial-history",
    slug: "partial-history",
    type: "post",
    modelName: "old-model",
    dim: 2,
    contentHash: "old",
    chunkIndex: 0,
    vector: Buffer.from(new Float32Array([1, 0]).buffer),
    createdAt: 1,
    updatedAt: 1,
  });
  const coverage = (await ragCoverage({ source: "blog" })).status;
  expect(coverage.chunks.total).toBeGreaterThan(1);
  expect(coverage.chunks.outdated).toBe(1);
  expect(coverage.chunks.unindexed).toBe(coverage.chunks.total - 1);
  expect(coverage.contents.outdated).toBe(1);
});

test("unavailable admin coverage keeps totals but nulls every target classification", async () => {
  await db.insert(posts).values(fixture("unknown-details"));
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const status = await contentSyncStatus({ source: "blog" });
    expect(status.rag.contents.total).toBe(0);
    expect(status.rag.contents.unindexed).toBeNull();
    expect(status.rag.details).toEqual([]);
  } finally {
    process.env.OPENAI_API_KEY = key;
  }
});

test("a failure arriving after durable cancellation cannot mutate target provenance", async () => {
  await db.insert(posts).values(fixture("durable-cancel-failure"));
  let release: ((response: Response) => void) | undefined;
  globalThis.fetch = Object.assign(
    async () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
    { preconnect: originalFetch.preconnect }
  );
  const { taskId } = await runRagIndex({ source: "blog" }, "repair");
  while (!release) await Bun.sleep(5);
  const target = (
    await db.select().from(ragIndexTargets).where(eq(ragIndexTargets.taskId, taskId))
  )[0];
  // Another process can persist cancellation without aborting this process's controller.
  await db.update(contentTasks).set({ cancelRequested: true }).where(eq(contentTasks.id, taskId));
  release(new Response("invalid vector response", { status: 400 }));
  expect((await completed(taskId)).status).toBe("cancelled");
  expect(
    await db.select().from(ragIndexTargets).where(eq(ragIndexTargets.id, target.id)).get()
  ).toEqual(target);
});

test("cancelled local sync retains discovered total and unprocessed remainder", async () => {
  const manager = new ContentSourceManager();
  const source = new LocalContentSource(
    LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
  );
  const items = Array.from({ length: 10 }, (_, i) => ({
    ...fixture(`local-remainder-${i}`),
    type: "post" as const,
    source: "local",
    filePath: `synthetic/${i}.md`,
    lastModified: 1,
    tags: [],
    metadata: { content: "synthetic" },
  }));
  source.detectChanges = async () => ({
    sourceName: "local",
    changes: items.map((item) => ({
      item,
      operation: "create" as const,
      reason: "synthetic test change",
    })),
    detectedAt: 1,
    stats: { total: 10, created: 10, updated: 0, deleted: 0, skipped: 0 },
  });
  await manager.registerSource(source);
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let cancelled = false;
  const onLog = () => {
    const count = db.select().from(posts).all().length;
    if (!cancelled && count >= 2) {
      cancelled = true;
      const task = db.select().from(contentTasks).where(eq(contentTasks.kind, "sync")).get();
      if (task) void cancelContentTask(task.id);
    }
  };
  syncEventManager.on("sync:log", onLog);
  try {
    await manager.syncAll();
    const task = db.select().from(contentTasks).where(eq(contentTasks.kind, "sync")).get();
    expect(task?.status).toBe("cancelled");
    expect(task?.total).toBe(10);
    expect(task?.processed).toBe(2);
    expect(JSON.parse(task?.result ?? "null")).toMatchObject({ created: 2, totalProcessed: 2 });
    expect(task?.failed).toBe(0);
    expect(db.select().from(posts).all().length).toBe(2);
  } finally {
    syncEventManager.off("sync:log", onLog);
    process.env.OPENAI_API_KEY = key;
  }
});

test("an interrupted unadopted target can commit when its adoption base is unchanged", async () => {
  const store = new PlaybookSnapshotStore();
  const current = snapshotFor(makePublicBundle("v9.1.0", "910"));
  store.adopt(current, { expectedCurrent: null });
  const next = snapshotFor(makePublicBundle("v9.1.1", "911"));
  const target = JSON.stringify({
    base: snapshotIdentity(current),
    candidate: snapshotIdentity(next),
  });
  const { task } = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: PLAYBOOK_SYNC_REQUEST_KEY,
    origin: "test",
    target,
  });
  await db
    .update(contentTasks)
    .set({ status: "interrupted", phase: "interrupted" })
    .where(eq(contentTasks.id, task.id));
  const enabled = process.env.PLAYBOOK_SYNC_ENABLED;
  const key = process.env.OPENAI_API_KEY;
  const token = process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  delete process.env.OPENAI_API_KEY;
  try {
    await checkPlaybook("recovery", task.id, {
      store,
      sourceLoader: async () => ({ status: "ready", snapshot: next }),
    });
    expect((await getContentTask(task.id))?.status).toBe("success");
    expect((await getContentTask(task.id))?.target).toBe(target);
    expect(store.current?.sourceRevision.ref).toBe("v9.1.1");
  } finally {
    if (enabled === undefined) delete process.env.PLAYBOOK_SYNC_ENABLED;
    else process.env.PLAYBOOK_SYNC_ENABLED = enabled;
    if (token === undefined) delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
    else process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = token;
    process.env.OPENAI_API_KEY = key;
  }
});

test("snapshot adoption commit fence rejects a changed base without replacing current", async () => {
  const store = new PlaybookSnapshotStore();
  const old = snapshotFor(makePublicBundle("v9.2.0", "920"));
  const newer = snapshotFor(makePublicBundle("v9.2.1", "921"));
  store.adopt(old, { expectedCurrent: null });
  store.adopt(newer, { expectedCurrent: snapshotIdentity(old) });
  expect(() =>
    store.adopt(old, {
      taskId: "superseded",
      expectedCurrent: snapshotIdentity(old),
    })
  ).toThrow("snapshot adoption base changed");
  const reloaded = new PlaybookSnapshotStore();
  expect(reloaded.current?.sourceRevision.ref).toBe("v9.2.1");
  expect(reloaded.current?.taskId).not.toBe("superseded");
});

test("all-source parent aggregation retains colliding source identities", () => {
  const coverage = summarizeCoverage([
    { source: "blog", parentId: "same", state: "indexed" },
    { source: "playbook", parentId: "same", state: "failed" },
    { source: "blog", parentId: "same", state: "indexed" },
  ]);
  expect(coverage.contents).toMatchObject({ total: 2, indexed: 1, failed: 1 });
  expect(coverage.chunks).toMatchObject({ total: 3, indexed: 2, failed: 1 });
});

for (const outcome of ["cancel", "fail"] as const) {
  test(`rebuild ${outcome} retains previously committed valid coverage`, async () => {
    await db.insert(posts).values(fixture(`rebuild-${outcome}`));
    await completed((await runRagIndex({ source: "blog" }, "repair")).taskId);
    const before = await ragCoverage({ source: "blog" });
    let release: ((response: Response) => void) | undefined;
    globalThis.fetch = Object.assign(
      async () => {
        if (release) return new Response("bad", { status: 400 });
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      },
      { preconnect: originalFetch.preconnect }
    );
    const { taskId } = await runRagIndex({ source: "blog" }, "rebuild");
    while (!release) await Bun.sleep(5);
    expect((await ragCoverage({ source: "blog" })).status.contents.indexed).toBe(1);
    if (outcome === "cancel") await cancelContentTask(taskId);
    release(
      outcome === "fail"
        ? new Response("bad", { status: 400 })
        : Response.json({ data: [{ embedding: [0, 1] }] })
    );
    expect((await completed(taskId)).status).toBe(outcome === "cancel" ? "cancelled" : "failed");
    const after = await ragCoverage({ source: "blog" });
    expect(after.status.contents.indexed).toBe(1);
    expect([...after.eligibleVectorIds]).toEqual([...before.eligibleVectorIds]);
  });
}

test("equivalent local requests share one operation and preserve durable actual history", async () => {
  const manager = new ContentSourceManager();
  const source = new LocalContentSource(
    LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
  );
  let scans = 0;
  let release: (() => void) | undefined;
  source.detectChanges = async () => {
    scans++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      sourceName: "local",
      changes: [],
      detectedAt: 1,
      stats: { total: 0, created: 0, updated: 0, deleted: 0, skipped: 0 },
    };
  };
  await manager.registerSource(source);
  const first = manager.syncAll();
  const second = manager.syncAll();
  expect(first).toBe(second);
  await expect(manager.syncAll(true)).rejects.toThrow("Task conflict");
  while (!release) await Bun.sleep(5);
  release();
  const result = await first;
  expect(scans).toBe(1);
  expect(result.taskId).toBeDefined();
  if (!result.taskId) throw new Error("Missing durable ID");
  const task = await getContentTask(result.taskId);
  if (!task?.result) throw new Error("Missing durable result");
  expect(JSON.parse(task.result)).toMatchObject(result.stats);
  expect((await contentSyncTotals()).totalSyncs).toBe(1);
});

test("cold local recovery registers configured source and keeps the original task identity", async () => {
  await resetContentSourceManager();
  const oldPath = process.env.LOCAL_CONTENT_BASE_PATH;
  const key = process.env.OPENAI_API_KEY;
  const enabled = process.env.PLAYBOOK_SYNC_ENABLED;
  process.env.LOCAL_CONTENT_BASE_PATH = root;
  delete process.env.OPENAI_API_KEY;
  process.env.PLAYBOOK_SYNC_ENABLED = "false";
  const { task } = await beginContentTask({
    kind: "sync",
    source: "local",
    requestKey: "incremental",
    origin: "test",
    target: "local-content",
  });
  await db.update(contentTasks).set({ leaseUntil: 0 }).where(eq(contentTasks.id, task.id));
  try {
    const stop = await startContentSyncRuntime();
    stop();
    const recovered = await completed(task.id);
    expect(recovered.status).toBe("unchanged");
    expect(recovered.processed).toBe(0);
    expect(getContentSourceManager().getSource("local")).toBeDefined();
    expect((await contentSyncTotals()).totalSyncs).toBe(1);
  } finally {
    if (oldPath === undefined) delete process.env.LOCAL_CONTENT_BASE_PATH;
    else process.env.LOCAL_CONTENT_BASE_PATH = oldPath;
    process.env.OPENAI_API_KEY = key;
    if (enabled === undefined) delete process.env.PLAYBOOK_SYNC_ENABLED;
    else process.env.PLAYBOOK_SYNC_ENABLED = enabled;
    await resetContentSourceManager();
  }
});

test("all-source trigger continues Playbook while sharing an active local task", async () => {
  await resetContentSourceManager();
  const { appRouter } = await import("@/server/router");
  const caller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    isAdmin: true,
    user: { id: "synthetic-admin", email: "synthetic@example.test", nickname: "Synthetic" },
  });
  const manager = getContentSourceManager();
  const source = new LocalContentSource(
    LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
  );
  let release: (() => void) | undefined;
  source.detectChanges = async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      sourceName: "local",
      changes: [],
      detectedAt: 1,
      stats: { total: 0, created: 0, updated: 0, deleted: 0, skipped: 0 },
    };
  };
  await manager.registerSource(source);
  const oldEnabled = process.env.PLAYBOOK_SYNC_ENABLED;
  const key = process.env.OPENAI_API_KEY;
  const token = process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  const store = new PlaybookSnapshotStore();
  const initial = snapshotFor(makePublicBundle("v3.0.0", "100"));
  store.adopt(initial, { expectedCurrent: null });
  delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  delete process.env.OPENAI_API_KEY;
  try {
    const local = manager.syncAll();
    while (!release) await Bun.sleep(5);
    await expect(
      caller.admin.contentSync.triggerSync({ source: "all", isFullSync: true })
    ).rejects.toThrow("Task conflict");
    const all = caller.admin.contentSync.triggerSync({ source: "all" });
    release();
    await local;
    const result = await all;
    expect(result).toHaveProperty("playbook");
    const playbookResult = "playbook" in result ? result.playbook : undefined;
    if (
      playbookResult &&
      typeof playbookResult === "object" &&
      "taskId" in playbookResult &&
      typeof playbookResult.taskId === "string"
    )
      await completed(playbookResult.taskId);
    expect(store.current?.sourceRevision.ref).toBe("v3.0.0");
    const history = await caller.admin.contentSync.getSyncHistory({ limit: 20 });
    const playbook = history.find((row) => row.sources[0] === "playbook");
    expect(playbook?.stats.created).toBeUndefined();
    expect((await contentSyncTotals()).totalSyncs).toBe(2);
  } finally {
    process.env.OPENAI_API_KEY = key;
    if (token === undefined) delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
    else process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = token;
    if (oldEnabled === undefined) delete process.env.PLAYBOOK_SYNC_ENABLED;
    else process.env.PLAYBOOK_SYNC_ENABLED = oldEnabled;
    await resetContentSourceManager();
  }
});

for (const mode of ["full", "incremental"] as const) {
  test(`${mode} local recovery resumes the original ten-item work list exactly once`, async () => {
    const manager = new ContentSourceManager();
    const source = new LocalContentSource(
      LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
    );
    source.detectChanges = async () => {
      throw new Error("Recovery must not rescan");
    };
    source.listContent = async () => {
      throw new Error("Recovery must not clear and rescan");
    };
    await manager.registerSource(source);
    const items = Array.from({ length: 10 }, (_, i) => ({
      ...fixture(`resume-${mode}-${i}`),
      type: "post" as const,
      source: "local",
      filePath: `${i}.md`,
      lastModified: 1,
      tags: [],
      metadata: { content: "Public synthetic content" },
    }));
    const changeSet = {
      sourceName: "local",
      changes: items.map((item) => ({ item, operation: "create" as const })),
      detectedAt: 1,
      stats: { total: 10, created: 10, updated: 0, deleted: 0, skipped: 0 },
    };
    const { task } = await beginContentTask({
      kind: "sync",
      source: "local",
      requestKey: mode,
      origin: "test",
      target: JSON.stringify({ version: 1, changeSet }),
    });
    const initialStats = {
      totalProcessed: 2,
      created: 2,
      updated: 0,
      deleted: 0,
      skipped: 0,
      errors: 0,
      cursor: 2,
    };
    db.transaction((tx) => {
      for (const item of items.slice(0, 2)) tx.insert(posts).values(fixture(item.id)).run();
      tx.update(contentTasks)
        .set({
          status: "interrupted",
          total: 10,
          processed: 2,
          result: JSON.stringify(initialStats),
        })
        .where(eq(contentTasks.id, task.id))
        .run();
    });
    const key = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await manager.syncAll(mode === "full", task.id);
      expect(result.success).toBe(true);
      expect(result.stats).toMatchObject({
        totalProcessed: 10,
        created: 10,
        updated: 0,
        errors: 0,
      });
      const final = await getContentTask(task.id);
      expect(final).toMatchObject({ total: 10, processed: 10, status: "success" });
      expect(JSON.parse(final?.result ?? "null").cursor).toBe(10);
      expect(db.select().from(posts).all().length).toBe(10);
      expect((await contentSyncTotals()).totalSyncs).toBe(1);
    } finally {
      process.env.OPENAI_API_KEY = key;
    }
  });
}

test("actual writes classify a new update-labelled item as created and unchanged replay as skipped", async () => {
  const manager = new ContentSourceManager();
  const source = new LocalContentSource(
    LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
  );
  const item = {
    ...fixture("actual-new"),
    type: "post" as const,
    source: "local",
    filePath: "new.md",
    lastModified: 1,
    tags: [],
    metadata: { content: "Public synthetic content" },
  };
  source.detectChanges = async () => ({
    sourceName: "local",
    changes: [{ item, operation: "update", reason: "synthetic test change" }],
    detectedAt: 1,
    stats: { total: 1, created: 0, updated: 1, deleted: 0, skipped: 0 },
  });
  await manager.registerSource(source);
  const first = await manager.syncAll();
  expect(first.stats).toMatchObject({ created: 1, updated: 0 });
  const second = await manager.syncAll();
  expect(second.stats).toMatchObject({ created: 0, updated: 0, skipped: 1 });
  if (!second.taskId) throw new Error("Missing task");
  expect((await getContentTask(second.taskId))?.status).toBe("unchanged");
});

for (const stage of ["initialize", "collect"] as const) {
  test(`local ${stage} failure is durable failure rather than a successful zero`, async () => {
    const manager = new ContentSourceManager();
    const source = new LocalContentSource(
      LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
    );
    if (stage === "initialize")
      source.initialize = async () => {
        throw new Error("Synthetic initialization failure");
      };
    else
      source.detectChanges = async () => {
        throw new Error("Synthetic collection failure");
      };
    await manager.registerSource(source);
    const result = await manager.syncAll();
    expect(result.success).toBe(false);
    if (!result.taskId) throw new Error("Missing task");
    expect(await getContentTask(result.taskId)).toMatchObject({
      status: "failed",
      failed: 1,
      error: "Local synchronization failed",
    });
  });
}

test("legacy sync cancellation leaves independent RAG tasks running", async () => {
  const { appRouter } = await import("@/server/router");
  const caller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    isAdmin: true,
    user: { id: "synthetic-admin", email: "synthetic@example.test", nickname: "Synthetic" },
  });
  const rag = await beginContentTask({
    kind: "rag",
    source: "playbook",
    requestKey: "test",
    origin: "test",
    target: "{}",
  });
  const sync = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: "test",
    origin: "test",
    target: "{}",
  });
  await caller.admin.contentSync.cancelSync();
  expect((await getContentTask(rag.task.id))?.cancelRequested).toBe(false);
  expect((await getContentTask(sync.task.id))?.cancelRequested).toBe(true);
  finishContentTask(rag.task.id, "success");
  finishContentTask(sync.task.id, "cancelled");
});

test("a checkpoint failure rolls back its content mutation in the same transaction", async () => {
  const manager = new ContentSourceManager();
  const source = new LocalContentSource(
    LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
  );
  const item = {
    ...fixture("atomic-checkpoint"),
    type: "post" as const,
    source: "local",
    filePath: "atomic.md",
    lastModified: 1,
    tags: [],
    metadata: { content: "Public synthetic content" },
  };
  source.detectChanges = async () => ({
    sourceName: "local",
    changes: [{ item, operation: "create", reason: "synthetic test change" }],
    detectedAt: 1,
    stats: { total: 1, created: 1, updated: 0, deleted: 0, skipped: 0 },
  });
  await manager.registerSource(source);
  db.run(
    sql`CREATE TRIGGER synthetic_checkpoint_failure BEFORE UPDATE OF processed ON content_tasks WHEN NEW.processed = 1 AND NEW.failed = 0 BEGIN SELECT RAISE(ABORT,'Synthetic checkpoint failure'); END`
  );
  try {
    const result = await manager.syncAll();
    expect(result.success).toBe(false);
    expect(result.stats).toMatchObject({ created: 0, totalProcessed: 1, errors: 1 });
    expect(db.select().from(posts).where(eq(posts.id, item.id)).get()).toBeUndefined();
    if (!result.taskId) throw new Error("Missing task");
    expect(await getContentTask(result.taskId)).toMatchObject({
      status: "failed",
      processed: 1,
      failed: 1,
    });
  } finally {
    db.run(sql`DROP TRIGGER synthetic_checkpoint_failure`);
  }
});

test("a persisted read failure is not converted into an empty successful sync", async () => {
  const manager = new ContentSourceManager();
  const source = new LocalContentSource(
    LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
  );
  source.detectChanges = async () => {
    throw new Error("Synthetic file read failure");
  };
  await manager.registerSource(source);
  const result = await manager.syncAll();
  expect(result.success).toBe(false);
  if (!result.taskId) throw new Error("Missing task");
  expect(await getContentTask(result.taskId)).toMatchObject({ status: "failed", failed: 1 });
});

test("corrupt local recovery checkpoint reaches a durable failed terminal state", async () => {
  const { task } = await beginContentTask({
    kind: "sync",
    source: "local",
    requestKey: "incremental",
    origin: "test",
    target: "local-content",
  });
  await db
    .update(contentTasks)
    .set({ status: "interrupted", result: "{not-json" })
    .where(eq(contentTasks.id, task.id));
  const manager = new ContentSourceManager();
  const source = new LocalContentSource(
    LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
  );
  await manager.registerSource(source);
  const recovered = await manager.syncAll(false, task.id);
  expect(recovered.success).toBe(false);
  const failed = await getContentTask(task.id);
  expect(failed).toMatchObject({
    status: "failed",
    finishedAt: expect.any(Number),
    error: "Local synchronization failed",
  });
});

test("a new execution token fences old progress, completion and cancellation of terminal rows", async () => {
  const input = {
    kind: "sync" as const,
    source: "local" as const,
    requestKey: "incremental",
    origin: "test",
    target: "local-content",
  };
  const first = await beginContentTask(input);
  await db.update(contentTasks).set({ leaseUntil: 0 }).where(eq(contentTasks.id, first.task.id));
  const resumed = await beginContentTask({ ...input, resumeId: first.task.id });
  expect(resumed.reused).toBe(false);
  expect(resumed.task.ownerToken).not.toBe(first.task.ownerToken);
  await updateContentTask(first.task.id, { processed: 99 }, first.task.ownerToken ?? undefined);
  finishContentTask(first.task.id, "failed", "Old worker", first.task.ownerToken ?? undefined);
  expect(await getContentTask(first.task.id)).toMatchObject({ status: "running", processed: 0 });
  expect(() => assertContentTaskOwner(resumed.task, first.task.ownerToken)).toThrow("ownership");
  finishContentTask(resumed.task.id, "success", undefined, resumed.task.ownerToken ?? undefined);
  await cancelContentTask(resumed.task.id);
  expect(await getContentTask(resumed.task.id)).toMatchObject({
    status: "success",
    cancelRequested: false,
  });
  expect((await contentSyncTotals()).totalSyncs).toBe(1);
});

test("runtime startup does not interrupt a live owner", async () => {
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const active = await beginContentTask({
    kind: "sync",
    source: "local",
    requestKey: "incremental",
    origin: "test",
    target: "local-content",
  });
  try {
    const stop = await startContentSyncRuntime();
    stop();
    expect(await getContentTask(active.task.id)).toMatchObject({
      status: "running",
      ownerToken: active.task.ownerToken,
    });
  } finally {
    finishContentTask(active.task.id, "success");
    process.env.OPENAI_API_KEY = key;
  }
});

test("full sync cancellation after a committed item preserves old content and skips obsolete cleanup", async () => {
  const key = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await db.insert(posts).values([fixture("old-a"), fixture("old-b")]);
  const manager = new ContentSourceManager();
  const source = new LocalContentSource(
    LocalContentSource.createDefaultConfig("local", 50, { contentPath: root })
  );
  source.listContent = async () =>
    Array.from({ length: 3 }, (_, i) => ({
      ...fixture(`replacement-${i}`),
      type: "post" as const,
      source: "local",
      filePath: `${i}.md`,
      lastModified: 1,
      tags: [],
      metadata: { content: "Public synthetic content" },
    }));
  await manager.registerSource(source);
  const listener = () => {
    const task = db.select().from(contentTasks).where(eq(contentTasks.source, "local")).get();
    if (task?.processed === 1 && !task.cancelRequested) void cancelContentTask(task.id);
  };
  syncEventManager.on("sync:log", listener);
  try {
    const result = await manager.syncAll(true);
    expect(result.success).toBe(false);
    expect(result.stats).toMatchObject({ created: 1, deleted: 0, totalProcessed: 1 });
    expect(
      db
        .select()
        .from(posts)
        .all()
        .map((row) => row.id)
        .sort()
    ).toEqual(["old-a", "old-b", "replacement-0"]);
    expect((await getContentTask(result.taskId ?? ""))?.status).toBe("cancelled");
  } finally {
    syncEventManager.off("sync:log", listener);
    process.env.OPENAI_API_KEY = key;
  }
});

test("legacy cancellation requires an exact task when two sync sources are active", async () => {
  const { appRouter } = await import("@/server/router");
  const caller = appRouter.createCaller({
    req: new Request("http://localhost"),
    resHeaders: new Headers(),
    isAdmin: true,
    user: { id: "synthetic-admin", email: "synthetic@example.test", nickname: "Synthetic" },
  });
  const local = await beginContentTask({
    kind: "sync",
    source: "local",
    requestKey: "incremental",
    origin: "test",
    target: "local-content",
  });
  const playbook = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: "public-deployment-pointer",
    origin: "test",
    target: "null",
  });
  await expect(caller.admin.contentSync.cancelSync()).rejects.toThrow("Multiple sync tasks");
  await caller.admin.contentSync.cancelSync({ taskId: local.task.id });
  expect((await getContentTask(local.task.id))?.cancelRequested).toBe(true);
  expect((await getContentTask(playbook.task.id))?.cancelRequested).toBe(false);
  finishContentTask(local.task.id, "cancelled");
  finishContentTask(playbook.task.id, "success");
});

test("durable remote cancellation fences Playbook adoption without a local abort", async () => {
  const enabled = process.env.PLAYBOOK_SYNC_ENABLED;
  const key = process.env.OPENAI_API_KEY;
  const token = process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
  process.env.PLAYBOOK_SYNC_ENABLED = "true";
  process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = "synthetic-token";
  delete process.env.OPENAI_API_KEY;
  const store = new PlaybookSnapshotStore();
  const old = snapshotFor(makePublicBundle("v7.0.0", "700"));
  const next = snapshotFor(makePublicBundle("v7.0.1", "701"));
  store.adopt(old, { expectedCurrent: null });
  try {
    const result = await checkPlaybook("manual", undefined, {
      store,
      sourceLoader: async () => {
        const task = db
          .select()
          .from(contentTasks)
          .where(eq(contentTasks.source, "playbook"))
          .get();
        if (!task) throw new Error("Missing Playbook task");
        db.update(contentTasks)
          .set({ cancelRequested: true })
          .where(eq(contentTasks.id, task.id))
          .run();
        return { status: "ready", snapshot: next };
      },
    });
    expect(result).toEqual({ cancelled: true, adopted: false });
    expect(store.current?.sourceRevision.ref).toBe("v7.0.0");
    expect(db.select().from(contentTasks).where(eq(contentTasks.kind, "sync")).get()?.status).toBe(
      "cancelled"
    );
  } finally {
    process.env.OPENAI_API_KEY = key;
    if (token === undefined) delete process.env.STYLE_PLAYBOOK_GITHUB_TOKEN;
    else process.env.STYLE_PLAYBOOK_GITHUB_TOKEN = token;
    if (enabled === undefined) delete process.env.PLAYBOOK_SYNC_ENABLED;
    else process.env.PLAYBOOK_SYNC_ENABLED = enabled;
  }
});
