import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { hashPersonalAccessToken } from "@/lib/personal-access-token";
import { personalAccessTokens, users } from "@/lib/schema";
import {
  createMcpJsonRpcErrorResponse,
  getMcpSessionAuthForTests,
  getMcpSessionCountForTests,
  handleMcpHttpRequest,
  isMcpInitializeRequest,
} from "./mcp-http";
import { resolveMcpSessionPersistenceKey } from "./mcp-session";

const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

describe("resolveMcpSessionPersistenceKey", () => {
  it("uses the server-issued transport session id for new transports", () => {
    expect(
      resolveMcpSessionPersistenceKey({
        requestedSessionId: "client-supplied",
        responseSessionId: undefined,
        transportSessionId: "server-issued",
        hasExistingSession: false,
      })
    ).toBe("server-issued");
  });

  it("keeps the requested session id only when reusing an existing transport", () => {
    expect(
      resolveMcpSessionPersistenceKey({
        requestedSessionId: "known-session",
        responseSessionId: undefined,
        transportSessionId: "server-issued",
        hasExistingSession: true,
      })
    ).toBe("known-session");
  });

  it("prefers the response session id when the transport returns one", () => {
    expect(
      resolveMcpSessionPersistenceKey({
        requestedSessionId: "known-session",
        responseSessionId: "response-session",
        transportSessionId: "server-issued",
        hasExistingSession: true,
      })
    ).toBe("response-session");
  });
});

describe("MCP HTTP request helpers", () => {
  it("detects initialize requests", () => {
    expect(isMcpInitializeRequest({ jsonrpc: "2.0", id: 1, method: "initialize" })).toBe(true);
    expect(isMcpInitializeRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" })).toBe(false);
    expect(isMcpInitializeRequest(undefined)).toBe(false);
  });

  it("returns protocol-safe JSON-RPC errors", async () => {
    const response = createMcpJsonRpcErrorResponse(
      { jsonrpc: "2.0", id: "call-1", method: "tools/list" },
      "Missing MCP session"
    );
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload).toEqual({
      jsonrpc: "2.0",
      id: "call-1",
      error: {
        code: -32000,
        message: "Missing MCP session",
      },
    });
  });

  it("creates and deletes stateful Streamable HTTP sessions", async () => {
    process.env.DB_PATH = path.join("test-data", `mcp-http-${randomUUID()}.sqlite.db`);
    const initResponse = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Mcp-Protocol-Version": "2025-03-26",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init",
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "bun-test", version: "1.0.0" },
          },
        }),
      })
    );

    const sessionId = initResponse.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeTruthy();
    expect(getMcpSessionCountForTests()).toBe(1);

    const deleteResponse = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "DELETE",
        headers: {
          "Mcp-Session-Id": sessionId || "",
          "Mcp-Protocol-Version": "2025-03-26",
        },
      })
    );

    expect(deleteResponse.status).toBe(200);
    expect(getMcpSessionCountForTests()).toBe(0);
  });

  it("rejects initialize requests that carry unknown session ids", async () => {
    const response = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Mcp-Protocol-Version": "2025-03-26",
          "Mcp-Session-Id": "stale-session",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-stale",
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "bun-test", version: "1.0.0" },
          },
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      jsonrpc: "2.0",
      id: "init-stale",
      error: {
        message: "Unknown MCP session. Reinitialize before sending further requests.",
      },
    });
    expect(getMcpSessionCountForTests()).toBe(0);
  });

  it("stores initialize PAT auth on the MCP session", async () => {
    const testId = randomUUID();
    const dbPath = path.join("tmp", `mcp-http-auth-${testId}.sqlite.db`);
    const adminEmail = "mcp-http-admin@example.com";
    const rawToken = `blog-test-pat-${testId}`;
    const now = Date.now();
    const userId = `mcp-http-admin-${testId}`;

    process.env.DB_PATH = dbPath;
    process.env.ADMIN_EMAIL = adminEmail;
    process.env.BLOG_PAT_ENV = "test";
    fs.rmSync(dbPath, { force: true });
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const sqlite = new Database(dbPath);
    const client = drizzle(sqlite);
    migrate(client, { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();
    await initializeDB(true);

    if (!db) {
      throw new Error("Database has not been initialised");
    }

    await db.insert(users).values({
      id: userId,
      email: adminEmail,
      name: "MCP HTTP Admin",
      createdAt: now,
    });
    await db.insert(personalAccessTokens).values({
      id: `mcp-http-token-${testId}`,
      userId,
      label: "MCP HTTP auth test",
      tokenHash: hashPersonalAccessToken(rawToken),
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      lastUsedAt: null,
    });

    const initResponse = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "Mcp-Protocol-Version": "2025-03-26",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "init-auth",
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "bun-test", version: "1.0.0" },
          },
        }),
      })
    );
    const sessionId = initResponse.headers.get("Mcp-Session-Id");
    expect(sessionId).toBeTruthy();
    expect(getMcpSessionAuthForTests(sessionId || "")).toEqual({
      isAdmin: true,
      userEmail: adminEmail,
    });

    const deleteResponse = await handleMcpHttpRequest(
      new Request("http://localhost/mcp", {
        method: "DELETE",
        headers: {
          "Mcp-Session-Id": sessionId || "",
          "Mcp-Protocol-Version": "2025-03-26",
        },
      })
    );
    expect(deleteResponse.status).toBe(200);
    fs.rmSync(dbPath, { force: true });
  });
});
