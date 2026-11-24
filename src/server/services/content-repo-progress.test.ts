import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { buildCanonicalDocument, type ContentRecord } from "@/lib/content-repo/canonical";
import { serializeCanonicalDocument } from "@/lib/content-repo/document";
import { db, initializeDB } from "@/lib/db";
import { contentRepoBaselines, contentTaskItems, contentTasks, posts } from "@/lib/schema";
import {
  pullContentRepo,
  pushContentRepo,
  retryContentRepoTask,
  startContentRepoPush,
} from "./content-repo-sync";
import {
  cancelContentTask,
  finishContentTask,
  getContentTask,
  listContentTaskItems,
  readContentTaskProgress,
  waitContentTask,
} from "./content-tasks";

const originalFetch = globalThis.fetch;
const environment = { ...process.env };
const sha40 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex").slice(0, 40);
const encoder = new TextEncoder();

let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "content-repo-progress-"));
  process.env.DB_PATH = join(root, "db.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = join(root, "local");
  process.env.CONTENT_REPO_REPOSITORY = "acme/contents";
  process.env.CONTENT_REPO_REF = "main";
  process.env.CONTENT_REPO_TOKEN = "synthetic";
  mkdirSync(process.env.LOCAL_CONTENT_BASE_PATH, { recursive: true });
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
});

beforeEach(async () => {
  await db.delete(contentTaskItems);
  await db.delete(contentTasks);
  await db.delete(contentRepoBaselines);
  await db.delete(posts);
  globalThis.fetch = fakeRepository().fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  rmSync(root, { recursive: true, force: true });
});

interface Repository {
  fetch: typeof fetch;
  files: Map<string, Uint8Array>;
  commits: string[];
  onBlobUpload?: (path: string) => Promise<void> | void;
}

/** Minimal GitHub git-data API: blob, tree, commit and ref updates. */
function fakeRepository(): Repository {
  const files = new Map<string, Uint8Array>();
  const pending = new Map<string, Uint8Array>();
  const commits: string[] = [];
  let headCommit = "a".repeat(40);
  let headTree = sha40("initial");
  const state = {
    files,
    commits,
    onBlobUpload: undefined as Repository["onBlobUpload"],
  } as Repository;

  const treeEntries = () =>
    [...files.keys()].map((path) => ({ path, type: "blob", sha: sha40(files.get(path) ?? "") }));

  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    if (url.endsWith("/commits/main"))
      return Response.json({ sha: headCommit, commit: { tree: { sha: headTree } } });
    if (url.includes("/git/trees/") && url.includes("recursive=1"))
      return Response.json({ truncated: false, tree: treeEntries() });
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
        const current = state.onBlobUpload;
        if (current) await current(entry.path);
      }
      headTree = sha40([...files.keys()].sort().join("|") + headTree);
      return Response.json({ sha: headTree });
    }
    if (url.endsWith("/git/commits") && method === "POST") {
      headCommit = sha40(`${headCommit}:${commits.length}`);
      commits.push(headCommit);
      return Response.json({ sha: headCommit });
    }
    if (url.includes("/git/refs/heads/") && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { sha?: string };
      return Response.json({ object: { sha: body.sha } });
    }
    const blobMatch = /\/git\/blobs\/([a-f0-9]{40})$/u.exec(url);
    if (blobMatch) {
      const bytes =
        [...files.entries()].find(([path]) => sha40(files.get(path) ?? "") === blobMatch[1])?.[1] ??
        pending.get(blobMatch[1]);
      if (!bytes) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(bytes), {
        headers: { "content-length": String(bytes.byteLength) },
      });
    }
    return new Response(null, { status: 404 });
  };
  state.fetch = Object.assign(impl, { preconnect: originalFetch.preconnect }) as typeof fetch;
  return state;
}

function record(id: string, slug: string, filePath: string, body = "body"): ContentRecord {
  return {
    id,
    type: "post",
    slug,
    title: slug,
    excerpt: null,
    body,
    draft: false,
    public: true,
    category: null,
    tags: "[]",
    author: null,
    image: null,
    publishDate: Date.parse("2026-01-01T00:00:00.000Z"),
    updateDate: null,
    filePath,
    metadata: null,
  };
}

function insertPost(content: ContentRecord) {
  return db
    .insert(posts)
    .values({
      id: content.id,
      slug: content.slug,
      type: "post",
      title: content.title ?? content.slug,
      body: content.body,
      publishDate: content.publishDate,
      draft: content.draft,
      public: content.public,
      tags: content.tags,
      contentHash: buildCanonicalDocument(content).contentHash,
      dataSource: "local",
      source: "local",
      filePath: content.filePath,
    })
    .run();
}

