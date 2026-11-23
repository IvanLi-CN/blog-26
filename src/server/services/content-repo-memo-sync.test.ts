import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { buildCanonicalDocument, type ContentRecord } from "@/lib/content-repo/canonical";
import { serializeCanonicalDocument } from "@/lib/content-repo/document";
import { db, initializeDB } from "@/lib/db";
import { contentRepoBaselines, posts } from "@/lib/schema";
import { acceptRemoteNew, mergeContentRepo, pullContentRepo } from "./content-repo-sync";

const originalFetch = globalThis.fetch;
const environment = { ...process.env };
const sha = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 40);
const COMMIT = "c".repeat(40);
const TREE = "e".repeat(40);

let root: string;
let remote: Map<string, Uint8Array>;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "content-repo-memo-"));
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
  await db.delete(posts);
  await db.delete(contentRepoBaselines);
  remote = new Map();
  globalThis.fetch = fakeGitHub(remote);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  rmSync(root, { recursive: true, force: true });
});

function fakeGitHub(blobs: Map<string, Uint8Array>) {
  const bySha = (target: string) =>
    [...blobs.entries()].find(([path]) => sha(path) === target)?.[1];
  const impl = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/git/commits/main"))
      return Response.json({ sha: COMMIT, tree: { sha: TREE } });
    if (url.includes(`/git/trees/${TREE}`))
      return Response.json({
        truncated: false,
        tree: [...blobs.keys()].map((path) => ({ path, type: "blob", sha: sha(path) })),
      });
    const match = /\/git\/blobs\/([a-f0-9]{40})$/u.exec(url);
    const bytes = match ? bySha(match[1]) : undefined;
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), {
      headers: { "content-length": String(bytes.length) },
    });
  };
  return Object.assign(impl, { preconnect: originalFetch.preconnect });
}

function memoRecord(body: string): ContentRecord {
  return {
    id: "memo-a",
    type: "memo",
    slug: "memo-a",
    title: "Memo A",
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
    filePath: "Memos/memo-a.md",
    metadata: null,
  };
}

/** Store a remote blob by path; the fake tree addresses it by sha(path). */
function publishRemote(path: string, text: string) {
  remote.set(path, new TextEncoder().encode(text));
}

function insertMemo(record: ContentRecord, contentHash: string) {
  return db
    .insert(posts)
    .values({
      id: record.id,
      slug: record.slug,
      type: "memo",
      title: record.title,
      body: record.body,
      publishDate: record.publishDate,
      draft: record.draft,
      public: record.public,
      tags: record.tags,
      contentHash,
      dataSource: "local",
      source: "local",
      filePath: record.filePath,
    })
    .run();
}

function insertBaseline(record: ContentRecord, document: Uint8Array, remoteSha: string) {
  db.insert(contentRepoBaselines)
    .values({
      path: record.filePath,
      contentId: record.id,
      kind: "memo",
      contentHash: createHash("sha256").update(document).digest("hex"),
      document: new TextDecoder().decode(document),
      media: "{}",
      remoteBlobs: JSON.stringify({ [record.filePath]: remoteSha }),
      commitSha: COMMIT,
      updatedAt: Date.now(),
    })
    .run();
}

describe("content repository memos", () => {
  test("pulls a memo changed only in the repository", async () => {
    const local = memoRecord("local body");
    const document = buildCanonicalDocument(local);
    insertMemo(local, document.contentHash);
    insertBaseline(local, document.bytes, "a".repeat(40));
    publishRemote(
      local.filePath,
      serializeDocument({
        title: "Memo A",
        slug: "memo-a",
        date: "2026-01-01T00:00:00.000Z",
        body: "remote body",
      })
    );

    const outcome = await pullContentRepo({});

    expect(outcome.status).toBe("pulled");
    const row = db.select().from(posts).where(eq(posts.id, "memo-a")).get();
    expect(row?.body).toBe("remote body");
    const baseline = db
      .select()
      .from(contentRepoBaselines)
      .where(eq(contentRepoBaselines.path, "Memos/memo-a.md"))
      .get();
    expect(baseline?.kind).toBe("memo");
  });

  test("merges a memo with disjoint local and repository edits", async () => {
    const base = memoRecord("line1\nline2\nline3\nline4\nline5");
    const baseDocument = buildCanonicalDocument(base);
    const local = memoRecord("line1\nlocal2\nline3\nline4\nline5");
    const localDocument = buildCanonicalDocument(local);
    insertMemo(local, localDocument.contentHash);
    insertBaseline(base, baseDocument.bytes, "b".repeat(40));
    publishRemote(
      base.filePath,
      serializeDocument({
        title: "Memo A",
        slug: "memo-a",
        date: "2026-01-01",
        body: "line1\nline2\nline3\nline4\nremote5",
      })
    );

    const outcome = await mergeContentRepo({});

    expect(outcome.status).toBe("merged");
    const row = db.select().from(posts).where(eq(posts.id, "memo-a")).get();
    expect(row?.body).toContain("local2");
    expect(row?.body).toContain("remote5");
  });

  test("adopts a memo that exists only in the repository", async () => {
    publishRemote(
      "Memos/memo-new.md",
      serializeDocument({ title: "New", slug: "memo-new", date: "2026-02-01", body: "adopted" })
    );

    const outcome = await acceptRemoteNew({ paths: ["Memos/memo-new.md"] });

    expect(outcome.status).toBe("accepted");
    const row = db.select().from(posts).where(eq(posts.filePath, "Memos/memo-new.md")).get();
    expect(row?.type).toBe("memo");
    expect(row?.body).toBe("adopted");
    const baseline = db
      .select()
      .from(contentRepoBaselines)
      .where(eq(contentRepoBaselines.path, "Memos/memo-new.md"))
      .get();
    expect(baseline?.kind).toBe("memo");
  });
});

function serializeDocument(input: { title: string; slug: string; date: string; body: string }) {
  return new TextDecoder().decode(
    serializeCanonicalDocument(
      { title: input.title, slug: input.slug, date: input.date, draft: false, public: true },
      input.body
    )
  );
}
