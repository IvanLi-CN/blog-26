import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { contentAuthority, contentMedia, posts } from "@/lib/schema";
import { runContentCutover } from "./content-cutover";

const environment = { ...process.env };
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "content-cutover-"));
  process.env.DB_PATH = join(root, "db.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = join(root, "local");
  process.env.LOCAL_BLOG_PATH = "/blog";
  process.env.LOCAL_PROJECTS_PATH = "/Project";
  process.env.LOCAL_MEMOS_PATH = "/Memos";
  delete process.env.CONTENT_AUTHORITY;
  mkdirSync(process.env.LOCAL_CONTENT_BASE_PATH, { recursive: true });
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
});

beforeEach(async () => {
  await db.delete(posts);
  await db.delete(contentMedia);
  await db.delete(contentAuthority);
  rmSync(join(root, "local"), { recursive: true, force: true });
  mkdirSync(join(root, "local/blog/assets"), { recursive: true });
  mkdirSync(join(root, "local/Memos/assets"), { recursive: true });
  writeMarkdown(
    "blog/post-a.md",
    ["title: Post A", "slug: post-a", "date: 2026-01-02"],
    "![pic](assets/pic.png)\n\npost body"
  );
  writeMarkdown(
    "Memos/memo-a.md",
    ["title: Memo A", "slug: memo-a", "date: 2026-01-03"],
    "memo body"
  );
  writeFileSync(join(root, "local/blog/assets/pic.png"), "png-bytes");
});

afterAll(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  rmSync(root, { recursive: true, force: true });
});

function writeMarkdown(relative: string, frontmatter: string[], body: string) {
  const absolute = join(root, "local", relative);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(
    absolute,
    `---\n${frontmatter.join("\n")}\ndraft: false\npublic: true\n---\n${body}\n`
  );
}

describe("content authority cutover", () => {
  test("imports the file tree into canonical library paths", async () => {
    const report = await runContentCutover({ apply: true });

    expect(report.errors).toEqual([]);
    expect(report.created).toBe(2);
    const post = db.select().from(posts).where(eq(posts.type, "post")).get();
    expect(post?.id).toBe("blog/post-a.md");
    expect(post?.body).toContain("](./assets/pic.png)");
    const memo = db.select().from(posts).where(eq(posts.type, "memo")).get();
    expect(memo?.id).toBe("Memos/memo-a.md");
    expect(memo?.body).toContain("memo body");
    const media = db.select().from(contentMedia).all();
    expect(media.map((row) => row.path)).toContain("blog/assets/pic.png");
    const marker = db.select().from(contentAuthority).all();
    expect(marker[0]?.authority).toBe("database");
  });

  test("is idempotent once completed", async () => {
    await runContentCutover({ apply: true });
    const again = await runContentCutover({ apply: true });
    expect(again.status).toBe("completed");
  });

  test("dry run writes nothing", async () => {
    const report = await runContentCutover({});
    expect(report.status).toBe("dry-run");
    expect(db.select().from(posts).all()).toHaveLength(0);
    expect(db.select().from(contentAuthority).all()).toHaveLength(0);
  });

  test("skips syncthing conflict copies", async () => {
    writeMarkdown(
      "blog/post-a.sync-conflict-20260101-000000-ABCDEFG.md",
      ["title: Copy", "slug: copy", "date: 2026-01-02"],
      "conflict copy"
    );
    const report = await runContentCutover({ apply: true });
    expect(report.skipped.map((entry) => entry.reason)).toEqual(["syncthing-conflict"]);
    const rows = db.select().from(posts).all();
    expect(rows.every((row) => !row.filePath.includes(".sync-conflict"))).toBe(true);
  });

  test("disambiguates attachment name collisions by content hash", async () => {
    writeMarkdown(
      "blog/post-b.md",
      ["title: Post B", "slug: post-b", "date: 2026-01-02"],
      "![pic](assets/pic.png)"
    );
    writeFileSync(join(root, "local/blog/assets/pic.png"), "first-bytes");
    writeFileSync(join(root, "local/Memos/assets/pic.png"), "second-bytes");
    writeMarkdown(
      "Memos/memo-b.md",
      ["title: Memo B", "slug: memo-b", "date: 2026-01-03"],
      "![pic](assets/pic.png)"
    );

    const report = await runContentCutover({ apply: true });
    expect(report.errors).toEqual([]);
    const memo = db.select().from(posts).where(eq(posts.id, "Memos/memo-b.md")).get();
    const match = /\]\((\.\/assets\/[^)]+)\)/u.exec(memo?.body ?? "");
    expect(match?.[1]).toBe("./assets/pic.png");
    const mediaPaths = db
      .select()
      .from(contentMedia)
      .all()
      .map((row) => row.path);
    expect(mediaPaths).toContain("blog/assets/pic.png");
    expect(mediaPaths).toContain("Memos/assets/pic.png");
  });

  test("blocks on two posts that map to the same repository path", async () => {
    writeMarkdown(
      "blog/post-dup.md",
      ["title: Duplicate", "slug: post-a", "date: 2026-01-02"],
      "duplicate slug"
    );
    const report = await runContentCutover({});
    expect(report.status).toBe("blocked");
    expect(report.errors.some((entry) => entry.includes("canonical path collision"))).toBe(true);
  });

  test("deletes orphan rows when asked and still completes", async () => {
    db.insert(posts)
      .values({
        id: "Memos/gone.md",
        slug: "gone",
        type: "memo",
        title: "Gone",
        body: "gone",
        publishDate: 1,
        draft: false,
        public: true,
        contentHash: "hash",
        dataSource: "local",
        source: "local",
        filePath: "Memos/gone.md",
      })
      .run();
    const report = await runContentCutover({ apply: true, removeOrphans: true });
    expect(report.errors).toEqual([]);
    expect(db.select().from(posts).where(eq(posts.id, "Memos/gone.md")).get()).toBeUndefined();
    expect(db.select().from(contentAuthority).all()[0]?.authority).toBe("database");
  });

  test("blocks when a scanning-era row has no file", async () => {
    db.insert(posts)
      .values({
        id: "Memos/gone.md",
        slug: "gone",
        type: "memo",
        title: "Gone",
        body: "gone",
        publishDate: 1,
        draft: false,
        public: true,
        contentHash: "hash",
        dataSource: "local",
        source: "local",
        filePath: "Memos/gone.md",
      })
      .run();
    const report = await runContentCutover({});
    expect(report.status).toBe("blocked");
    expect(report.orphans).toEqual(["Memos/gone.md"]);
  });
});
