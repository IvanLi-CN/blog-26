import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createAssistantStorage } from "@/lib/assistant-storage";
import { db, initializeDB } from "@/lib/db";
import {
  assistantConversations,
  assistantQuotaPolicies,
  frontendIdentityLinks,
  frontendSessions,
  frontendUsers,
  readerSessions,
  readers,
  users,
} from "@/lib/schema";
import { createAssistantRuntimeForTest, stopAssistantRuntime } from "@/server/assistant/runtime";
import { type AssistantService, createAssistantServiceForTest } from "@/server/assistant/service";
import { handlePublicApiRequest } from "@/server/public-api/router";

const testDbPath = path.join(process.cwd(), "tmp/public-assistant-chat-test.sqlite");
const migrationsPath = path.resolve("drizzle");
const originalDbPath = process.env.DB_PATH;
const originalAdminEmail = process.env.ADMIN_EMAIL;
const originalNodeEnv = process.env.NODE_ENV;
const adminEmail = "assistant-chat-admin@test.local";
let assistantService: AssistantService | null = null;
let assistantRuntime: ReturnType<typeof createAssistantRuntimeForTest> | null = null;
let generationEntered: Promise<void> = Promise.resolve();
let releaseGeneration: (() => void) | null = null;

function request(pathname: string, options: RequestInit = {}) {
  return new Request(`http://localhost/api/public${pathname}`, {
    ...options,
    headers: {
      origin: "http://localhost",
      ...(options.headers ?? {}),
    },
  });
}

async function bootstrapSession() {
  const bootstrap = await handlePublicApiRequest(
    request("/frontend-auth/bootstrap", {
      method: "POST",
      headers: { "Remote-Email": adminEmail },
    }),
    "/frontend-auth/bootstrap"
  );
  const cookie = bootstrap.headers
    .getSetCookie()
    .find((value) => value.startsWith("frontend_session_id="))
    ?.split(";", 1)[0];
  if (!cookie) throw new Error("frontend session cookie was not created");
  return cookie;
}

async function bootstrapReaderSession() {
  const token = "assistant-chat-reader-token";
  const now = Date.now();
  await db?.insert(readers).values({
    id: "assistant-chat-reader",
    githubId: "assistant-chat-reader-github",
    githubLogin: "assistant-chat-reader",
    displayName: "Assistant Chat Reader",
    avatarUrl: "/site-assets/default-avatar.svg",
    profileUrl: null,
    createdAt: now,
    updatedAt: now,
  });
  await db?.insert(readerSessions).values({
    id: "assistant-chat-reader-session",
    readerId: "assistant-chat-reader",
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: now + 60 * 60 * 1000,
    createdAt: now,
    revokedAt: null,
  });
  const bootstrap = await handlePublicApiRequest(
    request("/frontend-auth/bootstrap", {
      method: "POST",
      headers: { cookie: `reader_session_id=${token}` },
    }),
    "/frontend-auth/bootstrap"
  );
  const cookie = bootstrap.headers
    .getSetCookie()
    .find((value) => value.startsWith("frontend_session_id="))
    ?.split(";", 1)[0];
  if (!cookie) throw new Error("reader frontend session cookie was not created");
  return cookie;
}

function authenticated(pathname: string, cookie: string, options: RequestInit = {}) {
  return request(pathname, {
    ...options,
    headers: {
      cookie,
      ...(options.headers ?? {}),
    },
  });
}

function assistant(pathname: string, cookie: string, options: RequestInit = {}) {
  if (!assistantService) throw new Error("assistant test service was not created");
  return handlePublicApiRequest(
    authenticated(pathname, cookie, options),
    pathname.split("?", 1)[0],
    assistantService
  );
}

