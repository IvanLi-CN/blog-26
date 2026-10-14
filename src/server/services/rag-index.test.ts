import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import {
  getContentSourceManager,
  LocalContentSource,
  resetContentSourceManager,
} from "@/lib/content-sources";
import { ContentSourceManager } from "@/lib/content-sources/manager";
import { db, initializeDB } from "@/lib/db";
import { getRuntimePlaybookStore, PlaybookStore } from "@/lib/playbook/cache";
import { publicFixtureCatalog, publicFixtureSearch } from "@/lib/playbook/fixture";
import {
  contentTaskCounters,
  contentTasks,
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
import { checkPlaybook, startContentSyncRuntime } from "./content-sync-runtime";
import { contentSyncStatus } from "./content-sync-status";
import {
  beginContentTask,
  cancelContentTask,
  contentSyncTotals,
  finishContentTask,
  getContentTask,
} from "./content-tasks";
import { ragCoverage, runRagIndex, summarizeCoverage, triggerRagIndex } from "./rag-index";

const originalFetch = globalThis.fetch;
const environment = { ...process.env };
let root: string;
let scenario = 0;
beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "rag-coverage-test-"));
  process.env.DB_PATH = join(root, "db.sqlite");
  process.env.PLAYBOOK_CACHE_DIR = join(root, "playbook");
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
  process.env.PLAYBOOK_CACHE_DIR = join(root, `playbook-${scenario++}`);
  Reflect.deleteProperty(globalThis, Symbol.for("blog26.playbook-store.v1"));
  await db.delete(posts);
  await db.delete(postEmbeddings);
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

test("Playbook current and previous projections retain their exact edition across reload", async () => {
  process.env.PLAYBOOK_SYNC_ENABLED = "false";
  const store = getRuntimePlaybookStore();
  const first = makePublicBundle("v3.0.0", "100").edition;
  await store.adopt(first);
  const job = await runRagIndex({ source: "playbook" }, "repair");
  expect((await completed(job.taskId)).status).toBe("success");
  expect((await ragCoverage({ source: "playbook" })).status.contents.indexed).toBe(3);
  const second = makePublicBundle("v3.0.1", "101").edition;
  await store.adopt(second);
  expect((await ragCoverage({ source: "playbook" })).status.contents.indexed).toBe(0);
  expect(
    (await ragCoverage({ source: "playbook", edition: "previous" })).status.contents.indexed
  ).toBe(3);
  const reloaded = new PlaybookStore(store.root);
  await reloaded.load();
  expect(reloaded.current?.edition.source.releaseId).toBe("101");
  expect(reloaded.previous?.edition.source.releaseId).toBe("100");
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
  await getRuntimePlaybookStore().adopt(bundle.edition);
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
test("cancelled manifests are not resumed automatically; interrupted tasks keep identity", async () => {
  process.env.PLAYBOOK_SYNC_ENABLED = "false";
  await db.insert(posts).values(fixture("recover"));
  const catalog = await ragCoverage({ source: "blog" });
  const previous = await beginContentTask({
    kind: "rag",
    source: "local",
    requestKey: "interrupted",
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
  expect((await completed(previous.task.id)).status).toBe("success");
  stop();
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
    .set({ phase: "adopting", cancelRequested: true })
    .where(eq(contentTasks.id, task.id));
  await getRuntimePlaybookStore().adopt(makePublicBundle("v9.0.1", "901").edition, {
    taskId: task.id,
    at: 1,
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
  const store = getRuntimePlaybookStore();
  const retained = makePublicBundle("v9.0.3", "903").edition;
  await store.adopt(retained);
  await store.adopt(makePublicBundle("v9.0.4", "904").edition);
  const { task } = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: "public-deployment-pointer",
    origin: "test",
    target: JSON.stringify(retained.edition),
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
    expect((await getContentTask(task.id))?.target).toBe(JSON.stringify(retained.edition));
    expect(store.current?.edition.source.tag).toBe("v9.0.4");
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
    expect(status.rag.contents.total).toBe(1);
    expect(status.rag.contents.unindexed).toBeNull();
    expect(status.rag.details.length).toBeGreaterThan(0);
    for (const detail of status.rag.details) {
      expect(detail.state).toBeNull();
      expect(detail.reason).toBe("embedding-unconfigured");
    }
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
    changes: items.map((item) => ({ item, operation: "create" as const })),
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
  const store = getRuntimePlaybookStore();
  await store.adopt(makePublicBundle("v9.1.0", "910").edition);
  const next = makePublicBundle("v9.1.1", "911").edition;
  const target = JSON.stringify({ ...next.edition, recoveryBase: store.current?.edition });
  const { task } = await beginContentTask({
    kind: "sync",
    source: "playbook",
    requestKey: "public-deployment-pointer",
    origin: "test",
    target,
  });
  await db
    .update(contentTasks)
    .set({ status: "interrupted", phase: "interrupted" })
    .where(eq(contentTasks.id, task.id));
  const download = store.downloadEdition;
  store.downloadEdition = async (_url, _signal, retained) => {
    expect(retained?.editionDigest).toBe(next.edition.editionDigest);
    return next;
  };
  const enabled = process.env.PLAYBOOK_SYNC_ENABLED;
  const key = process.env.OPENAI_API_KEY;
  process.env.PLAYBOOK_SYNC_ENABLED = "true";
  delete process.env.OPENAI_API_KEY;
  try {
    await checkPlaybook("recovery", task.id);
    expect((await getContentTask(task.id))?.status).toBe("success");
    expect((await getContentTask(task.id))?.target).toBe(target);
    expect(store.current?.edition.source.tag).toBe("v9.1.1");
  } finally {
    store.downloadEdition = download;
    if (enabled === undefined) delete process.env.PLAYBOOK_SYNC_ENABLED;
    else process.env.PLAYBOOK_SYNC_ENABLED = enabled;
    process.env.OPENAI_API_KEY = key;
  }
});

test("cache adoption commit fence rejects a changed base without replacing current", async () => {
  const store = getRuntimePlaybookStore();
  const old = makePublicBundle("v9.2.0", "920").edition;
  const newer = makePublicBundle("v9.2.1", "921").edition;
  await store.adopt(old);
  await store.adopt(newer);
  await expect(
    store.adopt(old, { taskId: "superseded", at: Date.now() }, undefined, old.edition)
  ).rejects.toThrow("Adoption base changed");
  const reloaded = new PlaybookStore(store.root);
  await reloaded.load();
  expect(reloaded.current?.edition.source.tag).toBe("v9.2.1");
  expect(reloaded.adoption?.taskId).not.toBe("superseded");
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
  process.env.PLAYBOOK_SYNC_ENABLED = "true";
  delete process.env.OPENAI_API_KEY;
  const store = getRuntimePlaybookStore();
  const bundle = makePublicBundle("v3.1.0", "102");
  store.downloadEdition = async () => bundle.edition;
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
    expect(store.current?.edition.source.releaseId).toBe("102");
    const history = await caller.admin.contentSync.getSyncHistory({ limit: 20 });
    const playbook = history.find((row) => row.sources[0] === "playbook");
    expect(playbook?.stats.created).toBeGreaterThan(0);
    expect(playbook?.stats.added).toBe(playbook?.stats.created);
    expect((await contentSyncTotals()).totalSyncs).toBe(2);
  } finally {
    process.env.OPENAI_API_KEY = key;
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
    changes: [{ item, operation: "update" }],
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
    changes: [{ item, operation: "create" }],
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
