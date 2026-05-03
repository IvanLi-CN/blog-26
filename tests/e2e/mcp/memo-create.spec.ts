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

    // Reset DB and seed PAT
    await new Promise<void>((resolve, reject) => {
      const p = spawn("bun", ["run", "test-db:reset"], {
        env: { ...process.env, DB_PATH: TEST_DB, MCP_TEST_PAT_TOKEN: TEST_PAT },
        stdio: "inherit",
      });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`reset exit ${code}`))));
    });

    siteProc = spawn("bun", ["run", "site:dev"], {
      env: {
        ...process.env,
        DB_PATH: TEST_DB,
        LOCAL_CONTENT_BASE_PATH: "./test-data/local",
        WEBDAV_URL: `http://localhost:${WEBDAV_PORT}`,
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
        PORT: String(INTEGRATED_PORT),
        SITE_PORT: String(SITE_PORT),
        WEBDAV_URL: `http://localhost:${WEBDAV_PORT}`,
        PUBLIC_SITE_URL: BASE_URL,
      },
      stdio: "ignore",
    });

    await waitFor(BASE_URL, 60000);
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

test("create memo via MCP (PAT) then open page", async ({ page }) => {
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

  const listed = await rpc({
    jsonrpc: "2.0",
    id: "l1",
    method: "tools/call",
    params: { name: "memos_list", arguments: { limit: 10, publicOnly: false, search: title } },
  });
  const items = JSON.parse(listed.result?.content?.[0]?.text || "{}").items || [];
  const memo = items.find((x: any) => x.title?.includes(title));
  expect(memo?.slug).toBeTruthy();

  await page.goto(`${BASE_URL}/memos/${memo.slug}`);
  await expect(page.getByText(title)).toBeVisible();
});
