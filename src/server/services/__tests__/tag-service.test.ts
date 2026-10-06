import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { projectCatalog } from "@/lib/project-catalog";
import { posts, tags } from "@/lib/schema";
import { readEligibleContent } from "@/server/services/tag-content";
import {
  readTagGroupsFromDB,
  validateTagGroupsConfig,
  writeTagGroupsToDB,
} from "@/server/services/tag-groups";
import { assignTagIcon, getAllTagIcons } from "@/server/services/tag-icons";
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

  // Memos contribute to the directory, while article queries remain article-only
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

    expect(names).toEqual(
      expect.arrayContaining([
        "backend",
        "backend/api",
        "platform/design",
        "frontend",
        "frontend/hooks",
        "frontend/react",
        "memo/thoughts",
        "Harness",
      ])
    );
    expect(summaries.find((item) => item.name === "frontend")?.postCount).toBe(2);
    expect(summaries.find((item) => item.name === "memo")?.memoCount).toBe(1);
    expect(summaries.find((item) => item.name === "React")?.projectCount).toBe(10);
    expect(await getPostsByTag("Harness")).toEqual([]);

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

  it("discovers project-only tags without writes, then manages their grouping and icon metadata", async () => {
    await db.delete(tags);
    const catalogBefore = JSON.stringify(projectCatalog);
    const summaries = await getTagSummaries({ includeDrafts: true, includeUnpublished: true });
    expect(await db.select().from(tags)).toEqual([]);
    const knownTags = summaries.map((tag) => tag.name);
    const groups = [{ key: "hardware", title: "Hardware", tags: ["I²C", "Harness"] }];
    expect(validateTagGroupsConfig({ groups }, { knownTags })).toEqual({ valid: true });
    await writeTagGroupsToDB(groups, knownTags);
    await assignTagIcon("I²C", "tabler:cpu");
    expect((await readTagGroupsFromDB()).groups[0].tags.sort()).toEqual(["Harness", "I²C"]);
    expect((await getAllTagIcons())["I²C"]).toBe("tabler:cpu");
    expect(JSON.stringify(projectCatalog)).toBe(catalogBefore);
  });

  it("uses the same existing source/media eligibility boundary for public counts and records", async () => {
    const originalRoot = process.env.LOCAL_CONTENT_BASE_PATH;
    process.env.LOCAL_CONTENT_BASE_PATH = path.join(
      process.cwd(),
      "tmp/missing-tag-content-fixture"
    );
    try {
      await seedPost({
        slug: "missing-media",
        tags: '["MissingMediaTag"]',
        body: "![missing](missing-image.png)",
      });
      await seedPost({ slug: "private", public: false, tags: '["PrivateTag"]' });
      await seedPost({ slug: "draft-memo", type: "memo", draft: true, body: "#DraftTag" });
      await seedPost({ slug: "inline-public", type: "memo", body: "#PublicInlineTag" });
      const content = await readEligibleContent();
      expect(content.posts).toEqual([]);
      expect(content.memos.map((memo) => memo.slug)).toEqual(["inline-public"]);
      const names = (await getTagSummaries()).map((tag) => tag.name);
      expect(names).toContain("PublicInlineTag");
      expect(names).not.toContain("MissingMediaTag");
      expect(names).not.toContain("PrivateTag");
      expect(names).not.toContain("DraftTag");
      expect(
        (await getTagSummaries({ includeDrafts: true, includeUnpublished: true })).map(
          (tag) => tag.name
        )
      ).toEqual(expect.arrayContaining(["PrivateTag", "DraftTag"]));
    } finally {
      if (originalRoot === undefined) delete process.env.LOCAL_CONTENT_BASE_PATH;
      else process.env.LOCAL_CONTENT_BASE_PATH = originalRoot;
    }
  });
});
