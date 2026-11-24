import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { buildCanonicalDocument, type ContentRecord } from "@/lib/content-repo/canonical";
import { db, initializeDB } from "@/lib/db";
import { contentTaskItems, contentTasks, posts } from "@/lib/schema";
import { waitContentTask } from "@/server/services/content-tasks";

const ADMIN_EMAIL = "admin-test@test.local";
const originalFetch = globalThis.fetch;
const environment = { ...process.env };
const sha40 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex").slice(0, 40);

let root: string;
let handleAdminApiRequest: typeof import("@/server/admin-api/router").handleAdminApiRequest;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "content-repo-http-"));
  process.env.NODE_ENV = "development";
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.DB_PATH = join(root, "db.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = join(root, "local");
  process.env.CONTENT_SOURCES = "local";
  process.env.CONTENT_REPO_REPOSITORY = "acme/contents";
  process.env.CONTENT_REPO_REF = "main";
  process.env.CONTENT_REPO_TOKEN = "synthetic";
  mkdirSync(process.env.LOCAL_CONTENT_BASE_PATH, { recursive: true });
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
  // Static import would read DB_PATH before this hook sets it; the router must
  // load after the isolated database exists.
  ({ handleAdminApiRequest } = await import("@/server/admin-api/router"));
}, 20_000);

beforeEach(async () => {
  await db.delete(contentTaskItems);
  await db.delete(contentTasks);
  await db.delete(posts);
  globalThis.fetch = fakeRepository();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  rmSync(root, { recursive: true, force: true });
});

function deferred() {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { promise, resolve };
}

/** Only the git-data endpoints the content transport needs for one push. */
function fakeRepository(options: { gate?: Promise<void> } = {}) {
  const files = new Map<string, Uint8Array>();
  const pending = new Map<string, Uint8Array>();
  let headCommit = "a".repeat(40);
  let headTree = sha40("initial");
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    if (url.endsWith("/commits/main"))
      return Response.json({ sha: headCommit, commit: { tree: { sha: headTree } } });
    if (url.includes("/git/trees/") && url.includes("recursive=1"))
      return Response.json({
        truncated: false,
        tree: [...files.keys()].map((path) => ({
          path,
          type: "blob",
          sha: sha40(files.get(path) ?? ""),
        })),
      });
    if (url.endsWith("/git/blobs") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { content?: string };
      const bytes = new Uint8Array(Buffer.from(body.content ?? "", "base64"));
      const sha = sha40(bytes);
      pending.set(sha, bytes);
      return Response.json({ sha });
    }
    if (url.endsWith("/git/trees") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        tree?: { path: string; sha: string }[];
      };
      for (const entry of body.tree ?? []) {
        const bytes = pending.get(entry.sha);
        if (!bytes) return new Response(null, { status: 422 });
        files.set(entry.path, bytes);
      }
      headTree = sha40([...files.keys()].sort().join("|") + headTree);
      return Response.json({ sha: headTree });
    }
    if (url.endsWith("/git/commits") && method === "POST") {
      headCommit = sha40(`${headCommit}:${files.size}`);
      return Response.json({ sha: headCommit });
    }
    if (url.includes("/git/refs/heads/") && method === "PATCH") {
      await options.gate;
      const body = JSON.parse(String(init?.body ?? "{}")) as { sha?: string };
      return Response.json({ object: { sha: body.sha } });
    }
    return new Response(null, { status: 404 });
  };
  return Object.assign(impl, { preconnect: originalFetch.preconnect }) as typeof fetch;
}

function request(pathname: string, init: RequestInit = {}, email: string | null = ADMIN_EMAIL) {
  const headers = new Headers(init.headers);
  if (email) headers.set("Remote-Email", email);
  return new Request(`http://localhost${pathname}`, { ...init, headers });
}

