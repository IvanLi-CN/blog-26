import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { ASSISTANT_DISCUSSION_MIGRATION_ID } from "@/lib/assistant-discussion-migration";
import { db, initializeDB } from "@/lib/db";
import { assistantMigrationState, memoClippings } from "@/lib/schema";
import { readAssistantMigrationGate } from "./migration-gate";

const previousDbPath = process.env.DB_PATH;
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "assistant-migration-gate-"));
  const databasePath = join(root, "app.sqlite");
  process.env.DB_PATH = databasePath;
  await mkdir(root, { recursive: true });
  const sqlite = new Database(databasePath);
  migrate(drizzle(sqlite), { migrationsFolder: "drizzle" });
  sqlite.close();
  await initializeDB(true);
});

afterAll(async () => {
  if (previousDbPath === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = previousDbPath;
  await rm(root, { recursive: true, force: true });
});

test("new installs do not need a discussion migration", async () => {
  if (!db) throw new Error("Database is not initialized");
  await db.delete(memoClippings);
  await db.delete(assistantMigrationState);
  await expect(readAssistantMigrationGate()).resolves.toMatchObject({
    ready: true,
    status: "not-needed",
  });
});

test("canonical manifests keep discussion disabled when the clipping index is missing", async () => {
  if (!db) throw new Error("Database is not initialized");
  await db.delete(memoClippings);
  await db.delete(assistantMigrationState);
  await expect(
    readAssistantMigrationGate({
      manifests: [
        {
          conversationId: "legacy-pi-conversation",
          previousConversations: [],
        },
      ],
    })
  ).resolves.toMatchObject({
    ready: false,
    status: "pending",
    reason: "assistant-discussion-migration-required",
  });
  await expect(
    readAssistantMigrationGate({
      manifests: [
        {
          conversationId: null,
          previousConversations: { conversationId: "malformed-legacy-reference" },
        },
      ],
    })
  ).resolves.toMatchObject({
    ready: false,
    status: "pending",
    reason: "assistant-discussion-migration-required",
  });
});

test("legacy discussion references stay disabled until a complete migration", async () => {
  if (!db) throw new Error("Database is not initialized");
  await db.insert(memoClippings).values({
    id: "legacy-clipping",
    memoId: "Memos/legacy.md",
    creatorId: "creator",
    revision: 1,
    enabled: true,
    deleted: false,
    targetUrl: "https://article.example/legacy",
    currentVersionId: "legacy-version",
    conversationId: "legacy-pi-conversation",
    manifest: JSON.stringify({ conversationId: "legacy-pi-conversation" }),
    updatedAt: 1,
  });
  await expect(readAssistantMigrationGate()).resolves.toMatchObject({
    ready: false,
    status: "pending",
  });
  await db.insert(assistantMigrationState).values({
    id: ASSISTANT_DISCUSSION_MIGRATION_ID,
    status: "blocked",
    sourceVersion: "pi-durable-1",
    cursor: null,
    scanned: 1,
    migrated: 0,
    quarantined: 1,
    errorCount: 1,
    updatedAt: 2,
    lastError: "half-migration",
  });
  await expect(readAssistantMigrationGate()).resolves.toMatchObject({
    ready: false,
    status: "blocked",
    reason: "half-migration",
  });
  await db
    .update(assistantMigrationState)
    .set({ status: "complete", errorCount: 0, lastError: null, updatedAt: 3 })
    .where(eq(assistantMigrationState.id, ASSISTANT_DISCUSSION_MIGRATION_ID));
  await expect(readAssistantMigrationGate()).resolves.toMatchObject({
    ready: true,
    status: "complete",
  });
});
