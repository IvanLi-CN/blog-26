import { afterAll, beforeAll, describe, expect, it, test } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { eq } from "drizzle-orm";
import matter from "gray-matter";
import { db, initializeDB } from "@/lib/db";
import { hashPersonalAccessToken } from "@/lib/personal-access-token";
import { personalAccessTokens, posts, users } from "@/lib/schema";

const ENABLE = process.env.RUN_MCP_TESTS === "1";
const INTEGRATED_PORT = Number(process.env.MCP_PORT || 25110);
const BASE_URL = `http://localhost:${INTEGRATED_PORT}`;
const MCP_URL = `${BASE_URL}/mcp`;
const HEALTH_URL = `${BASE_URL}/api/health`;
const TEST_DB = path.resolve(process.cwd(), process.env.DB_PATH || "./test-data/sqlite.db");
const LOCAL_CONTENT = path.resolve(
  process.cwd(),
  process.env.LOCAL_CONTENT_BASE_PATH || "./test-data/local"
);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const PROTOCOL_VERSION = "2025-03-26";
const TEST_PAT = process.env.MCP_TEST_PAT_TOKEN || "blog-test-pat-mcp-admin-seed-token-smoke";
let mcpSessionId: string | undefined;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url: string, timeoutMs = 30000) {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return true;
    } catch (error) {
      lastErr = error;
    }
    await wait(300);
  }
  throw new Error(`Timeout waiting for ${url}: ${String(lastErr || "unknown error")}`);
}

async function rpc<T = any>(body: any, auth?: string): Promise<T> {
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
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  if (contentType.includes("text/event-stream")) {
    const eventPayloads = raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s*/, ""))
      .filter(Boolean);
    const latestPayload = eventPayloads.at(-1);
    if (!latestPayload) {
      throw new Error(`MCP SSE response missing data payload: ${raw}`);
    }
    return JSON.parse(latestPayload) as T;
  }

  if (!raw) {
    throw new Error(`MCP response body empty (status ${res.status})`);
  }

  return JSON.parse(raw) as T;
}

async function runStep(command: string, args: string[], env: Record<string, string>) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function seedAdminPat() {
  process.env.DB_PATH = TEST_DB;
  process.env.BLOG_PAT_ENV = "test";
  await initializeDB(true);

  if (!db) {
    throw new Error("Database has not been initialised");
  }

  const now = Date.now();
  const userId = "mcp-admin-user";

  await db.delete(personalAccessTokens);
  await db.delete(users).where(eq(users.email, ADMIN_EMAIL));
  await db.insert(users).values({
    id: userId,
    email: ADMIN_EMAIL,
    name: "MCP Admin",
    createdAt: now,
  });
  await db.insert(personalAccessTokens).values({
    id: "mcp-admin-token",
    userId,
    label: "MCP smoke PAT",
    tokenHash: hashPersonalAccessToken(TEST_PAT),
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    lastUsedAt: null,
  });
}

let serverProc: Bun.Subprocess | ReturnType<typeof spawn> | undefined;

async function createOfficialMcpClient(auth?: string) {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: auth
      ? {
          headers: {
            Authorization: `Bearer ${auth}`,
          },
        }
      : undefined,
  });
  const client = new Client({
    name: "blog-official-sdk-smoke",
    version: "1.0.0",
  });

  await client.connect(transport);
  expect(transport.sessionId).toBeTruthy();

  return { client, transport };
}

async function closeOfficialMcpClient(client: Client, transport: StreamableHTTPClientTransport) {
  try {
    await transport.terminateSession();
  } catch (error) {
    console.debug("MCP official SDK session termination skipped", error);
  }

  try {
    await client.close();
  } catch (error) {
    console.debug("MCP official SDK client close skipped", error);
  }
}

async function expectCreatedViaMarker(title: string, type: "memo" | "post") {
  const row = await db
    .select()
    .from(posts)
    .where(eq(posts.title, title))
    .limit(1)
    .then((rows) => rows[0]);

  expect(row).toBeDefined();
  expect(row.type).toBe(type);
  expect(row.createdVia).toBe("mcp");
  expect(row.source).toBe("local");

  const raw = await fs.readFile(path.join(LOCAL_CONTENT, row.filePath), "utf-8");
  const parsed = matter(raw);
  expect(parsed.data.createdVia).toBe("mcp");
}

