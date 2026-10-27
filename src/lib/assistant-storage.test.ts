import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createAssistantStorage } from "@/lib/assistant-storage";
import * as schema from "@/lib/schema";
import { frontendUsers } from "@/lib/schema";

const migrationsPath = path.resolve("drizzle");
const sqlite = new Database(":memory:");
const database = drizzle(sqlite, { schema });

describe("assistant SQLite storage", () => {
  beforeAll(() => {
    migrate(database, { migrationsFolder: migrationsPath });
  });

  afterAll(() => {
    sqlite.close();
  });

  it("scopes messages to the frontend owner and keeps submission idempotency", async () => {
    await database.insert(frontendUsers).values({
      id: "frontend-storage-owner",
      adminUserId: null,
      isAdmin: false,
      displayName: "Storage Owner",
      email: null,
      avatarUrl: "/site-assets/default-avatar.svg",
      profileUrl: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const storage = createAssistantStorage(database);
    const conversation = await storage.createConversation({
      id: "conversation-storage",
      frontendUserId: "frontend-storage-owner",
      now: 100,
    });
    expect(conversation.kind).toBe("general");

    const first = await storage.appendMessage({
      conversationId: conversation.id,
      frontendUserId: "frontend-storage-owner",
      role: "user",
      content: "Question",
      clientRequestId: "request-1",
      now: 200,
    });
    const retry = await storage.appendMessage({
      conversationId: conversation.id,
      frontendUserId: "frontend-storage-owner",
      role: "user",
      content: "Question",
      clientRequestId: "request-1",
      now: 201,
    });
    expect(retry.id).toBe(first.id);

    await storage.createGenerationJob({
      id: "generation-storage",
      conversationId: conversation.id,
      frontendUserId: "frontend-storage-owner",
      userMessageId: first.id,
      requestId: "generation-request-1",
      now: 202,
    });
    expect(await storage.getGenerationJob("generation-storage", "other-owner")).toBeNull();
    expect(await storage.listMessages(conversation.id, "other-owner")).toEqual([]);
    expect(await storage.listMessages(conversation.id, "frontend-storage-owner")).toHaveLength(1);
    await expect(
      storage.appendMessage({
        conversationId: conversation.id,
        frontendUserId: "other-owner",
        role: "user",
        content: "Should be rejected",
      })
    ).rejects.toThrow("not owned");
    await expect(
      storage.createGenerationJob({
        conversationId: conversation.id,
        frontendUserId: "other-owner",
        requestId: "generation-request-2",
      })
    ).rejects.toThrow("not owned");
  });
});
