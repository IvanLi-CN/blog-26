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

  it("serializes concurrent appends and returns the existing idempotent message", async () => {
    await database.insert(frontendUsers).values({
      id: "frontend-storage-concurrent-owner",
      adminUserId: null,
      isAdmin: false,
      displayName: "Concurrent Owner",
      email: null,
      avatarUrl: "/site-assets/default-avatar.svg",
      profileUrl: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const storage = createAssistantStorage(database);
    const conversation = await storage.createConversation({
      id: "conversation-storage-concurrent",
      frontendUserId: "frontend-storage-concurrent-owner",
      now: 300,
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        storage.appendMessage({
          conversationId: conversation.id,
          frontendUserId: conversation.frontendUserId,
          role: "user",
          content: "Concurrent question",
          clientRequestId: "concurrent-request",
          now: 301 + index,
        })
      )
    );
    expect(new Set(results.map((message) => message.id)).size).toBe(1);
    expect(results.every((message) => message.sequence === 1)).toBe(true);
    expect(await storage.listMessages(conversation.id, conversation.frontendUserId)).toHaveLength(
      1
    );
  });

  it("rejects generation jobs that reference another conversation or role", async () => {
    await database.insert(frontendUsers).values({
      id: "frontend-storage-reference-owner",
      adminUserId: null,
      isAdmin: false,
      displayName: "Reference Owner",
      email: null,
      avatarUrl: "/site-assets/default-avatar.svg",
      profileUrl: null,
      createdAt: 1,
      updatedAt: 1,
    });
    const storage = createAssistantStorage(database);
    const firstConversation = await storage.createConversation({
      id: "conversation-storage-reference-first",
      frontendUserId: "frontend-storage-reference-owner",
      now: 400,
    });
    const secondConversation = await storage.createConversation({
      id: "conversation-storage-reference-second",
      frontendUserId: "frontend-storage-reference-owner",
      now: 401,
    });
    const firstUser = await storage.appendMessage({
      id: "message-storage-reference-first-user",
      conversationId: firstConversation.id,
      frontendUserId: firstConversation.frontendUserId,
      role: "user",
      content: "First question",
      now: 402,
    });
    const firstAssistant = await storage.appendMessage({
      id: "message-storage-reference-first-assistant",
      conversationId: firstConversation.id,
      frontendUserId: firstConversation.frontendUserId,
      role: "assistant",
      content: "First answer",
      now: 403,
    });
    const secondUser = await storage.appendMessage({
      id: "message-storage-reference-second-user",
      conversationId: secondConversation.id,
      frontendUserId: secondConversation.frontendUserId,
      role: "user",
      content: "Second question",
      now: 404,
    });

    await expect(
      storage.createGenerationJob({
        conversationId: firstConversation.id,
        frontendUserId: firstConversation.frontendUserId,
        userMessageId: secondUser.id,
        requestId: "reference-cross-conversation-user",
      })
    ).rejects.toThrow("belong to the conversation");
    await expect(
      storage.createGenerationJob({
        conversationId: firstConversation.id,
        frontendUserId: firstConversation.frontendUserId,
        userMessageId: firstAssistant.id,
        requestId: "reference-wrong-user-role",
      })
    ).rejects.toThrow("role user");
    await expect(
      storage.createGenerationJob({
        conversationId: firstConversation.id,
        frontendUserId: firstConversation.frontendUserId,
        assistantMessageId: firstUser.id,
        requestId: "reference-wrong-assistant-role",
      })
    ).rejects.toThrow("role assistant");
  });
});
