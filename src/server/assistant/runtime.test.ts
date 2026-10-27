import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createAssistantStorage } from "@/lib/assistant-storage";
import * as schema from "@/lib/schema";
import { frontendUsers } from "@/lib/schema";
import { buildAssistantRetrievalContext, createAssistantRuntimeForTest } from "./runtime";

const sqlite = new Database(":memory:");
const database = drizzle(sqlite, { schema });
const migrationsPath = path.resolve("drizzle");

async function addUser(id: string) {
  await database.insert(frontendUsers).values({
    id,
    adminUserId: null,
    isAdmin: false,
    displayName: id,
    email: null,
    avatarUrl: "/site-assets/default-avatar.svg",
    profileUrl: null,
    createdAt: 1,
    updatedAt: 1,
  });
}

async function waitFor(check: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await Bun.sleep(5);
  }
  throw new Error("Timed out waiting for assistant runtime");
}

describe("assistant runtime", () => {
  beforeAll(() => {
    migrate(database, { migrationsFolder: migrationsPath });
  });

  afterAll(() => {
    sqlite.close();
  });

  it("claims a durable job and persists a completed answer", async () => {
    await addUser("assistant-runtime-owner");
    const storage = createAssistantStorage(database);
    const submission = await storage.submitTurn({
      frontendUserId: "assistant-runtime-owner",
      requestId: "runtime-complete-request",
      content: "What is SQLite?",
      now: 100,
    });
    const runtime = createAssistantRuntimeForTest({
      storage,
      leaseMs: 500,
      generate: async ({ onDelta }) => {
        await onDelta("SQLite is an embedded database.");
        return {
          content: "SQLite is an embedded database.",
          citations: [
            {
              source: "blog" as const,
              sourceId: "sqlite-post",
              sourceType: "post",
              slug: "sqlite",
              title: "SQLite",
              href: "/posts/sqlite",
              location: "content",
              snippet: "SQLite is an embedded database.",
            },
          ],
        };
      },
      now: () => 1_000,
    });
    await runtime.start();
    await waitFor(
      async () =>
        (await storage.getGenerationJob(submission.generationJob.id, "assistant-runtime-owner"))
          ?.status === "completed"
    );
    const messages = await storage.listMessages(
      submission.conversation.id,
      "assistant-runtime-owner"
    );
    expect(messages.at(-1)?.content).toBe("SQLite is an embedded database.");
    expect(messages.at(-1)?.status).toBe("completed");
    expect(messages.at(-1)?.citations).toMatchObject([{ slug: "sqlite", href: "/posts/sqlite" }]);
    await runtime.stop();
  });

  it("does not commit an answer body after an explicit stop", async () => {
    await addUser("assistant-runtime-stop-owner");
    const storage = createAssistantStorage(database);
    const submission = await storage.submitTurn({
      frontendUserId: "assistant-runtime-stop-owner",
      requestId: "runtime-stop-request",
      content: "Answer slowly",
      now: 200,
    });
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      const original = resolve;
      release = original;
    });
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const runtime = createAssistantRuntimeForTest({
      storage,
      leaseMs: 500,
      generate: async () => {
        release();
        await gate;
        return { content: "late answer", citations: [] };
      },
      now: () => 1_000,
    });
    await runtime.start();
    await started;
    await storage.stopGeneration(submission.generationJob.id, "assistant-runtime-stop-owner", 210);
    unblock();
    await waitFor(
      async () =>
        (
          await storage.getGenerationJob(
            submission.generationJob.id,
            "assistant-runtime-stop-owner"
          )
        )?.status === "cancelled"
    );
    const messages = await storage.listMessages(
      submission.conversation.id,
      "assistant-runtime-stop-owner"
    );
    expect(messages.at(-1)?.content).toBe("");
    expect(messages.at(-1)?.status).toBe("cancelled");
    await runtime.stop();
  });

  it("binds public retrieval to published content and the question usage context", async () => {
    await addUser("assistant-retrieval-owner");
    const storage = createAssistantStorage(database);
    const submission = await storage.submitTurn({
      frontendUserId: "assistant-retrieval-owner",
      requestId: "runtime-retrieval-request",
      content: "Where is the SQLite guide?",
      now: 300,
    });
    const execution = await storage.getJobExecution(submission.generationJob.id);
    if (!execution) throw new Error("missing assistant execution");

    expect(buildAssistantRetrievalContext(execution, false)).toMatchObject({
      publishedOnly: true,
      metering: {
        feature: "assistant-retrieval",
        frontendUserId: "assistant-retrieval-owner",
        conversationId: submission.conversation.id,
        generationJobId: submission.generationJob.id,
        logicalQuestionId: "runtime-retrieval-request",
        chargePersonalQuota: true,
        chargeQuestion: true,
        isAdmin: false,
      },
    });
    expect(buildAssistantRetrievalContext(execution, true)).toMatchObject({
      publishedOnly: false,
      metering: { isAdmin: true },
    });
  });
});
