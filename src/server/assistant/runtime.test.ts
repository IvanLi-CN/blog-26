import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { FrontendPrincipal } from "@/lib/assistant-contracts";
import { createAssistantStorage } from "@/lib/assistant-storage";
import * as schema from "@/lib/schema";
import { frontendUsers } from "@/lib/schema";
import {
  buildAssistantRetrievalContext,
  createAssistantRuntimeForTest,
  readAssistantProviderResponse,
} from "./runtime";
import { createAssistantServiceForTest } from "./service";

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
    const principal = {
      id: "assistant-runtime-stop-owner",
      kind: "reader" as const,
      isAdmin: false,
      displayName: "Assistant Runtime Stop Owner",
      email: null,
      avatarUrl: "/site-assets/default-avatar.svg",
      profileUrl: null,
      adminUserId: null,
      readerId: "assistant-runtime-stop-owner",
      github: null,
    } satisfies FrontendPrincipal;
    let aborted = false;
    const runtime = createAssistantRuntimeForTest({
      storage,
      leaseMs: 500,
      generate: async ({ signal }) => {
        release();
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            aborted = true;
            reject(signal.reason ?? new DOMException("Generation cancelled", "AbortError"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
          void gate.then(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
          });
        });
        return { content: "late answer", citations: [] };
      },
      now: () => 1_000,
    });
    await runtime.start();
    await started;
    const service = createAssistantServiceForTest({ storage, runtime });
    const stopped = await service.stop(principal, { turnId: submission.generationJob.id });
    expect(stopped.stopped).toBe(true);
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
    expect(aborted).toBe(true);
    await runtime.stop();
  });

  it("marks provider failures as terminal without retrying the job", async () => {
    await addUser("assistant-runtime-failure-owner");
    const storage = createAssistantStorage(database);
    const submission = await storage.submitTurn({
      frontendUserId: "assistant-runtime-failure-owner",
      requestId: "runtime-failure-request",
      content: "Fail safely",
      now: 250,
    });
    let attempts = 0;
    const runtime = createAssistantRuntimeForTest({
      storage,
      pumpDelayMs: 1,
      generate: async () => {
        attempts += 1;
        throw new Error("provider-down");
      },
      now: () => 1_000,
    });
    await runtime.start();
    await waitFor(
      async () =>
        (
          await storage.getGenerationJob(
            submission.generationJob.id,
            "assistant-runtime-failure-owner"
          )
        )?.status === "failed"
    );
    const job = await storage.getGenerationJob(
      submission.generationJob.id,
      "assistant-runtime-failure-owner"
    );
    expect(attempts).toBe(1);
    expect(job).toMatchObject({ status: "failed", errorCode: "provider-down" });
    await runtime.stop();
  });

  it("fails an in-flight job on restart without replaying the provider call", async () => {
    await addUser("assistant-runtime-restart-owner");
    const storage = createAssistantStorage(database);
    const submission = await storage.submitTurn({
      frontendUserId: "assistant-runtime-restart-owner",
      requestId: "runtime-restart-request",
      content: "Recover this job",
      now: 275,
    });
    const claimed = await storage.claimNextGenerationJob(1_000, 500);
    expect(claimed?.job.id).toBe(submission.generationJob.id);
    let attempts = 0;
    const runtime = createAssistantRuntimeForTest({
      storage,
      pumpDelayMs: 1,
      generate: async () => {
        attempts += 1;
        return { content: "must not replay", citations: [] };
      },
      now: () => 1_100,
    });
    await runtime.start();
    await waitFor(
      async () =>
        (
          await storage.getGenerationJob(
            submission.generationJob.id,
            "assistant-runtime-restart-owner"
          )
        )?.status === "failed"
    );
    const job = await storage.getGenerationJob(
      submission.generationJob.id,
      "assistant-runtime-restart-owner"
    );
    expect(attempts).toBe(0);
    expect(job).toMatchObject({ status: "failed", errorCode: "worker-restarted" });
    await runtime.stop();
  });

  it("fails an abandoned lease while the worker remains online", async () => {
    await addUser("assistant-runtime-lease-owner");
    const storage = createAssistantStorage(database);
    let now = 1_000;
    let attempts = 0;
    const runtime = createAssistantRuntimeForTest({
      storage,
      pumpDelayMs: 1,
      generate: async () => {
        attempts += 1;
        return { content: "must not run", citations: [] };
      },
      now: () => now,
    });
    await runtime.start();
    const submission = await storage.submitTurn({
      frontendUserId: "assistant-runtime-lease-owner",
      requestId: "runtime-lease-request",
      content: "Recover the abandoned lease",
      now: 1_001,
    });
    expect((await storage.claimNextGenerationJob(1_002, 10))?.job.id).toBe(
      submission.generationJob.id
    );
    now = 1_013;
    runtime.enqueue();
    await waitFor(
      async () =>
        (
          await storage.getGenerationJob(
            submission.generationJob.id,
            "assistant-runtime-lease-owner"
          )
        )?.status === "failed"
    );
    expect(attempts).toBe(0);
    expect(
      await storage.getGenerationJob(submission.generationJob.id, "assistant-runtime-lease-owner")
    ).toMatchObject({ errorCode: "worker-lease-expired" });
    await runtime.stop();
  });

  it("expires stale conversations while the worker is idle", async () => {
    await addUser("assistant-runtime-idle-expiry-owner");
    const storage = createAssistantStorage(database);
    const conversation = await storage.createConversation({
      frontendUserId: "assistant-runtime-idle-expiry-owner",
      kind: "general",
      expiresAt: 1_001,
      now: 1_000,
    });
    let now = 1_000;
    const runtime = createAssistantRuntimeForTest({
      storage,
      expirySweepMs: 5,
      generate: async () => ({ content: "unused", citations: [] }),
      now: () => now,
    });
    await runtime.start();
    now = 1_002;
    await waitFor(
      async () =>
        (await storage.getConversation(conversation.id, "assistant-runtime-idle-expiry-owner"))
          ?.status === "expired"
    );
    await runtime.stop();
  });

  it("wakes a queued job before the idle expiry sweep", async () => {
    await addUser("assistant-runtime-wakeup-owner");
    const storage = createAssistantStorage(database);
    let generated = 0;
    const runtime = createAssistantRuntimeForTest({
      storage,
      pumpDelayMs: 0,
      expirySweepMs: 1_000,
      generate: async () => {
        generated++;
        return { content: "Woken answer", citations: [] };
      },
    });
    await runtime.start();
    await Bun.sleep(10);
    const submission = await storage.submitTurn({
      frontendUserId: "assistant-runtime-wakeup-owner",
      requestId: "runtime-wakeup-request",
      content: "Wake the worker",
    });
    runtime.enqueue();
    await waitFor(
      async () =>
        (
          await storage.getGenerationJob(
            submission.generationJob.id,
            "assistant-runtime-wakeup-owner"
          )
        )?.status === "completed"
    );
    expect(generated).toBe(1);
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

  it("requires a complete provider SSE stream before committing success", async () => {
    const headers = { "content-type": "text/event-stream" };
    const incomplete = new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', {
      headers,
    });
    await expect(
      readAssistantProviderResponse(incomplete, new AbortController().signal, async () => true)
    ).rejects.toThrow("assistant-provider-stream-incomplete");

    const providerError = new Response(
      'event: error\ndata: {"error":{"message":"upstream failed"}}\n\n',
      { headers }
    );
    await expect(
      readAssistantProviderResponse(providerError, new AbortController().signal, async () => true)
    ).rejects.toThrow("assistant-provider-stream-error:upstream failed");

    const complete = new Response(
      'data: {"choices":[{"delta":{"content":"complete"}}]}\n\ndata: [DONE]\n\n',
      { headers }
    );
    await expect(
      readAssistantProviderResponse(complete, new AbortController().signal, async () => true)
    ).resolves.toMatchObject({ content: "complete" });

    const openBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"complete"}}]}\n\ndata: [DONE]\n\n'
          )
        );
      },
    });
    const openResult = await Promise.race([
      readAssistantProviderResponse(
        new Response(openBody, { headers }),
        new AbortController().signal,
        async () => true
      ),
      Bun.sleep(100).then(() => "timeout" as const),
    ]);
    expect(openResult).not.toBe("timeout");
    if (openResult === "timeout") throw new Error("provider did not stop at [DONE]");
    expect(openResult).toMatchObject({ content: "complete" });
  });
});
