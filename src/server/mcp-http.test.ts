import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  createMcpJsonRpcErrorResponse,
  getMcpSessionCountForTests,
  handleMcpHttpRequest,
  isMcpInitializeRequest,
} from "./mcp-http";
import { resolveMcpSessionPersistenceKey } from "./mcp-session";

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
});
