import { expect, test } from "@playwright/test";

const INTEGRATED_PORT = Number(process.env.MCP_PORT || 25110);
const WEBDAV_PORT = Number(process.env.MCP_WEBDAV_PORT || 25111);
const BASE_URL = `http://localhost:${INTEGRATED_PORT}`;
const MCP_URL = `${BASE_URL}/mcp`;
const TEST_DB = process.env.DB_PATH || "./test-data/sqlite.db";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const SITE_PORT = Number(process.env.MCP_SITE_PORT || INTEGRATED_PORT + 3);
const PROTOCOL_VERSION = "2025-03-26";
const TEST_PAT = process.env.MCP_TEST_PAT_TOKEN || "blog-test-pat-mcp-admin-seed-token-e2e";
let mcpSessionId: string | undefined;

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url: string, timeoutMs = 30000) {
  const start = Date.now();
  let lastErr: any;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (e) {
      lastErr = e;
    }
    await wait(300);
  }
  throw new Error(`Timeout waiting for ${url}: ${String(lastErr || "unknown error")}`);
}

async function rpc(body: any, auth?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "Mcp-Protocol-Version": PROTOCOL_VERSION,
  };
  if (mcpSessionId) headers["Mcp-Session-Id"] = mcpSessionId;
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const responseSessionId =
    res.headers.get("mcp-session-id") || res.headers.get("Mcp-Session-Id") || undefined;
  if (responseSessionId) {
    mcpSessionId = responseSessionId;
  }

  const raw = await res.text();
  if ((res.headers.get("content-type") || "").includes("text/event-stream")) {
    const payload = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, ""))
      .filter(Boolean)
      .at(-1);
    if (!payload) throw new Error(`MCP SSE response missing data payload: ${raw}`);
    return JSON.parse(payload) as any;
  }
  return JSON.parse(raw) as any;
}

async function initializeMcpSession() {
  mcpSessionId = undefined;
  const initialized = await rpc({
    jsonrpc: "2.0",
    id: "init",
    method: "initialize",
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "playwright-mcp-e2e", version: "1.0.0" },
    },
  });
  expect(initialized.error).toBeFalsy();
  expect(mcpSessionId).toBeTruthy();
}

async function seedAdminPat(spawn: typeof import("node:child_process").spawn) {
  const script = `
    import { eq } from "drizzle-orm";
    import { db, initializeDB } from "@/lib/db";
    import { hashPersonalAccessToken } from "@/lib/personal-access-token";
    import { personalAccessTokens, users } from "@/lib/schema";
    await initializeDB(true);
    const now = Date.now();
    const userId = "mcp-e2e-admin-user";
    await db.delete(personalAccessTokens);
    await db.delete(users).where(eq(users.email, process.env.ADMIN_EMAIL));
    await db.insert(users).values({
      id: userId,
      email: process.env.ADMIN_EMAIL,
      name: "MCP E2E Admin",
      createdAt: now,
    });
    await db.insert(personalAccessTokens).values({
      id: "mcp-e2e-admin-token",
      userId,
      label: "MCP E2E PAT",
      tokenHash: hashPersonalAccessToken(process.env.MCP_TEST_PAT_TOKEN),
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      lastUsedAt: null,
    });
  `;
  await new Promise<void>((resolve, reject) => {
    const p = spawn("bun", ["-e", script], {
      env: {
        ...process.env,
        DB_PATH: TEST_DB,
        ADMIN_EMAIL,
        MCP_TEST_PAT_TOKEN: TEST_PAT,
      },
      stdio: "inherit",
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`PAT seed exit ${code}`))));
  });
}

async function findMemoByTitle(title: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const listed = await rpc({
      jsonrpc: "2.0",
      id: `list-${Date.now()}`,
      method: "tools/call",
      params: { name: "memos_list", arguments: { limit: 10, publicOnly: false, search: title } },
    });
    const items = JSON.parse(listed.result?.content?.[0]?.text || "{}").items || [];
    const memo = items.find((x: any) => x.title?.includes(title));
    if (memo?.slug) return memo;
    await wait(300);
  }
  return undefined;
}

let dufsProc: any;
let siteProc: any;
let serverProc: any;

test.beforeAll(
  async () => {
    const { spawn } = await import("node:child_process");

    // Start WebDAV
    dufsProc = spawn(
      "dufs",
      ["test-data/webdav", "--port", String(WEBDAV_PORT), "--allow-all", "--enable-cors"],
      { stdio: "ignore" }
    );

    // Reset DB/content fixtures and seed PAT
    await new Promise<void>((resolve, reject) => {
      const p = spawn("bun", ["run", "test-env:reset-fs-only"], {
        env: {
          ...process.env,
          DB_PATH: TEST_DB,
          LOCAL_CONTENT_BASE_PATH: "./test-data/local",
          CONTENT_SOURCES: "local",
          MCP_TEST_PAT_TOKEN: TEST_PAT,
        },
        stdio: "inherit",
      });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`reset exit ${code}`))));
    });
    await seedAdminPat(spawn);

    siteProc = spawn("bun", ["run", "site:dev"], {
      env: {
        ...process.env,
        DB_PATH: TEST_DB,
        LOCAL_CONTENT_BASE_PATH: "./test-data/local",
        CONTENT_SOURCES: "local",
        PUBLIC_SITE_URL: BASE_URL,
        SITE_PORT: String(SITE_PORT),
      },
      stdio: "ignore",
    });

    serverProc = spawn("bun", ["run", "gateway:dev"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        ADMIN_EMAIL,
        DB_PATH: TEST_DB,
        LOCAL_CONTENT_BASE_PATH: "./test-data/local",
        CONTENT_SOURCES: "local",
        PORT: String(INTEGRATED_PORT),
        SITE_PORT: String(SITE_PORT),
        PUBLIC_SITE_URL: BASE_URL,
      },
      stdio: "ignore",
    });

    await waitFor(BASE_URL, 60000);
    await initializeMcpSession();
  },
  { timeout: 90000 }
);

test.afterAll(async () => {
  if (mcpSessionId) {
    try {
      await fetch(MCP_URL, {
        method: "DELETE",
        headers: {
          "Mcp-Session-Id": mcpSessionId,
          "Mcp-Protocol-Version": PROTOCOL_VERSION,
        },
      });
    } catch (error) {
      console.debug("MCP session cleanup skipped", error);
    }
  }
  try {
    serverProc?.kill("SIGTERM");
  } catch (error) {
    // Process might have already exited; ignore cleanup errors.
    console.debug("serverProc cleanup skipped", error);
  }
  try {
    siteProc?.kill("SIGTERM");
  } catch (error) {
    console.debug("siteProc cleanup skipped", error);
  }
  try {
    dufsProc?.kill("SIGTERM");
  } catch (error) {
    console.debug("dufsProc cleanup skipped", error);
  }
});

test("create memo via MCP (PAT) then list it", async () => {
  const title = `sdk-e2e-${Date.now()}`;
  const created = await rpc(
    {
      jsonrpc: "2.0",
      id: "c1",
      method: "tools/call",
      params: {
        name: "memos_create",
        arguments: { content: title, title, isPublic: true, tags: [] },
      },
    },
    TEST_PAT
  );
  expect(created.error).toBeFalsy();
  expect(created.result?.isError).toBeFalsy();

  const memo = await findMemoByTitle(title);
  expect(memo?.slug).toBeTruthy();
});
