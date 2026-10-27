import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createAssistantStorage } from "@/lib/assistant-storage";
import * as schema from "@/lib/schema";
import { assistantMessageCitations, assistantQuotaPolicies, frontendUsers } from "@/lib/schema";

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

  it("atomically creates a first turn, enforces one active turn, and blocks late deltas", async () => {
    await database.insert(frontendUsers).values({
      id: "frontend-storage-runtime-owner",
      adminUserId: null,
      isAdmin: false,
      displayName: "Runtime Owner",
      email: null,
      avatarUrl: "/site-assets/default-avatar.svg",
      profileUrl: null,
      createdAt: 1,
      updatedAt: 1,
    });
    await database
      .insert(assistantQuotaPolicies)
      .values({
        id: "assistant-storage-runtime-policy",
        scope: "global",
        tokenHourlyLimit: 10_000,
        tokenWeeklyLimit: 100_000,
        questionHourlyLimit: 10,
        questionWeeklyLimit: 100,
        maxConversations: 1,
        retentionMs: 1_000,
        timezone: "UTC",
        createdAt: 1,
        updatedAt: 1,
      })
      .onConflictDoUpdate({ target: assistantQuotaPolicies.scope, set: { maxConversations: 1 } });
    const storage = createAssistantStorage(database);
    const first = await storage.submitTurn({
      frontendUserId: "frontend-storage-runtime-owner",
      requestId: "runtime-request-1",
      clientRequestId: "runtime-client-1",
      content: "First question",
      now: 500,
    });
    const retry = await storage.submitTurn({
      frontendUserId: "frontend-storage-runtime-owner",
      requestId: "runtime-request-2",
      clientRequestId: "runtime-client-1",
      content: "First question retried",
      now: 501,
    });
    expect(retry.generationJob.id).toBe(first.generationJob.id);
    await expect(
      storage.submitTurn({
        frontendUserId: "frontend-storage-runtime-owner",
        requestId: "runtime-request-3",
        content: "Second conversation",
        now: 502,
      })
    ).rejects.toMatchObject({ code: "quota" });
    await expect(
      storage.submitTurn({
        frontendUserId: "frontend-storage-runtime-owner",
        conversationId: first.conversation.id,
        requestId: "runtime-request-4",
        content: "Concurrent turn",
        now: 503,
      })
    ).rejects.toMatchObject({ code: "conflict" });

    const claimed = await storage.claimNextGenerationJob(504, 10_000);
    expect(claimed?.job.status).toBe("running");
    expect(
      await storage.appendGenerationDelta(
        first.generationJob.id,
        first.generationJob.attempt,
        "late?",
        505
      )
    ).toBe(true);
    await storage.stopGeneration(first.generationJob.id, "frontend-storage-runtime-owner", 506);
    expect(
      await storage.appendGenerationDelta(
        first.generationJob.id,
        first.generationJob.attempt,
        "late body",
        507
      )
    ).toBe(false);
    await storage.finishGeneration(first.generationJob.id, first.generationJob.attempt, {
      status: "completed",
      content: "late body",
      now: 508,
    });
    const messages = await storage.listMessages(
      first.conversation.id,
      "frontend-storage-runtime-owner"
    );
    expect(messages.at(-1)?.content).toBe("late?");
    expect(messages.at(-1)?.status).toBe("cancelled");
    await database.insert(assistantMessageCitations).values({
      id: "runtime-citation-to-delete",
      messageId: first.assistantMessage.id,
      source: "blog",
      sourceId: "runtime-source",
      sourceType: "post",
      slug: "runtime-source",
      title: "Runtime source",
      href: "/posts/runtime-source",
      location: "content",
      snippet: "Runtime source snippet",
      createdAt: 509,
    });

    const racing = await Promise.allSettled([
      storage.submitTurn({
        frontendUserId: "frontend-storage-runtime-owner",
        conversationId: first.conversation.id,
        requestId: "runtime-race-1",
        content: "Racing turn one",
        now: 510,
      }),
      storage.submitTurn({
        frontendUserId: "frontend-storage-runtime-owner",
        conversationId: first.conversation.id,
        requestId: "runtime-race-2",
        content: "Racing turn two",
        now: 510,
      }),
    ]);
    expect(racing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      racing.filter((result) => result.status === "rejected").map((result) => result.reason.code)
    ).toEqual(["conflict"]);

    const afterExpiry = await storage.submitTurn({
      frontendUserId: "frontend-storage-runtime-owner",
      requestId: "runtime-request-after-expiry",
      content: "A fresh question after expiry",
      now: 2_000,
    });
    expect(afterExpiry.conversation.id).not.toBe(first.conversation.id);
    expect(
      await storage.listMessages(first.conversation.id, "frontend-storage-runtime-owner")
    ).toEqual([]);
    expect(await database.select().from(assistantMessageCitations)).toHaveLength(0);
  });
});
