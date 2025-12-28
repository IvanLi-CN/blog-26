import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { toAbsoluteUrl } from "@/lib/rss";
import { posts } from "@/lib/schema";
import { buildTagHref } from "@/lib/tag-href";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/tag-feed-route-test.sqlite");
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

describe("tag feed route", () => {
  let routeGET: typeof import("../api/tags/feed/[...tagSegments]/route").GET;

  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    process.env.NEXT_PUBLIC_SITE_URL = "http://example.com";

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

    ({ GET: routeGET } = await import("../api/tags/feed/[...tagSegments]/route"));
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

    const request = new Request("http://example.com/tags/Geek/SMS/feed.xml?limit=50");
    const res = await routeGET(request, {
      params: Promise.resolve({ tagSegments: ["Geek", "SMS"] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/xml");

    const xml = await res.text();
    expect(xml).toContain("#Geek/SMS");
    expect(xml).toContain(`${toAbsoluteUrl("/posts")}/post-exact`);
    expect(xml).toContain(`${toAbsoluteUrl("/memos")}/memo-child`);
    expect(xml).not.toContain("post-lookalike");
    const tagUrl = toAbsoluteUrl(buildTagHref("Geek/SMS"));
    if (!tagUrl) {
      throw new Error("Expected tag URL to be defined");
    }
    expect(xml).toContain(tagUrl);
    expect(xml).not.toContain("%2F");
  });
});