if (!ENABLE) {
  test("mcp sdk smoke skipped", () => {
    expect(true).toBe(true);
  });
} else {
  describe("MCP SDK smoke (gateway /mcp)", () => {
    beforeAll(async () => {
      mcpSessionId = undefined;
      const sharedEnv = {
        DB_PATH: TEST_DB,
        LOCAL_CONTENT_BASE_PATH: LOCAL_CONTENT,
        CONTENT_SOURCES: "local",
        PUBLIC_SITE_URL: BASE_URL,
        BLOG_PAT_ENV: "test",
        MCP_TEST_PAT_TOKEN: TEST_PAT,
      };

      await runStep("bun", ["run", "test-env:reset-fs-only"], sharedEnv);
      await seedAdminPat();
      await runStep("bun", ["run", "build"], sharedEnv);

      serverProc = spawn("bun", ["run", "gateway:start"], {
        env: {
          ...process.env,
          ...sharedEnv,
          NODE_ENV: "production",
          ADMIN_EMAIL,
          PORT: String(INTEGRATED_PORT),
          SITE_PORT: String(INTEGRATED_PORT + 3),
          ADMIN_PORT: String(INTEGRATED_PORT + 4),
        },
        stdio: "ignore",
      });

      await waitFor(HEALTH_URL, 60000);
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
    }, 300000);

    afterAll(async () => {
      try {
        serverProc?.kill("SIGTERM");
      } catch (error) {
        console.debug("serverProc cleanup skipped", error);
      }
    });

    it("should deny write without PAT", async () => {
      const call = await rpc({
        jsonrpc: "2.0",
        id: "w1",
        method: "tools/call",
        params: {
          name: "memos_create",
          arguments: {
            content: "deny-without-pat",
            title: "deny-without-pat",
            isPublic: true,
            tags: [],
          },
        },
      });
      expect(call.error).toBeUndefined();
      expect(call.result?.isError).toBe(true);
      expect(call.result?.content?.[0]?.text).toContain("Admin privileges required");
    });

    it("should create memo with PAT and list it through /mcp", async () => {
      const title = `sdk-smoke-${Date.now()}`;
      const created = await rpc(
        {
          jsonrpc: "2.0",
          id: "w2",
          method: "tools/call",
          params: {
            name: "memos_create",
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
          name: "memos_list",
          arguments: { limit: 10, publicOnly: false, search: title },
        },
      });
      const items = JSON.parse(listed.result?.content?.[0]?.text || "{}").items || [];
      const has = items.some((item: any) => item.title?.includes(title));
      expect(has).toBe(true);
      await expectCreatedViaMarker(title, "memo");
    });

    it("should create post with PAT and preserve MCP origin markers", async () => {
      const title = `sdk-post-${Date.now()}`;
      const created = await rpc(
        {
          jsonrpc: "2.0",
          id: "p1",
          method: "tools/call",
          params: {
            name: "posts_create",
            arguments: {
              content: "hello from sdk post smoke",
              title,
              isPublic: true,
              tags: ["mcp-smoke"],
            },
          },
        },
        TEST_PAT
      );
      expect(created.error).toBeUndefined();

      const listed = await rpc({
        jsonrpc: "2.0",
        id: "p2",
        method: "tools/call",
        params: {
          name: "posts_list",
          arguments: { page: 1, limit: 10, search: title, published: true },
        },
      });
      const items = JSON.parse(listed.result?.content?.[0]?.text || "{}").items || [];
      expect(items.some((item: any) => item.title === title && item.createdVia === "mcp")).toBe(
        true
      );
      await expectCreatedViaMarker(title, "post");
    });

    it("should work through the official MCP SDK Streamable HTTP client", async () => {
      const { client, transport } = await createOfficialMcpClient(TEST_PAT);
      try {
        const tools = await client.listTools();
        const toolNames = tools.tools.map((tool) => tool.name);
        expect(toolNames).toContain("memos_create");
        expect(toolNames).toContain("memos_list");
        expect(toolNames).toContain("posts_create");
        expect(toolNames).toContain("posts_list");

        const title = `official-sdk-${Date.now()}`;
        const created = await client.callTool({
          name: "memos_create",
          arguments: {
            content: "hello from official MCP SDK client",
            title,
            isPublic: true,
            tags: ["official-sdk"],
          },
        });
        expect(created.isError).toBeFalsy();

        const listed = await client.callTool({
          name: "memos_list",
          arguments: { limit: 10, publicOnly: false, search: title },
        });
        const text = listed.content.find((item) => item.type === "text")?.text || "{}";
        const items = JSON.parse(text).items || [];
        expect(items.some((item: any) => item.title?.includes(title))).toBe(true);

        await expectCreatedViaMarker(title, "memo");
      } finally {
        await closeOfficialMcpClient(client, transport);
      }
    });

    it("should list tags and fetch posts via MCP", async () => {
      const tagsRes = await rpc({
        jsonrpc: "2.0",
        id: "t1",
        method: "tools/call",
        params: {
          name: "tags.list",
          arguments: {},
        },
      });

      expect(tagsRes.error).toBeUndefined();
      const tagPayload = JSON.parse(tagsRes.result?.content?.[0]?.text || "{}");
      expect(Array.isArray(tagPayload.items)).toBe(true);

      if (tagPayload.items.length > 0) {
        const tagName = tagPayload.items[0]?.name;
        expect(typeof tagName).toBe("string");

        const postsRes = await rpc({
          jsonrpc: "2.0",
          id: "t2",
          method: "tools/call",
          params: {
            name: "tags.listPosts",
            arguments: { tag: tagName },
          },
        });

        expect(postsRes.error).toBeUndefined();
        const postsPayload = JSON.parse(postsRes.result?.content?.[0]?.text || "{}");
        expect(postsPayload.tag).toBe(tagName);
        expect(Array.isArray(postsPayload.items)).toBe(true);
      }

      const bundlesRes = await rpc({
        jsonrpc: "2.0",
        id: "t3",
        method: "tools/call",
        params: {
          name: "tags.listAllPosts",
          arguments: { limitPerTag: 2 },
        },
      });

      expect(bundlesRes.error).toBeUndefined();
      const bundlesPayload = JSON.parse(bundlesRes.result?.content?.[0]?.text || "{}");
      expect(Array.isArray(bundlesPayload.items)).toBe(true);
    });
  });
}