describe("content repo push progress", () => {
  test("chunks a 201-content push into two commits and reports full progress", async () => {
    const repo = fakeRepository();
    globalThis.fetch = repo.fetch;
    const contents = Array.from({ length: 201 }, (_, index) =>
      record(`post-${index}`, `post-${index}`, `notes/${index}.md`)
    );
    for (const content of contents) insertPost(content);

    const outcome = await pushContentRepo({ all: true });

    expect(outcome.status).toBe("pushed");
    expect(outcome.commits?.length).toBe(2);
    expect(repo.commits.length).toBe(2);
    const task = await getContentTask(outcome.taskId ?? "");
    expect(task?.total).toBe(201);
    expect(task?.processed).toBe(201);
    expect(task?.status).toBe("success");
    const result = JSON.parse(task?.result ?? "{}") as { commits?: string[]; operation?: string };
    expect(result.operation).toBe("push");
    expect(result.commits?.length).toBe(2);
    const items = await listContentTaskItems(outcome.taskId ?? "");
    expect(items.length).toBe(201);
    expect(items.every((item) => item.status === "success")).toBe(true);
  }, 60_000);

  test("a second exclusive start reports busy with the live task and does not execute", async () => {
    insertPost(record("post-a", "a", "notes/a.md"));
    const first = await startContentRepoPush({ all: true });
    expect(first.status).toBe("started");
    const second = await startContentRepoPush({ all: true });
    expect(second.status).toBe("busy");
    expect(second.taskId).toBe(first.taskId ?? "");
    expect(second.operation).toBe("push");
    const active = db
      .select()
      .from(contentTasks)
      .where(and(eq(contentTasks.source, "content-repo"), eq(contentTasks.status, "running")))
      .all();
    expect(active.length).toBe(1);
    await cancelContentTask(first.taskId ?? "");
  });

  test("an expired running task is interrupted before a new one starts", async () => {
    insertPost(record("post-a", "a", "notes/a.md"));
    const now = Date.now();
    db.insert(contentTasks)
      .values({
        id: "stale-task",
        kind: "sync",
        source: "content-repo",
        operation: "push",
        requestKey: "stale",
        origin: "manual",
        target: "{}",
        result: null,
        status: "running",
        phase: "uploading",
        total: 1,
        processed: 0,
        failed: 0,
        error: null,
        startedAt: now - 60_000,
        finishedAt: null,
        cancelRequested: false,
        ownerToken: "dead",
        ownerHost: "somewhere-else",
        ownerPid: null,
        leaseUntil: now - 1000,
      })
      .run();

    const outcome = await pushContentRepo({ all: true });

    expect(outcome.status).toBe("pushed");
    expect(outcome.taskId).not.toBe("stale-task");
    const stale = await getContentTask("stale-task");
    expect(stale?.status).toBe("interrupted");
    expect(stale?.finishedAt).not.toBeNull();
  });

  test("a task in the committed phase finishes success even when cancel was requested", async () => {
    const now = Date.now();
    db.insert(contentTasks)
      .values({
        id: "committed-task",
        kind: "sync",
        source: "content-repo",
        operation: "push",
        requestKey: "committed",
        origin: "manual",
        target: "{}",
        result: JSON.stringify({ operation: "push", outcome: "pushed", commits: ["c".repeat(40)] }),
        status: "running",
        phase: "committed",
        total: 1,
        processed: 1,
        failed: 0,
        error: null,
        startedAt: now,
        finishedAt: null,
        cancelRequested: true,
        ownerToken: null,
        ownerHost: null,
        ownerPid: null,
        leaseUntil: null,
      })
      .run();

    finishContentTask("committed-task", "cancelled");

    const task = await getContentTask("committed-task");
    expect(task?.status).toBe("success");
    expect(task?.cancelRequested).toBe(true);
  });

  test("cancelling after the first commit keeps that commit and leaves the rest pending", async () => {
    const repo = fakeRepository();
    globalThis.fetch = repo.fetch;
    const contents = Array.from({ length: 201 }, (_, index) =>
      record(`post-${index}`, `post-${index}`, `notes/${index}.md`)
    );
    for (const content of contents) insertPost(content);
    let taskId = "";
    repo.onBlobUpload = async (path) => {
      // Cancel while the second chunk uploads: the first commit already landed.
      if (path === "blog/post-200.md" && taskId) {
        repo.onBlobUpload = undefined;
        await cancelContentTask(taskId);
      }
    };

    const started = await startContentRepoPush({ all: true });
    taskId = started.taskId ?? "";
    // Wait on the task's own terminal state instead of a guessed delay.
    await waitContentTask(taskId, 60_000);

    const task = await getContentTask(taskId);
    const result = JSON.parse(task?.result ?? "{}") as { commits?: string[]; outcome?: string };
    expect(task?.status).toBe("success");
    expect(result.outcome).toBe("pushed");
    expect(result.commits?.length).toBe(1);
    const items = await listContentTaskItems(taskId);
    expect(items.some((item) => item.status === "pending")).toBe(true);
  }, 60_000);
});

