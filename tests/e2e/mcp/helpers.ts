import { spawn } from "node:child_process";
import {
  E2E_ADMIN_EMAIL,
  E2E_MCP_PROTOCOL_VERSION,
  E2E_MCP_TEST_PAT_TOKEN,
  readE2EBaseUrl,
} from "../runtime";

let mcpSessionId: string | undefined;

function readMcpUrl() {
  return new URL("/mcp", readE2EBaseUrl()).toString();
}

export function clearMcpSession() {
  mcpSessionId = undefined;
}

export function readMcpSessionId() {
  return mcpSessionId;
}

export async function initializeMcpSession() {
  clearMcpSession();
  const initialized = await callMcpRpc({
    jsonrpc: "2.0",
    id: "init",
    method: "initialize",
    params: {
      protocolVersion: E2E_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "playwright-mcp-e2e", version: "1.0.0" },
    },
  });
  return initialized;
}

export async function callMcpRpc<T = any>(body: unknown, authToken?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "Mcp-Protocol-Version": E2E_MCP_PROTOCOL_VERSION,
  };
  if (mcpSessionId) {
    headers["Mcp-Session-Id"] = mcpSessionId;
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(readMcpUrl(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseSessionId =
    response.headers.get("mcp-session-id") || response.headers.get("Mcp-Session-Id") || undefined;
  if (responseSessionId) {
    mcpSessionId = responseSessionId;
  }

  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const payload = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, ""))
      .filter(Boolean)
      .at(-1);
    if (!payload) {
      throw new Error(`MCP SSE response missing data payload: ${raw}`);
    }
    return JSON.parse(payload) as T;
  }

  if (!raw) {
    throw new Error(`MCP response body empty (status ${response.status})`);
  }

  return JSON.parse(raw) as T;
}

export async function closeMcpSessionIfNeeded() {
  if (!mcpSessionId) {
    return;
  }

  try {
    await fetch(readMcpUrl(), {
      method: "DELETE",
      headers: {
        "Mcp-Session-Id": mcpSessionId,
        "Mcp-Protocol-Version": E2E_MCP_PROTOCOL_VERSION,
      },
    });
  } catch (error) {
    console.debug("MCP session cleanup skipped", error);
  } finally {
    clearMcpSession();
  }
}

export async function seedE2EAdminPat() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["./scripts/seed-e2e-admin-pat.ts"], {
      env: {
        ...process.env,
        ADMIN_EMAIL: E2E_ADMIN_EMAIL,
        MCP_TEST_PAT_TOKEN: E2E_MCP_TEST_PAT_TOKEN,
      },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`seed-e2e-admin-pat exited with code ${code ?? "unknown"}`));
    });
  });
}
