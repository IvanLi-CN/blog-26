import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { contentTasks, memoClippings, posts, systemShareSubmissions } from "@/lib/schema";
import type { TRPCContext } from "@/server/context";
import { memosRouter } from "./memos";

const prior = {
  DB_PATH: process.env.DB_PATH,
  CONTENT_AUTHORITY: process.env.CONTENT_AUTHORITY,
  LOCAL_CONTENT_BASE_PATH: process.env.LOCAL_CONTENT_BASE_PATH,
  CLIPPING_CONTENT_BASE_PATH: process.env.CLIPPING_CONTENT_BASE_PATH,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
};

let root: string;
let mediaRoot: string;

function caller() {
  const context: TRPCContext = {
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    isAdmin: true,
    user: { id: "admin-authority", nickname: "Admin", email: "admin@example.com" },
  };
  return memosRouter.createCaller(context);
}

async function markdownFilesUnderMediaRoot(): Promise<string[]> {
  const files = (await readdir(mediaRoot, { recursive: true })) as string[];
  return files.filter((name) => name.endsWith(".md"));
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "memos-authority-"));
  mediaRoot = join(root, "media");
  await mkdir(mediaRoot, { recursive: true });
  process.env.DB_PATH = join(root, "app.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = mediaRoot;
  process.env.CLIPPING_CONTENT_BASE_PATH = join(root, "clippings");
  process.env.CONTENT_AUTHORITY = "database";
  process.env.ADMIN_EMAIL = "admin@example.com";
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), "drizzle") });
  sqlite.close();
  await initializeDB(true);
});

afterEach(async () => {
  await db.delete(memoClippings);
  await db.delete(systemShareSubmissions);
  await db.delete(contentTasks);
  await db.delete(posts);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("creating a clipping memo writes the row and never replays a local scan", async () => {
  const created = await caller().create({
    content: "https://sqrin.app/\n\n#剪藏",
    tags: ["剪藏"],
    isPublic: false,
    attachments: [],
  });

  const row = db.select().from(posts).where(eq(posts.id, created.id)).get();
  expect(row).toBeDefined();
  expect(row?.type).toBe("memo");
  expect(row?.source).toBe("database");
  expect(JSON.parse(row?.metadata ?? "{}").authoredClipping).toBe(true);
  expect(JSON.parse(row?.metadata ?? "{}").content).toBe("https://sqrin.app/\n\n#剪藏");
  expect("clipping" in created).toBe(true);
  expect(
    db.select().from(memoClippings).where(eq(memoClippings.memoId, created.id)).get()
  ).toBeDefined();

  // The old failure mode scheduled a content task that replayed the row it had
  // not inserted yet; a successful publish must leave no sync task behind.
  expect(db.select().from(contentTasks).all()).toHaveLength(0);
  expect(await markdownFilesUnderMediaRoot()).toEqual([]);
});

test("system-share publish keeps the deterministic memo id under database authority", async () => {
  const submissionId = randomUUID();
  const leaseToken = randomUUID();
  await db.insert(systemShareSubmissions).values({
    submissionId,
    memoId: null,
    memoSlug: null,
    classification: "clipping",
    state: "committing",
    leaseToken,
    leaseExpiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const created = await caller().create({
    content: "https://sqrin.app/\n\n#剪藏",
    tags: ["剪藏"],
    isPublic: false,
    attachments: [],
    systemShare: {
      source: "system-share",
      submissionId,
      leaseToken,
      targetUrl: "https://sqrin.app/",
    },
  });

  expect(created.id).toBe(`Memos/system-share/${submissionId}.md`);
  const row = db.select().from(posts).where(eq(posts.id, created.id)).get();
  expect(row?.slug).toBe(submissionId);
  expect(JSON.parse(row?.metadata ?? "{}").systemShare).toMatchObject({
    source: "system-share",
    submissionId,
    leaseToken,
  });
  expect(db.select().from(contentTasks).all()).toHaveLength(0);
  expect(await markdownFilesUnderMediaRoot()).toEqual([]);
});

test("system-share publish refuses a lease that is no longer committing", async () => {
  const submissionId = randomUUID();
  const leaseToken = randomUUID();
  await db.insert(systemShareSubmissions).values({
    submissionId,
    memoId: null,
    memoSlug: null,
    classification: "memo",
    state: "completed",
    leaseToken: null,
    leaseExpiresAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await expect(
    caller().create({
      content: "https://sqrin.app/",
      tags: [],
      isPublic: false,
      attachments: [],
      systemShare: {
        source: "system-share",
        submissionId,
        leaseToken,
        targetUrl: "https://sqrin.app/",
      },
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(db.select().from(posts).all()).toHaveLength(0);
});

test("updating and deleting a memo under database authority touch only the row", async () => {
  const created = await caller().create({
    content: "first body",
    tags: ["a"],
    isPublic: false,
    attachments: [],
  });

  const updated = await caller().update({
    id: created.id,
    content: "second body",
    tags: ["b"],
    isPublic: true,
    attachments: [],
  });
  expect(updated.content).toBe("second body");
  const row = db.select().from(posts).where(eq(posts.id, created.id)).get();
  expect(row?.body).toBe("second body");
  expect(JSON.parse(row?.metadata ?? "{}").content).toBe("second body");
  expect(row?.public).toBe(true);

  await caller().delete({ id: created.id });
  expect(db.select().from(posts).where(eq(posts.id, created.id)).get()).toBeUndefined();
  expect(await markdownFilesUnderMediaRoot()).toEqual([]);
});
test("an edit keeps the original author while a clipping delete keeps a tombstone", async () => {
  const created = await caller().create({
    content: "https://sqrin.app/\n\n#剪藏",
    tags: ["剪藏"],
    isPublic: false,
    attachments: [],
  });
  const before = db.select().from(posts).where(eq(posts.id, created.id)).get();

  await caller().update({
    id: created.id,
    content: "https://sqrin.app/\n\n改过的备注\n\n#剪藏",
    tags: ["剪藏"],
    isPublic: false,
    attachments: [],
  });
  expect(db.select().from(posts).where(eq(posts.id, created.id)).get()?.author).toBe(
    before?.author
  );

  // The clipping runtime resolves the manifest id from this row after the
  // authored document is gone; dropping it would strand an enabled manifest.
  await caller().delete({ id: created.id });
  expect(db.select().from(posts).where(eq(posts.id, created.id)).get()).toBeUndefined();
  expect(
    db.select().from(memoClippings).where(eq(memoClippings.memoId, created.id)).get()?.deleted
  ).toBe(true);
});
test("system-share publish refuses a deterministic path held by an unrelated Memo", async () => {
  const submissionId = randomUUID();
  const leaseToken = randomUUID();
  const memoId = `Memos/system-share/${submissionId}.md`;
  await db.insert(posts).values({
    id: memoId,
    slug: submissionId,
    type: "memo",
    title: "unrelated",
    body: "unrelated body",
    filePath: memoId,
    publishDate: Date.now(),
    draft: false,
    public: false,
    tags: "[]",
    metadata: JSON.stringify({ content: "unrelated body" }),
    dataSource: "database",
    source: "database",
    contentHash: "hash",
  });
  await db.insert(systemShareSubmissions).values({
    submissionId,
    memoId: null,
    memoSlug: null,
    classification: "memo",
    state: "committing",
    leaseToken,
    leaseExpiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await expect(
    caller().create({
      content: "share payload",
      tags: [],
      isPublic: false,
      attachments: [],
      systemShare: { source: "system-share", submissionId, leaseToken },
    })
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(db.select().from(posts).where(eq(posts.id, memoId)).get()?.body).toBe("unrelated body");
});
