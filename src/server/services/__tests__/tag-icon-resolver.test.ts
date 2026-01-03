import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { tags } from "@/lib/schema";
import { resolveTagIconsForTags } from "@/server/services/tag-icon-resolver";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/tag-icon-resolver-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

async function seedTag(id: string, icon: string | null): Promise<void> {
  if (!db) {
    throw new Error("Database has not been initialised");
  }

  const now = Math.floor(Date.now() / 1000);
  await db.insert(tags).values({
    id,
    icon,
    description: "",
    postCount: 0,
    memoCount: 0,
    createdAt: now,
    updatedAt: now,
  });
}

describe("tag-icon-resolver", () => {
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
    await db.delete(tags);
  });

  it("resolves icons case-insensitively", async () => {
    await seedTag("TypeScript", "simple-icons:typescript");

    const res = await resolveTagIconsForTags(["typescript"]);
    expect(res).toEqual({
      typescript: "simple-icons:typescript",
    });
  });

  it("falls back to leaf segment when tagPath has no icon", async () => {
    await seedTag("DevOps/Network", null);
    await seedTag("Network", "tabler:network");

    const res = await resolveTagIconsForTags(["DevOps/Network"]);
    expect(res).toEqual({
      "DevOps/Network": "tabler:network",
    });
  });

  it("ignores leading # and collapses empty segments", async () => {
    await seedTag("Network", "tabler:network");

    const res = await resolveTagIconsForTags(["##DevOps//Network/"]);
    expect(res).toEqual({
      "DevOps/Network": "tabler:network",
    });
  });

  it("resolves case-collisions deterministically (prefers icon, then lex smallest id)", async () => {
    await seedTag("Alpha", null);
    await seedTag("alpha", "tabler:abc");
    await seedTag("DOG", "tabler:dog");
    await seedTag("dog", "tabler:cat");

    const res = await resolveTagIconsForTags(["ALPHA", "DoG"]);
    expect(res).toEqual({
      ALPHA: "tabler:abc",
      DoG: "tabler:dog",
    });
  });
});