describe("content repo pull and retry", () => {
  test("pull selects by content id, not repository path", async () => {
    const repo = fakeRepository();
    globalThis.fetch = repo.fetch;
    const wanted = record("post-wanted", "wanted", "notes/wanted.md", "old");
    const other = record("post-other", "other", "notes/other.md", "old");
    for (const content of [wanted, other]) {
      insertPost(content);
      const document = buildCanonicalDocument(content);
      db.insert(contentRepoBaselines)
        .values({
          path: document.path,
          contentId: content.id,
          kind: "post",
          contentHash: document.contentHash,
          document: new TextDecoder().decode(document.bytes),
          media: "{}",
          remoteBlobs: JSON.stringify({ [document.path]: sha40(document.bytes) }),
          commitSha: "a".repeat(40),
          updatedAt: Date.now(),
        })
        .run();
      repo.files.set(
        document.path,
        encoder.encode(
          new TextDecoder().decode(
            serializeCanonicalDocument(
              {
                title: content.slug,
                slug: content.slug,
                date: "2026-01-01",
                draft: false,
                public: true,
              },
              `remote ${content.id}`
            )
          )
        )
      );
    }

    const outcome = await pullContentRepo({ ids: [wanted.id] });

    expect(outcome.status).toBe("pulled");
    expect(outcome.pulled).toEqual(["blog/wanted.md"]);
    const wantedRow = db.select().from(posts).where(eq(posts.id, wanted.id)).get();
    const otherRow = db.select().from(posts).where(eq(posts.id, other.id)).get();
    expect(wantedRow?.body).toContain("remote post-wanted");
    expect(otherRow?.body).toBe("old");
    const task = await getContentTask(
      db
        .select()
        .from(contentTasks)
        .where(eq(contentTasks.source, "content-repo"))
        .orderBy(contentTasks.startedAt)
        .get()?.id ?? ""
    );
    expect(task?.operation).toBe("pull");
    expect(task?.status).toBe("success");
    expect(task?.processed).toBe(1);
  });

  test("retry only starts failed retryable items", async () => {
    insertPost(record("post-a", "a", "notes/a.md"));
    const now = Date.now();
    db.insert(contentTasks)
      .values({
        id: "finished-task",
        kind: "sync",
        source: "content-repo",
        operation: "push",
        requestKey: "finished",
        origin: "manual",
        target: JSON.stringify({ ids: ["post-a", "post-b"] }),
        result: null,
        status: "failed",
        phase: "failed",
        total: 3,
        processed: 3,
        failed: 2,
        error: "boom",
        startedAt: now - 1000,
        finishedAt: now,
        cancelRequested: false,
        ownerToken: null,
        ownerHost: null,
        ownerPid: null,
        leaseUntil: null,
      })
      .run();
    db.insert(contentTaskItems)
      .values([
        {
          taskId: "finished-task",
          ordinal: 0,
          path: "blog/a.md",
          contentId: "post-a",
          kind: "post",
          status: "success",
          retryable: false,
          updatedAt: now,
        },
        {
          taskId: "finished-task",
          ordinal: 1,
          path: "blog/b.md",
          contentId: "post-b",
          kind: "post",
          status: "failed",
          retryable: true,
          updatedAt: now,
        },
        {
          taskId: "finished-task",
          ordinal: 2,
          path: "blog/c.md",
          contentId: "post-c",
          kind: "post",
          status: "conflict",
          retryable: false,
          updatedAt: now,
        },
      ])
      .run();

    const started = await retryContentRepoTask("finished-task");
    expect(started.status).toBe("started");
    const retried = await getContentTask(started.taskId ?? "");
    expect(JSON.parse(retried?.target ?? "{}")).toEqual({ ids: ["post-b"] });
    expect(retried?.operation).toBe("push");
    await cancelContentTask(started.taskId ?? "");
  });

  test("task progress never exposes owner fields", async () => {
    insertPost(record("post-a", "a", "notes/a.md"));
    const outcome = await pushContentRepo({ all: true });
    const progress = await readContentTaskProgress(outcome.taskId ?? "");
    expect(progress).not.toBeNull();
    expect(Object.keys(progress?.task ?? {})).not.toContain("ownerToken");
    expect(JSON.stringify(progress)).not.toContain("ownerToken");
    expect(JSON.stringify(progress)).not.toContain("leaseUntil");
    expect(progress?.items[0]?.contentId).toBe("post-a");
  });
});
