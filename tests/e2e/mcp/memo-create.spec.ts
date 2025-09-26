import { expect, test } from "@playwright/test";

const INTEGRATED_PORT = Number(process.env.MCP_PORT || 25110);
const WEBDAV_PORT = Number(process.env.MCP_WEBDAV_PORT || 25111);
const BASE_URL = `http://localhost:${INTEGRATED_PORT}`;
const MCP_URL = `${BASE_URL}/mcp`;
const HEALTH_URL = `${BASE_URL}/api/health`;
const TEST_DB = process.env.DB_PATH || "./test-data/sqlite.db";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const PROTOCOL_VERSION = "2025-03-26";
const TEST_PAT = process.env.MCP_TEST_PAT_TOKEN || "blog-test-pat-mcp-admin-seed-token-e2e";

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
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  return (await res.json()) as any;
}

let dufsProc: any;
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

    // Reset DB and seed PAT
    await new Promise<void>((resolve, reject) => {
      const p = spawn("bun", ["run", "test-db:reset"], {
        env: { ...process.env, DB_PATH: TEST_DB, MCP_TEST_PAT_TOKEN: TEST_PAT },
        stdio: "inherit",
      });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`reset exit ${code}`))));
    });

    // Start integrated server
    serverProc = spawn("bun", ["run", "src/scripts/start-integrated-server.ts"], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        ADMIN_EMAIL,
        DB_PATH: TEST_DB,
        PORT: String(INTEGRATED_PORT),
        WEBDAV_URL: `http://localhost:${WEBDAV_PORT}`,
      },
      stdio: "ignore",
    });

    await waitFor(HEALTH_URL, 60000);
  },
  { timeout: 90000 }
);

test.afterAll(async () => {
  try {
    serverProc?.kill("SIGTERM");
  } catch (error) {
    // Process might have already exited; ignore cleanup errors.
    console.debug("serverProc cleanup skipped", error);
  }
  try {
    dufsProc?.kill("SIGTERM");
  } catch (error) {
    console.debug("dufsProc cleanup skipped", error);
  }
});

test("create memo via MCP (PAT) then open page", async ({ page }) => {
  const title = `sdk-e2e-${Date.now()}`;
  const created = await rpc(
    {
      jsonrpc: "2.0",
      id: "c1",
      method: "tools/call",
      params: {
        name: "memos.create",
        arguments: { content: title, title, isPublic: true, tags: [] },
      },
    },
    TEST_PAT
  );
  expect(created.error).toBeFalsy();

  const listed = await rpc({
    jsonrpc: "2.0",
    id: "l1",
    method: "tools/call",
    params: { name: "memos.list", arguments: { limit: 10, publicOnly: false, search: title } },
  });
  const items = JSON.parse(listed.result?.content?.[0]?.text || "{}").items || [];
  const memo = items.find((x: any) => x.title?.includes(title));
  expect(memo?.slug).toBeTruthy();

  await page.goto(`${BASE_URL}/memos/${memo.slug}`);
  await expect(page.getByText(title)).toBeVisible();
});
