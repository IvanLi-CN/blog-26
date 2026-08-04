import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { clearSearchCache } from "@/lib/ai/search-cache";
import { db, initializeDB } from "@/lib/db";
import { postEmbeddings, posts } from "@/lib/schema";
import { appRouter } from "@/server/router";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/search-router-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

function createCaller() {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    isAdmin: false,
  } as any);
}

describe("search router visibility", () => {
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
    await db.delete(postEmbeddings);
    await db.delete(posts);
    clearSearchCache();
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);
  });

  it("forces public semantic search to exclude unpublished rows", async () => {
    if (!db) throw new Error("Database has not been initialised");
    const marker = `public-search-${Date.now()}`;
    const now = Date.now();

    await db.insert(posts).values([
      {
        id: `${marker}-public`,
        slug: `${marker}-public`,
        type: "post",
        title: `${marker} public`,
        excerpt: null,
        body: marker,
        publishDate: now,
        updateDate: now,
        draft: false,
        public: true,
        tags: "[]",
        author: "search-test",
        image: null,
        metadata: null,
        dataSource: "local",
        contentHash: randomUUID(),
      },
      {
        id: `${marker}-private`,
        slug: `${marker}-private`,
        type: "post",
        title: `${marker} private`,
        excerpt: null,
        body: marker,
        publishDate: now + 1,
        updateDate: now + 1,
        draft: true,
        public: false,
        tags: "[]",
        author: "search-test",
        image: null,
        metadata: null,
        dataSource: "local",
        contentHash: randomUUID(),
      },
    ]);

    const result = await createCaller().search.ai.semantic({
      q: marker,
      topK: 10,
      publishedOnly: false,
    } as never);

    expect(result.map((entry) => entry.slug)).toEqual([`${marker}-public`]);
  });
});
