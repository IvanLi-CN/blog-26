import { afterAll, beforeAll, describe, expect, it, test } from "bun:test";
import { spawn } from "node:child_process";

const ENABLE = process.env.RUN_MCP_TESTS === "1";
const INTEGRATED_PORT = Number(process.env.MCP_PORT || 25110);
const WEBDAV_PORT = Number(process.env.MCP_WEBDAV_PORT || 25111);
const BASE_URL = `http://localhost:${INTEGRATED_PORT}`;
const MCP_URL = `${BASE_URL}/mcp`;
const HEALTH_URL = `${BASE_URL}/api/health`;
const TEST_DB = process.env.DB_PATH || "./test-data/sqlite.db";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const PROTOCOL_VERSION = "2025-03-26";

const TEST_PAT = process.env.MCP_TEST_PAT_TOKEN || "blog-test-pat-mcp-admin-seed-token-smoke";

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(url: string, timeoutMs = 30000) {
  const start = Date.now();
  let lastErr: any;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return true;
    } catch (e) {
      lastErr = e;
    }
    await wait(300);
  }
  throw new Error(`Timeout waiting for ${url}: ${String(lastErr || "unknown error")}`);
}

let dufsProc: any;
let serverProc: any;

async function rpc<T = any>(body: any, auth?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "Mcp-Protocol-Version": PROTOCOL_VERSION,
  };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const json = (await res.json()) as any;
  return json;
}

if (!ENABLE) {
  test("mcp sdk smoke skipped", () => {
    expect(true).toBe(true);
  });
} else
  describe("MCP SDK smoke (PAT only)", () => {
    beforeAll(async () => {
      // Start WebDAV (dufs)
      dufsProc = spawn(
        "dufs",
        ["test-data/webdav", "--port", String(WEBDAV_PORT), "--allow-all", "--enable-cors"],
        {
          stdio: "ignore",
        }
      );

      // Reset DB and seed with known PAT
      await new Promise<void>((resolve, reject) => {
        const p = spawn("bun", ["run", "test-db:reset"], {
          env: {
            ...process.env,
            DB_PATH: TEST_DB,
            MCP_TEST_PAT_TOKEN: TEST_PAT,
          },
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
      // initialize
      const init = await rpc({
        jsonrpc: "2.0",
        id: "init",
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "bun-test", version: "1.0.0" },
        },
      });
      expect(init).toBeDefined();
    }, 90000);

    afterAll(async () => {
      try {
        serverProc?.kill("SIGTERM");
      } catch (error) {
        console.debug("serverProc cleanup skipped", error);
      }
      try {
        dufsProc?.kill("SIGTERM");
      } catch (error) {
        console.debug("dufsProc cleanup skipped", error);
      }
    });

    it("should deny write without PAT", async () => {
      const call = await rpc({
        jsonrpc: "2.0",
        id: "w1",
        method: "tools/call",
        params: {
          name: "memos.create",
          arguments: {
            content: "deny-without-pat",
            title: "deny-without-pat",
            isPublic: true,
            tags: [],
          },
        },
      });
      expect(call.error || call.result?.error).toBeDefined();
    });

    it("should create memo with PAT", async () => {
      const title = `sdk-smoke-${Date.now()}`;
      const created = await rpc(
        {
          jsonrpc: "2.0",
          id: "w2",
          method: "tools/call",
          params: {
            name: "memos.create",
            arguments: { content: "hello from sdk smoke", title, isPublic: true, tags: [] },
          },
        },
        TEST_PAT
      );
      expect(created.error).toBeUndefined();

      const listed = await rpc({
        jsonrpc: "2.0",
        id: "l1",
        method: "tools/call",
        params: {
          name: "memos.list",
          arguments: { limit: 10, publicOnly: false, search: title },
        },
      });
      const items = JSON.parse(listed.result?.content?.[0]?.text || "{}").items || [];
      const has = items.some((x: any) => x.title?.includes(title));
      expect(has).toBe(true);
    });
  });
