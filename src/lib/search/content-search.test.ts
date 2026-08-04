import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import { executeContentSearch, searchContent } from "./content-search";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/content-search-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

async function seedPost(
  overrides: Partial<{
    id: string;
    slug: string;
    type: "post" | "memo" | "project";
    title: string;
    excerpt: string | null;
    body: string;
    publishDate: number;
    draft: boolean;
    public: boolean;
    tags: string | null;
  }> = {}
) {
  if (!db) throw new Error("Database has not been initialised");
  const now = Date.now();
  await db.insert(posts).values({
    id: overrides.id ?? randomUUID(),
    slug: overrides.slug ?? `post-${randomUUID()}`,
    type: overrides.type ?? "post",
    title: overrides.title ?? "Sample",
    excerpt: overrides.excerpt ?? null,
    body: overrides.body ?? "Sample body",
    publishDate: overrides.publishDate ?? now,
    updateDate: now,
    draft: overrides.draft ?? false,
    public: overrides.public ?? true,
    tags: overrides.tags ?? null,
    author: "search-test",
    image: null,
    metadata: null,
    dataSource: "local",
    contentHash: randomUUID(),
  });
}

function countIndexedRows(postId: string) {
  const sqlite = new Database(TEST_DB_PATH, { readonly: true });
  try {
    return Number(
      (
        sqlite
          .query("SELECT COUNT(*) AS count FROM posts_search_fts WHERE post_id = ?")
          .get(postId) as { count: number }
      )?.count ?? 0
    );
  } finally {
    sqlite.close();
  }
}

describe("content search", () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);

    const sqlite = new Database(TEST_DB_PATH);
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();
    await initializeDB(true);
  });

  beforeEach(async () => {
    if (!db) throw new Error("Database has not been initialised");
    await db.delete(posts);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);
  });

  test("keeps the FTS index synchronized across insert, update, type change, and delete", async () => {
    await seedPost({ id: "triggered-post", title: "Initial title" });
    expect(countIndexedRows("triggered-post")).toBe(1);

    await db.update(posts).set({ title: "Updated title" }).where(eq(posts.id, "triggered-post"));
    expect(countIndexedRows("triggered-post")).toBe(1);

    await db.update(posts).set({ type: "project" }).where(eq(posts.id, "triggered-post"));
    expect(countIndexedRows("triggered-post")).toBe(0);

    await db.update(posts).set({ type: "memo" }).where(eq(posts.id, "triggered-post"));
    expect(countIndexedRows("triggered-post")).toBe(1);

    await db.delete(posts).where(eq(posts.id, "triggered-post"));
    expect(countIndexedRows("triggered-post")).toBe(0);
  });

  test("searches long terms with FTS and short Chinese terms with the controlled LIKE path", async () => {
    await seedPost({
      id: "sqlite-guide",
      slug: "sqlite-guide",
      title: "SQLite Guide",
      excerpt: "A guide to FTS5",
      body: "SQLite FTS5 supports trigram search.",
      tags: JSON.stringify(["database/sqlite"]),
      publishDate: 3,
    });
    await seedPost({
      id: "chinese-search",
      slug: "chinese-search",
      title: "中文搜索",
      body: "搜索界面支持博客内容。",
      publishDate: 2,
    });
    await seedPost({
      id: "short-prefix-search",
      slug: "short-prefix-search",
      title: "About short prefixes",
      body: "Short prefix matching uses the controlled LIKE path.",
      publishDate: 4,
    });
    await seedPost({
      id: "short-title-newer",
      slug: "short-title-newer",
      title: "搜索标题",
      body: "A body without the short query",
      publishDate: 6,
    });
    await seedPost({
      id: "short-title-body-heavy",
      slug: "short-title-body-heavy",
      title: "搜索",
      body: "搜索 搜索 搜索",
      publishDate: 5,
    });
    await seedPost({
      id: "private-search",
      slug: "private-search",
      title: "Private SQLite note",
      draft: true,
      public: false,
      publishDate: 1,
    });

    const longSearch = await executeContentSearch({ q: "SQLite guide", topK: 10 });
    expect(longSearch.source).toBe("fts");
    expect(longSearch.results.map((result) => result.slug)).toContain("sqlite-guide");
    expect(longSearch.results.map((result) => result.slug)).not.toContain("private-search");

    const titleSearch = await searchContent({ q: "title:SQLite", topK: 10 });
    expect(titleSearch.map((result) => result.slug)).toEqual(["sqlite-guide"]);

    const groupedTitleSearch = await searchContent({ q: "title:(SQLite OR Guide)", topK: 10 });
    expect(groupedTitleSearch.map((result) => result.slug)).toEqual(["sqlite-guide"]);

    const nearSearch = await searchContent({ q: "NEAR(SQLite guide, 5)", topK: 10 });
    expect(nearSearch.map((result) => result.slug)).toEqual(["sqlite-guide"]);

    const shortSearch = await searchContent({ q: "搜索", topK: 10 });
    expect(shortSearch.map((result) => result.slug)).toContain("chinese-search");

    const scopedShortSearch = await searchContent({ q: "title:搜索", topK: 10 });
    expect(scopedShortSearch.map((result) => result.slug)).toEqual([
      "short-title-newer",
      "short-title-body-heavy",
      "chinese-search",
    ]);

    const shortPrefixSearch = await searchContent({ q: "ab*", topK: 10 });
    expect(shortPrefixSearch.map((result) => result.slug)).toContain("short-prefix-search");

    const fractionalLimitSearch = await searchContent({ q: "SQLite", topK: 1.5 });
    expect(fractionalLimitSearch).toHaveLength(1);

    const privateResults = await searchContent({
      q: "SQLite",
      topK: 10,
      publishedOnly: false,
    });
    expect(privateResults.map((result) => result.slug)).toContain("private-search");
  });
});
