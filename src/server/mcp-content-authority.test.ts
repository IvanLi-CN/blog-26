import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { buildCanonicalDocument } from "@/lib/content-repo/canonical";
import { db, initializeDB } from "@/lib/db";
import { contentRepoBaselines, memoClippings, posts } from "@/lib/schema";
import { readAuthoredMemo, readAuthoredMemoSync } from "./clipping/store";
import { createMcpWebTransport } from "./mcp";
import { runWithMcpAuth } from "./mcp-auth-context";
import { memoClippingFrontmatter, saveAuthoredContent } from "./services/content-authority-writer";

const prior = {
  DB_PATH: process.env.DB_PATH,
  CONTENT_AUTHORITY: process.env.CONTENT_AUTHORITY,
  LOCAL_CONTENT_BASE_PATH: process.env.LOCAL_CONTENT_BASE_PATH,
  CLIPPING_CONTENT_BASE_PATH: process.env.CLIPPING_CONTENT_BASE_PATH,
};

let root: string;
let mediaRoot: string;

async function withMcpClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const connected = await createMcpWebTransport();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      runWithMcpAuth({ isAdmin: true, userEmail: "admin@example.com", userId: "mcp-admin" }, () =>
        connected.transport.handleRequest(request)
      ),
  });
  const client = new Client({ name: "content-authority-test", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp`))
    );
    return await run(client);
  } finally {
    await client.close().catch(() => undefined);
    server.stop(true);
  }
}

async function markdownFilesUnderMediaRoot(): Promise<string[]> {
  const files = (await readdir(mediaRoot, { recursive: true })) as string[];
  return files.filter((name) => name.endsWith(".md"));
}

function restoreEnv() {
  for (const [key, value] of Object.entries(prior)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function clearContent() {
  await db.delete(memoClippings);
  await db.delete(contentRepoBaselines);
  await db.delete(posts);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mcp-content-authority-"));
  mediaRoot = join(root, "media");
  await mkdir(mediaRoot, { recursive: true });
  process.env.DB_PATH = join(root, "app.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = mediaRoot;
  process.env.CLIPPING_CONTENT_BASE_PATH = join(root, "clippings");
  process.env.CONTENT_AUTHORITY = "database";
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: join(process.cwd(), "drizzle") });
  sqlite.close();
  await initializeDB(true);
});

afterEach(async () => {
  await clearContent();
});

afterAll(async () => {
  restoreEnv();
  await rm(root, { recursive: true, force: true });
});

test("database authority creates a memo row without writing Markdown files", async () => {
  const memoId = "Memos/mcp-database-memo.md";
  const publishDate = Date.now();
  const body = "数据库权威下的闪念正文\n";
  const saved = await saveAuthoredContent({
    kind: "memo",
    id: memoId,
    slug: "mcp-database-memo",
    filePath: memoId,
    frontmatter: {
      title: "数据库闪念",
      tags: ["测试"],
      public: true,
      publishDate: new Date(publishDate).toISOString(),
    },
    body,
    publishDate,
    public: true,
    tags: ["测试"],
  });

  const row = db.select().from(posts).where(eq(posts.id, memoId)).get();
  expect(row).toBeDefined();
  expect(row?.type).toBe("memo");
  expect(row?.id.startsWith("Memos/")).toBe(true);
  expect(row?.body).toBe(body);
  expect(JSON.parse(row?.metadata ?? "{}").content).toBe(body);

  const document = buildCanonicalDocument(row as typeof posts.$inferSelect);
  expect(saved.contentHash).toBe(document.contentHash);
  expect(row?.contentHash).toBe(document.contentHash);

  const files = await readdir(mediaRoot, { recursive: true });
  expect((files as string[]).filter((name) => name.endsWith(".md"))).toEqual([]);
});

test("database authority keeps clipping projection and canonical hash aligned", async () => {
  const memoId = "Memos/mcp-database-clipping.md";
  const publishDate = Date.now();
  const body = "https://example.com/article\n\n备注\n\n#剪藏\n";
  const saved = await saveAuthoredContent({
    kind: "memo",
    id: memoId,
    slug: "mcp-database-clipping",
    filePath: memoId,
    frontmatter: {
      title: "",
      tags: ["剪藏"],
      public: true,
      publishDate: new Date(publishDate).toISOString(),
    },
    body,
    publishDate,
    public: true,
    tags: ["剪藏"],
  });

  const row = db.select().from(posts).where(eq(posts.id, memoId)).get();
  expect(row).toBeDefined();
  expect(row?.body).toBe("备注");

  const clipping = memoClippingFrontmatter(memoId);
  expect(clipping?.targetUrl).toBe("https://example.com/article");
  expect(
    db.select().from(memoClippings).where(eq(memoClippings.memoId, memoId)).get()?.targetUrl
  ).toBe("https://example.com/article");

  const document = buildCanonicalDocument(row as typeof posts.$inferSelect, { clipping });
  expect(saved.contentHash).toBe(document.contentHash);
  expect(row?.contentHash).toBe(document.contentHash);
});

test("readAuthoredMemo reads the authored document from the database", async () => {
  const memoId = "Memos/authored-from-database.md";
  const body = "作者原稿\n";
  db.insert(posts)
    .values({
      id: memoId,
      slug: "authored-from-database",
      type: "memo",
      title: "原稿标题",
      excerpt: null,
      body: "阅读投影",
      publishDate: Date.now(),
      updateDate: null,
      draft: false,
      public: true,
      category: null,
      tags: JSON.stringify(["剪藏"]),
      author: null,
      image: null,
      metadata: JSON.stringify({ title: "原稿标题", tags: ["剪藏"], content: body }),
      dataSource: "database",
      createdVia: "mcp",
      contentHash: randomUUID(),
      lastModified: Date.now(),
      source: "database",
      filePath: memoId,
    })
    .run();

  const authored = await readAuthoredMemo(memoId);
  expect(authored.body).toBe(body);
  expect(authored.frontmatter.title).toBe("原稿标题");
  expect(authored.frontmatter.tags).toEqual(["剪藏"]);
  expect(authored.frontmatter.content).toBeUndefined();

  const sync = readAuthoredMemoSync(memoId);
  expect(sync.body).toBe(body);
  expect(sync.frontmatter.title).toBe("原稿标题");
});

test("memos MCP tools write database rows and never create Markdown files", async () => {
  await withMcpClient(async (client) => {
    const created = await client.callTool({
      name: "memos_create",
      arguments: { content: "MCP 数据库闪念", isPublic: true, tags: [] },
    });
    expect(created.isError).not.toBe(true);
    const createdRow = db.select().from(posts).where(eq(posts.type, "memo")).get();
    expect(createdRow?.id.startsWith("Memos/")).toBe(true);
    expect(createdRow?.body).toBe("MCP 数据库闪念\n");
    expect(JSON.parse(createdRow?.metadata ?? "{}").content).toBe("MCP 数据库闪念\n");
    expect(createdRow?.contentHash).toBe(
      buildCanonicalDocument(createdRow as typeof posts.$inferSelect).contentHash
    );
    expect(await markdownFilesUnderMediaRoot()).toEqual([]);

    const updated = await client.callTool({
      name: "memos_update",
      arguments: {
        slug: createdRow?.slug ?? "",
        content: "更新后的闪念",
        isPublic: false,
        tags: ["更新"],
      },
    });
    expect(updated.isError).not.toBe(true);
    const updatedRow = db
      .select()
      .from(posts)
      .where(eq(posts.id, createdRow?.id ?? ""))
      .get();
    expect(updatedRow?.body).toBe("更新后的闪念\n");
    expect(updatedRow?.public).toBe(false);
    expect(JSON.parse(updatedRow?.metadata ?? "{}").content).toBe("更新后的闪念\n");
    expect(updatedRow?.contentHash).toBe(
      buildCanonicalDocument(updatedRow as typeof posts.$inferSelect).contentHash
    );

    const deleted = await client.callTool({
      name: "memos_delete",
      arguments: { slug: createdRow?.slug ?? "" },
    });
    expect(deleted.isError).not.toBe(true);
    expect(
      db
        .select()
        .from(posts)
        .where(eq(posts.id, createdRow?.id ?? ""))
        .get()
    ).toBeUndefined();
  });
});

test("posts MCP tools write database rows and never create Markdown files", async () => {
  await withMcpClient(async (client) => {
    const created = await client.callTool({
      name: "posts_create",
      arguments: {
        title: "数据库文章",
        content: "文章正文",
        tags: ["db"],
        category: "技术",
        isPublic: true,
      },
    });
    expect(created.isError).not.toBe(true);
    const createdRow = db.select().from(posts).where(eq(posts.type, "post")).get();
    expect(createdRow?.id).toMatch(/^blog\/.+\.md$/);
    expect(createdRow?.filePath).toBe(createdRow?.id);
    expect(createdRow?.body).toBe("文章正文\n");
    expect(createdRow?.contentHash).toBe(
      buildCanonicalDocument(createdRow as typeof posts.$inferSelect).contentHash
    );

    const updatedContent = await client.callTool({
      name: "posts_update_content",
      arguments: {
        slug: createdRow?.slug ?? "",
        content: "新正文",
        title: "新标题",
        isPublic: false,
      },
    });
    expect(updatedContent.isError).not.toBe(true);
    const contentRow = db
      .select()
      .from(posts)
      .where(eq(posts.id, createdRow?.id ?? ""))
      .get();
    expect(contentRow?.title).toBe("新标题");
    expect(contentRow?.body).toBe("新正文\n");
    expect(contentRow?.public).toBe(false);
    expect(contentRow?.contentHash).toBe(
      buildCanonicalDocument(contentRow as typeof posts.$inferSelect).contentHash
    );

    const publishDate = Date.parse("2024-01-02T03:04:05.000Z");
    const updatedTime = await client.callTool({
      name: "posts_update_time",
      arguments: { slug: createdRow?.slug ?? "", publishDate: "2024-01-02T03:04:05.000Z" },
    });
    expect(updatedTime.isError).not.toBe(true);
    expect(
      db
        .select()
        .from(posts)
        .where(eq(posts.id, createdRow?.id ?? ""))
        .get()?.publishDate
    ).toBe(publishDate);

    const updatedVisibility = await client.callTool({
      name: "posts_update_visibility",
      arguments: { slug: createdRow?.slug ?? "", isPublic: true },
    });
    expect(updatedVisibility.isError).not.toBe(true);
    expect(
      db
        .select()
        .from(posts)
        .where(eq(posts.id, createdRow?.id ?? ""))
        .get()?.public
    ).toBe(true);

    const deleted = await client.callTool({
      name: "posts_delete",
      arguments: { slug: createdRow?.slug ?? "" },
    });
    expect(deleted.isError).not.toBe(true);
    expect(
      db
        .select()
        .from(posts)
        .where(eq(posts.id, createdRow?.id ?? ""))
        .get()
    ).toBeUndefined();
    expect(await markdownFilesUnderMediaRoot()).toEqual([]);
  });
});