function insertPost(id: string, slug: string) {
  const content: ContentRecord = {
    id,
    type: "post",
    slug,
    title: slug,
    excerpt: null,
    body: "body",
    draft: false,
    public: true,
    category: null,
    tags: "[]",
    author: null,
    image: null,
    publishDate: Date.parse("2026-01-01T00:00:00.000Z"),
    updateDate: null,
    filePath: `notes/${slug}.md`,
    metadata: null,
  };
  db.insert(posts)
    .values({
      id,
      slug,
      type: "post",
      title: slug,
      body: content.body,
      publishDate: content.publishDate,
      draft: false,
      public: true,
      tags: "[]",
      contentHash: buildCanonicalDocument(content).contentHash,
      dataSource: "local",
      source: "local",
      filePath: content.filePath,
    })
    .run();
}

describe("content repo admin HTTP parity", () => {
  test("requires an admin session for the async start", async () => {
    insertPost("post-a", "a");
    const anonymous = await handleAdminApiRequest(
      request(
        "/api/admin/content-repo/push",
        {
          method: "POST",
          body: JSON.stringify({ all: true }),
        },
        null
      ),
      "/content-repo/push"
    );
    expect(anonymous.status).toBe(401);
    const member = await handleAdminApiRequest(
      request(
        "/api/admin/content-repo/push",
        { method: "POST", body: JSON.stringify({ all: true }) },
        "member@test.local"
      ),
      "/content-repo/push"
    );
    expect(member.status).toBe(403);
  });

  test("starts a push with 202 and reports progress without owner fields", async () => {
    insertPost("post-a", "a");
    const started = await handleAdminApiRequest(
      request("/api/admin/content-repo/push", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
      "/content-repo/push"
    );
    expect(started.status).toBe(202);
    const payload = (await started.json()) as {
      status: string;
      taskId: string;
      operation: string;
    };
    expect(payload.status).toBe("started");
    expect(payload.operation).toBe("push");
    expect(payload.taskId).toBeTruthy();

    await waitContentTask(payload.taskId, 60_000);

    const progress = await handleAdminApiRequest(
      request(`/api/admin/content-repo/tasks/${payload.taskId}/progress`),
      `/content-repo/tasks/${payload.taskId}/progress`
    );
    expect(progress.status).toBe(200);
    const body = (await progress.json()) as Record<string, unknown> & {
      task: Record<string, unknown>;
      items: { contentId: string | null; path: string }[];
      result: { commits?: string[]; operation?: string };
    };
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("ownerToken");
    expect(serialized).not.toContain("ownerHost");
    expect(serialized).not.toContain("ownerPid");
    expect(serialized).not.toContain("leaseUntil");
    expect(body.task.status).toBe("success");
    expect(body.task.processed).toBe(1);
    expect(body.items[0]?.contentId).toBe("post-a");
    expect(body.items[0]?.path).toBe("blog/a.md");
    expect(body.result.commits?.length).toBe(1);

    const status = await handleAdminApiRequest(
      request("/api/admin/content-sync/status"),
      "/content-sync/status"
    );
    expect(status.status).toBe(200);
    const statusBody = (await status.json()) as {
      tasks: { items: Record<string, unknown>[] };
    };
    expect(JSON.stringify(statusBody)).not.toContain("ownerToken");
    expect(JSON.stringify(statusBody)).not.toContain("leaseUntil");
    expect(statusBody.tasks.items.some((task) => task.source === "content-repo")).toBe(true);
  }, 60_000);

  test("a second start is busy and keeps the existing task id", async () => {
    insertPost("post-a", "a");
    const gate = deferred();
    globalThis.fetch = fakeRepository({ gate: gate.promise });
    const first = await handleAdminApiRequest(
      request("/api/admin/content-repo/push", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
      "/content-repo/push"
    );
    const firstPayload = (await first.json()) as { taskId: string };
    const second = await handleAdminApiRequest(
      request("/api/admin/content-repo/push", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
      "/content-repo/push"
    );
    const secondPayload = (await second.json()) as { status: string; taskId: string };
    expect(secondPayload.status).toBe("busy");
    expect(secondPayload.taskId).toBe(firstPayload.taskId);

    const progress = await handleAdminApiRequest(
      request(`/api/admin/content-sync/tasks/${firstPayload.taskId}/progress`),
      `/content-sync/tasks/${firstPayload.taskId}/progress`
    );
    expect(progress.status).toBe(200);
    const body = (await progress.json()) as { task: Record<string, unknown> };
    expect(body.task).not.toHaveProperty("ownerToken");
    expect(body.task).not.toHaveProperty("leaseUntil");
    gate.resolve();
    await waitContentTask(firstPayload.taskId, 60_000);
  }, 60_000);

  test("retry rejects a live task and accepts a finished one", async () => {
    insertPost("post-a", "a");
    const gate = deferred();
    globalThis.fetch = fakeRepository({ gate: gate.promise });
    const started = await handleAdminApiRequest(
      request("/api/admin/content-repo/push", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      }),
      "/content-repo/push"
    );
    const { taskId } = (await started.json()) as { taskId: string };
    const live = await handleAdminApiRequest(
      request(`/api/admin/content-repo/tasks/${taskId}/retry`, { method: "POST" }),
      `/content-repo/tasks/${taskId}/retry`
    );
    expect(live.status).toBe(200);
    expect((await live.json()) as { status: string }).toMatchObject({ status: "busy" });

    gate.resolve();
    await waitContentTask(taskId, 60_000);
    const finished = await handleAdminApiRequest(
      request(`/api/admin/content-repo/tasks/${taskId}/retry`, { method: "POST" }),
      `/content-repo/tasks/${taskId}/retry`
    );
    expect(finished.status).toBe(200);
    expect((await finished.json()) as { status: string }).toMatchObject({ status: "failed" });
  }, 60_000);

  test("retry rejects a non-content-repository task", async () => {
    const taskId = randomUUID();
    db.insert(contentTasks)
      .values({
        id: taskId,
        kind: "sync",
        source: "playbook",
        requestKey: "playbook-check",
        origin: "manual",
        target: JSON.stringify({ source: "playbook" }),
        result: null,
        status: "success",
        phase: "success",
        total: 1,
        processed: 1,
        failed: 0,
        error: null,
        startedAt: Date.now() - 1000,
        finishedAt: Date.now(),
        cancelRequested: false,
        ownerToken: null,
        ownerHost: null,
        ownerPid: null,
        leaseUntil: null,
      })
      .run();
    const response = await handleAdminApiRequest(
      request(`/api/admin/content-repo/tasks/${taskId}/retry`, { method: "POST" }),
      `/content-repo/tasks/${taskId}/retry`
    );
    expect(response.status).toBe(200);
    expect((await response.json()) as { status: string }).toMatchObject({
      status: "failed",
      message: "Task is not a content repository task",
    });
    expect(
      db
        .select()
        .from(contentTasks)
        .all()
        .filter((task) => task.source === "content-repo")
    ).toHaveLength(0);
  }, 60_000);

  test("a dead content-repository task is interrupted on read", async () => {
    const taskId = randomUUID();
    db.insert(contentTasks)
      .values({
        id: taskId,
        kind: "sync",
        source: "content-repo",
        requestKey: "dead-push",
        origin: "manual",
        target: JSON.stringify({ ids: null }),
        result: null,
        status: "running",
        phase: "uploading",
        operation: "push",
        total: 2,
        processed: 0,
        failed: 0,
        error: null,
        startedAt: Date.now() - 60_000,
        finishedAt: null,
        cancelRequested: false,
        ownerToken: "dead-owner",
        ownerHost: "dead-host",
        ownerPid: null,
        leaseUntil: Date.now() - 1,
      })
      .run();
    const response = await handleAdminApiRequest(
      request("/api/admin/content-sync/tasks?source=content-repo"),
      "/content-sync/tasks"
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: { id: string; status: string; finishedAt: number | null }[];
    };
    expect(body.items.find((task) => task.id === taskId)).toMatchObject({
      status: "interrupted",
      finishedAt: expect.any(Number),
    });
  }, 60_000);
});
