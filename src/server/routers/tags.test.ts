import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import { appRouter } from "@/server/router";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/tags-router-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

async function seedPost(
  overrides: Partial<{
    id: string;
    slug: string;
    type: "post" | "memo";
    title: string;
    excerpt: string | null;
    body: string;
    publishDate: number;
    draft: boolean;
    public: boolean;
    tags: string | null;
  }> = {}
): Promise<void> {
  if (!db) {
    throw new Error("Database has not been initialised");
  }

  const now = Date.now();
  await db.insert(posts).values({
    id: overrides.id ?? randomUUID(),
    slug: overrides.slug ?? `slug-${randomUUID()}`,
    type: overrides.type ?? "post",
    title: overrides.title ?? "Sample",
    excerpt: overrides.excerpt ?? null,
    body: overrides.body ?? "Body",
    publishDate: overrides.publishDate ?? now,
    draft: overrides.draft ?? false,
    public: overrides.public ?? true,
    category: null,
    tags: overrides.tags ?? null,
    author: "tester",
    image: null,
    metadata: null,
    dataSource: "local",
    contentHash: randomUUID(),
    updateDate: now,
  });
}

function createCaller(isAdmin: boolean) {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    isAdmin,
  } as any);
}

describe("tagsRouter.timeline", () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    const testDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH);
    }

    const sqlite = new Database(TEST_DB_PATH);
    const client = drizzle(sqlite);
    migrate(client, { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();

    await initializeDB(true);
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.rmSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    if (!db) {
      throw new Error("Database has not been initialised");
    }
    await db.delete(posts);
  });

  it("includes exact tag and subtags, without matching lookalike prefixes", async () => {
    const baseTime = new Date("2025-01-01T00:00:00.000Z").getTime();

    await seedPost({
      id: "post-exact",
      slug: "post-exact",
      type: "post",
      publishDate: baseTime + 3000,
      tags: JSON.stringify(["Geek/SMS"]),
    });

    await seedPost({
      id: "memo-child",
      slug: "memo-child",
      type: "memo",
      title: "Child memo",
      publishDate: baseTime + 2000,
      tags: JSON.stringify(["Geek/SMS/Child"]),
    });

    await seedPost({
      id: "post-lookalike",
      slug: "post-lookalike",
      type: "post",
      publishDate: baseTime + 1000,
      tags: JSON.stringify(["Geek/SMSPlus"]),
    });

    const caller = createCaller(false);
    const res = await caller.tags.timeline({ tagPath: "Geek/SMS", limit: 50 });
    const slugs = res.items.map((it) => it.slug);

    expect(slugs).toContain("post-exact");
    expect(slugs).toContain("memo-child");
    expect(slugs).not.toContain("post-lookalike");
  });

  it("paginates stably with publishDate+id cursor (no duplicates across pages)", async () => {
    const baseTime = new Date("2025-02-02T00:00:00.000Z").getTime();

    await seedPost({
      id: "d",
      slug: "d",
      type: "post",
      publishDate: baseTime,
      tags: JSON.stringify(["Geek/SMS"]),
    });

    await seedPost({
      id: "b",
      slug: "b",
      type: "memo",
      title: "b memo",
      publishDate: baseTime + 1000,
      tags: JSON.stringify(["Geek/SMS/Child"]),
    });

    await seedPost({
      id: "c",
      slug: "c",
      type: "post",
      publishDate: baseTime + 1000,
      tags: JSON.stringify(["Geek/SMS"]),
    });

    await seedPost({
      id: "a",
      slug: "a",
      type: "post",
      publishDate: baseTime + 2000,
      tags: JSON.stringify(["Geek/SMS"]),
    });

    const caller = createCaller(false);
    const page1 = await caller.tags.timeline({ tagPath: "Geek/SMS", limit: 2 });

    expect(page1.items.map((it) => it.id)).toEqual(["a", "c"]);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await caller.tags.timeline({
      tagPath: "Geek/SMS",
      limit: 2,
      cursor: page1.nextCursor,
    });

    expect(page2.items.map((it) => it.id)).toEqual(["b", "d"]);

    const allIds = [...page1.items.map((it) => it.id), ...page2.items.map((it) => it.id)];
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});
