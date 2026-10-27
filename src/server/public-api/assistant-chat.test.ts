import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import {
  assistantConversations,
  frontendIdentityLinks,
  frontendSessions,
  frontendUsers,
  users,
} from "@/lib/schema";
import { stopAssistantRuntime } from "@/server/assistant/runtime";
import { handlePublicApiRequest } from "@/server/public-api/router";

const testDbPath = path.join(process.cwd(), "tmp/public-assistant-chat-test.sqlite");
const migrationsPath = path.resolve("drizzle");
const originalDbPath = process.env.DB_PATH;
const originalAdminEmail = process.env.ADMIN_EMAIL;
const originalNodeEnv = process.env.NODE_ENV;
const adminEmail = "assistant-chat-admin@test.local";

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

function authenticated(pathname: string, cookie: string, options: RequestInit = {}) {
  return request(pathname, {
    ...options,
    headers: {
      cookie,
      ...(options.headers ?? {}),
    },
  });
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
    await db?.delete(frontendSessions);
    await db?.delete(frontendIdentityLinks);
    await db?.delete(frontendUsers);
    await db?.delete(users);
  });

  afterAll(async () => {
    await stopAssistantRuntime();
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
    const quota = await handlePublicApiRequest(authenticated("/chat/quota", cookie), "/chat/quota");
    expect(quota.status).toBe(200);
    expect(await quota.json()).toMatchObject({ unlimited: true });

    const submitted = await handlePublicApiRequest(
      authenticated("/chat", cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "api-chat-request-1",
          clientRequestId: "api-chat-client-1",
          content: "Explain SQLite",
        }),
      }),
      "/chat"
    );
    expect(submitted.status).toBe(202);
    const accepted = (await submitted.json()) as {
      conversationId: string;
      turnId: string;
    };
    expect(accepted.conversationId).toBeTruthy();
    expect(accepted.turnId).toBeTruthy();

    const retry = await handlePublicApiRequest(
      authenticated("/chat", cookie, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: "api-chat-request-1",
          clientRequestId: "api-chat-client-1",
          content: "Explain SQLite again",
        }),
      }),
      "/chat"
    );
    expect(retry.status).toBe(202);
    expect((await retry.json()).turnId).toBe(accepted.turnId);

    const snapshot = await handlePublicApiRequest(
      authenticated(
        `/chat/snapshot?conversationId=${encodeURIComponent(accepted.conversationId)}`,
        cookie
      ),
      "/chat/snapshot"
    );
    expect(snapshot.status).toBe(200);
    const snapshotBody = (await snapshot.json()) as {
      conversation: { id: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(snapshotBody).toMatchObject({ conversation: { id: accepted.conversationId } });
    expect(snapshotBody.messages[0]).toMatchObject({ role: "user", content: "Explain SQLite" });

    const events = await handlePublicApiRequest(
      authenticated(
        `/chat/events?conversationId=${encodeURIComponent(accepted.conversationId)}`,
        cookie
      ),
      "/chat/events"
    );
    expect(events.status).toBe(200);
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    expect(await events.text()).toContain("event: snapshot");

    const deleted = await handlePublicApiRequest(
      authenticated(`/chat/conversations/${encodeURIComponent(accepted.conversationId)}`, cookie, {
        method: "DELETE",
      }),
      `/chat/conversations/${accepted.conversationId}`
    );
    expect(deleted.status).toBe(200);
    const gone = await handlePublicApiRequest(
      authenticated(`/chat/conversations/${encodeURIComponent(accepted.conversationId)}`, cookie),
      `/chat/conversations/${accepted.conversationId}`
    );
    expect(gone.status).toBe(410);
  });

  it("does not disclose another or missing conversation", async () => {
    const cookie = await bootstrapSession();
    const missing = await handlePublicApiRequest(
      authenticated("/chat/conversations/not-a-real-conversation", cookie),
      "/chat/conversations/not-a-real-conversation"
    );
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "NOT_FOUND" });
  });
});
