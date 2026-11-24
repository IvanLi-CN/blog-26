import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { CONTENT_REPO_MAX_BATCH_CONTENTS } from "@/lib/content-repo/config";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import { loadContentRepoEntries } from "./content-repo-sync";

const environment = { ...process.env };
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "content-repo-scale-"));
  process.env.DB_PATH = join(root, "db.sqlite");
  process.env.LOCAL_CONTENT_BASE_PATH = join(root, "local");
  const sqlite = new Database(process.env.DB_PATH);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
});

beforeEach(async () => {
  await db.delete(posts);
});

afterAll(() => {
  for (const key of Object.keys(process.env)) if (!(key in environment)) delete process.env[key];
  Object.assign(process.env, environment);
  rmSync(root, { recursive: true, force: true });
});

describe("content repository batch limit", () => {
  test("check-style loading is not limited by the push batch size", async () => {
    const total = CONTENT_REPO_MAX_BATCH_CONTENTS + 1;
    for (let index = 0; index < total; index += 1) {
      const id = `blog/post-${index}.md`;
      db.insert(posts)
        .values({
          id,
          slug: `post-${index}`,
          type: "post",
          title: `Post ${index}`,
          body: "body",
          publishDate: 1,
          draft: false,
          public: true,
          contentHash: `hash-${index}`,
          dataSource: "database",
          source: "database",
          filePath: id,
        })
        .run();
    }

    const { entries } = await loadContentRepoEntries();
    expect(entries).toHaveLength(total);

    await expect(
      loadContentRepoEntries(undefined, { enforceBatchLimit: true })
    ).rejects.toMatchObject({
      kind: "invalid",
    });
  });
});