describe("public assistant chat API", () => {
  beforeAll(async () => {
    process.env.DB_PATH = testDbPath;
    process.env.ADMIN_EMAIL = adminEmail;
    process.env.NODE_ENV = "test";
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath);
    const sqlite = new Database(testDbPath);
    migrate(drizzle(sqlite), { migrationsFolder: migrationsPath });
    sqlite.close();
    await initializeDB(true);
  });

  beforeEach(async () => {
    await db?.delete(assistantConversations);
    await db?.delete(assistantQuotaPolicies);
    await db?.delete(readerSessions);
    await db?.delete(readers);
    await db?.delete(frontendSessions);
    await db?.delete(frontendIdentityLinks);
    await db?.delete(frontendUsers);
    await db?.delete(users);
    releaseGeneration = null;
    let markGenerationEntered!: () => void;
    generationEntered = new Promise<void>((resolve) => {
      markGenerationEntered = resolve;
    });
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    const storage = createAssistantStorage(db ?? undefined);
    assistantRuntime = createAssistantRuntimeForTest({
      storage,
      generate: async ({ onDelta }) => {
        markGenerationEntered();
        await onDelta("Deterministic assistant answer");
        await generationGate;
        return { content: "Deterministic assistant answer", citations: [] };
      },
      pumpDelayMs: 1,
    });
    assistantService = createAssistantServiceForTest({ storage, runtime: assistantRuntime });
  });

  afterEach(async () => {
    releaseGeneration?.();
    await assistantRuntime?.stop();
    assistantRuntime = null;
    assistantService = null;
  });

  afterAll(async () => {
    await stopAssistantRuntime();
    db?.$client.close();
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath);
  });

  it("requires frontend identity and exposes 202, snapshot, SSE, and quota contracts", async () => {
    const unauthorized = await handlePublicApiRequest(request("/chat"), "/chat");
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const cookie = await bootstrapSession();
    const tooLong = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "api-chat-too-long",
        content: "x".repeat(8_193),
      }),
    });
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toMatchObject({ code: "BAD_REQUEST" });

    const quota = await assistant("/chat/quota", cookie);
    expect(quota.status).toBe(200);
    expect(quota.headers.get("cache-control")).toBe("no-store, private");
    expect(await quota.json()).toMatchObject({ unlimited: true });

    const submitted = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "api-chat-request-1",
        clientRequestId: "api-chat-client-1",
        content: "Explain SQLite",
      }),
    });
    expect(submitted.status).toBe(202);
    const accepted = (await submitted.json()) as {
      conversationId: string;
      turnId: string;
    };
    expect(accepted.conversationId).toBeTruthy();
    expect(accepted.turnId).toBeTruthy();

    const owner = await db
      ?.select({ frontendUserId: assistantConversations.frontendUserId })
      .from(assistantConversations)
      .where(eq(assistantConversations.id, accepted.conversationId))
      .get();
    if (!owner) throw new Error("assistant owner was not found");
    const clipping = await assistantService?.storage.submitTurn({
      frontendUserId: owner.frontendUserId,
      kind: "clipping",
      clippingMemoId: "Memos/private.md",
      clippingVersionId: "11111111-1111-4111-8111-111111111111",
      requestId: "api-clipping-seeded",
      content: "private clipping question",
      isAdmin: true,
    });
    if (!clipping) throw new Error("clipping conversation was not seeded");
    const genericClippingSnapshot = await assistant(
      `/chat/snapshot?conversationId=${encodeURIComponent(clipping.conversation.id)}`,
      cookie
    );
    expect(genericClippingSnapshot.status).toBe(404);
    const genericClippingSubmit = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "api-clipping-direct",
        kind: "clipping",
        clippingMemoId: "Memos/private.md",
        clippingVersionId: "11111111-1111-4111-8111-111111111111",
        content: "private clipping question",
      }),
    });
    expect(genericClippingSubmit.status).toBe(404);
    const genericClippingExistingSubmit = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "api-clipping-existing",
        conversationId: clipping.conversation.id,
        content: "private clipping question",
      }),
    });
    expect(genericClippingExistingSubmit.status).toBe(404);
    const mixedStop = await assistant("/chat/stop", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: accepted.conversationId,
        turnId: clipping.generationJob.id,
      }),
    });
    expect(mixedStop.status).toBe(404);
    expect(
      await assistantService.storage.getGenerationJob(
        clipping.generationJob.id,
        owner.frontendUserId
      )
    ).toMatchObject({ status: "queued" });

    const conflict = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversationId: accepted.conversationId,
        requestId: "api-chat-conflict-request",
        content: "A concurrent turn",
      }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "CONFLICT" });

    const retry = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "api-chat-request-1",
        clientRequestId: "api-chat-client-1",
        content: "Explain SQLite again",
      }),
    });
    expect(retry.status).toBe(202);
    expect((await retry.json()).turnId).toBe(accepted.turnId);

    const snapshot = await assistant(
      `/chat/snapshot?conversationId=${encodeURIComponent(accepted.conversationId)}`,
      cookie
    );
    expect(snapshot.status).toBe(200);
    expect(snapshot.headers.get("cache-control")).toBe("no-store, private");
    const snapshotBody = (await snapshot.json()) as {
      conversation: { id: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(snapshotBody).toMatchObject({ conversation: { id: accepted.conversationId } });
    expect(snapshotBody.messages[0]).toMatchObject({ role: "user", content: "Explain SQLite" });

    const events = await assistant(
      `/chat/events?conversationId=${encodeURIComponent(accepted.conversationId)}`,
      cookie
    );
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    await generationEntered;
    releaseGeneration?.();
    const eventText = await events.text();
    expect(eventText).toContain("event: snapshot");
    expect(eventText).toContain('"status":"completed"');

    const deleted = await assistant(
      `/chat/conversations/${encodeURIComponent(accepted.conversationId)}`,
      cookie,
      {
        method: "DELETE",
      }
    );
    expect(deleted.status).toBe(200);
    const gone = await assistant(
      `/chat/conversations/${encodeURIComponent(accepted.conversationId)}`,
      cookie
    );
    expect(gone.status).toBe(410);
  });

  it("does not disclose another or missing conversation", async () => {
    const cookie = await bootstrapSession();
    const submitted = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: "owner-isolation-request", content: "private" }),
    });
    const { conversationId } = (await submitted.json()) as { conversationId: string };
    const otherCookie = await bootstrapReaderSession();
    const missing = await assistant("/chat/conversations/not-a-real-conversation", otherCookie);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });
    for (const [pathname, options] of [
      [`/chat/conversations/${conversationId}`, {}],
      [`/chat/conversations/${conversationId}/messages`, {}],
      [`/chat/conversations/${conversationId}/events`, {}],
      [`/chat/conversations/${conversationId}/stop`, { method: "POST" }],
      [`/chat/conversations/${conversationId}`, { method: "DELETE" }],
    ] as const) {
      const response = await assistant(pathname, otherCookie, options);
      expect(response.status).toBe(404);
    }
  });

  it("replays an accepted reader turn after quota exhaustion", async () => {
    const cookie = await bootstrapReaderSession();
    const submitted = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "reader-idempotent-request",
        clientRequestId: "reader-idempotent-client",
        content: "Recover this accepted turn",
      }),
    });
    expect(submitted.status).toBe(202);
    const accepted = (await submitted.json()) as { turnId: string };

    const now = Date.now();
    await db?.insert(assistantQuotaPolicies).values({
      id: "reader-idempotent-quota-policy",
      scope: "global",
      tokenHourlyLimit: 1_000_000,
      tokenWeeklyLimit: 1_000_000,
      questionHourlyLimit: 0,
      questionWeeklyLimit: 0,
      maxConversations: 3,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
      timezone: "UTC",
      createdAt: now,
      updatedAt: now,
    });

    const rejected = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "reader-quota-request",
        content: "This new turn should be rejected",
      }),
    });
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toMatchObject({ code: "QUOTA" });

    const retry = await assistant("/chat", cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: "reader-idempotent-request",
        clientRequestId: "reader-idempotent-client",
        content: "The client retried after losing the response",
      }),
    });
    expect(retry.status).toBe(202);
    expect((await retry.json()).turnId).toBe(accepted.turnId);
  });
});
