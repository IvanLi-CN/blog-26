import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import { getPostsByTag, getTagSummaries } from "@/server/services/tag-service";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/tag-service-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

async function seedPost(
  overrides: Partial<{
    id: string;
    slug: string;
    type: string;
    title: string;
    excerpt: string | null;
    body: string;
    publishDate: number;
    draft: boolean;
    public: boolean;
    tags: string | null;
    contentHash: string;
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
    title: overrides.title ?? "Sample Post",
    excerpt: overrides.excerpt ?? null,
    body: overrides.body ?? "Hello world",
    publishDate: overrides.publishDate ?? now,
    draft: overrides.draft ?? false,
    public: overrides.public ?? true,
    tags: overrides.tags ?? null,
    author: "tester",
    image: null,
    metadata: null,
    dataSource: "local",
    contentHash: overrides.contentHash ?? randomUUID(),
    updateDate: now,
  });
}

async function prepareDB(): Promise<void> {
  const baseTime = Date.now();

  await seedPost({
    title: "React Hooks Deep Dive",
    slug: "react-hooks",
    tags: JSON.stringify(["frontend/react", "frontend/hooks"]),
    publishDate: baseTime - 3000,
    draft: false,
    public: true,
  });

  await seedPost({
    title: "Advanced API Design",
    slug: "api-design",
    tags: JSON.stringify(["backend/api", "frontend/react", "platform/design"]),
    publishDate: baseTime - 2000,
    draft: false,
    public: true,
  });

  await seedPost({
    title: "Draft Only",
    slug: "draft-only",
    tags: JSON.stringify(["frontend/react"]),
    publishDate: baseTime - 1000,
    draft: true,
    public: true,
  });

  await seedPost({
    title: "Private Note",
    slug: "private-note",
    tags: "frontend/react",
    publishDate: baseTime,
    draft: false,
    public: false,
  });

  // memo entry should be ignored
  await seedPost({
    title: "Memo Entry",
    slug: "memo-entry",
    type: "memo",
    tags: JSON.stringify(["memo/thoughts"]),
    publishDate: Date.now(),
  });
}

describe("tag-service", () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    const TEST_DB_DIR = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
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

  it("aggregates tags with hierarchy and filters drafts/unpublished by default", async () => {
    await prepareDB();

    const summaries = await getTagSummaries();
    const names = summaries.map((item) => item.name);

    expect(names).toEqual(["backend/api", "platform/design", "frontend/hooks", "frontend/react"]);

    const reactSummary = summaries.find((item) => item.name === "frontend/react");
    expect(reactSummary?.count).toBe(2);
    expect(reactSummary?.segments).toEqual(["frontend", "react"]);
    expect(reactSummary?.lastSegment).toBe("react");

    // ensure draft/private posts excluded by default
    expect(reactSummary?.count).toBe(2);
  });

  it("includes drafts and unpublished posts when requested", async () => {
    await prepareDB();

    const summaries = await getTagSummaries({
      includeDrafts: true,
      includeUnpublished: true,
    });

    const reactSummary = summaries.find((item) => item.name === "frontend/react");
    expect(reactSummary?.count).toBe(4);
  });

  it("returns posts for a tag in publish date order and respects filters", async () => {
    await prepareDB();

    const defaultPosts = await getPostsByTag("frontend/react");
    expect(defaultPosts.map((post) => post.title)).toEqual([
      "Advanced API Design",
      "React Hooks Deep Dive",
    ]);

    const withDrafts = await getPostsByTag("frontend/react", {
      includeDrafts: true,
      includeUnpublished: true,
    });

    expect(withDrafts.map((post) => post.title)).toEqual([
      "Private Note",
      "Draft Only",
      "Advanced API Design",
      "React Hooks Deep Dive",
    ]);

    for (const post of defaultPosts) {
      expect(Array.isArray(post.tags)).toBe(true);
      expect(post.tags.length).toBeGreaterThan(0);
    }
  });
});
