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

async function getContentRowByTitle(title: string) {
  return db
    .select()
    .from(posts)
    .where(eq(posts.title, title))
    .limit(1)
    .then((rows) => rows[0]);
}

async function expectDeletedContent(title: string, filePath: string) {
  const row = await getContentRowByTitle(title);
  expect(row).toBeUndefined();
  await expect(fs.access(path.join(LOCAL_CONTENT, filePath))).rejects.toThrow();
}

async function readCreatedMarkdown(title: string, type: "memo" | "post") {
  await expectCreatedViaMarker(title, type);
  const row = await getContentRowByTitle(title);
  expect(row).toBeDefined();
  expect(row.filePath).toBeTruthy();
  if (!row?.filePath) throw new Error(`Created ${type} row missing filePath`);
  return fs.readFile(path.join(LOCAL_CONTENT, row.filePath), "utf-8");
}

async function seedLegacyMarkdownContent(input: {
  type: "memo" | "post";
  slug: string;
  title: string;
  body: string;
  tags?: string[];
  category?: string | null;
}) {
  const filePath = input.type === "memo" ? `Memos/${input.slug}.md` : `blog/${input.slug}.md`;
  await fs.mkdir(path.dirname(path.join(LOCAL_CONTENT, filePath)), { recursive: true });
  await fs.writeFile(path.join(LOCAL_CONTENT, filePath), input.body, "utf-8");

  const now = Date.now();
  await db.insert(posts).values({
    id: filePath,
    slug: input.slug,
    type: input.type,
    title: input.title,
    excerpt: input.body.slice(0, 80),
    body: input.body,
    publishDate: now,
    updateDate: null,
    draft: false,
    public: true,
    category: input.category ?? null,
    tags: JSON.stringify(input.tags ?? []),
    author: null,
    image: null,
    metadata: null,
    dataSource: "local",
    createdVia: null,
    contentHash: `legacy-${now}-${input.slug}`,
    lastModified: now,
    source: "local",
    filePath,
  });

  return { filePath };
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

    it("should exclude draft memos from public memo search", async () => {
      const marker = `mcp-public-memo-filter-${Date.now()}`;
      const now = Date.now();
      await db.insert(posts).values([
        {
          id: `${marker}-published`,
          slug: `${marker}-published`,
          type: "memo",
          title: `${marker} published`,
          excerpt: null,
          body: marker,
          publishDate: now + 1,
          updateDate: now,
          draft: false,
          public: true,
          category: null,
          tags: "[]",
          author: ADMIN_EMAIL,
          image: null,
          metadata: null,
          dataSource: "local",
          createdVia: null,
          contentHash: `${marker}-published-hash`,
          lastModified: now,
          source: "local",
          filePath: `${marker}-published.md`,
        },
        {
          id: `${marker}-draft`,
          slug: `${marker}-draft`,
          type: "memo",
          title: `${marker} draft`,
          excerpt: null,
          body: marker,
          publishDate: now,
          updateDate: now,
          draft: true,
          public: true,
          category: null,
          tags: "[]",
          author: ADMIN_EMAIL,
          image: null,
          metadata: null,
          dataSource: "local",
          createdVia: null,
          contentHash: `${marker}-draft-hash`,
          lastModified: now,
          source: "local",
          filePath: `${marker}-draft.md`,
        },
      ]);

      const listed = await rpc({
        jsonrpc: "2.0",
        id: "l-public-memo-filter",
        method: "tools/call",
        params: {
          name: "memos_list",
          arguments: { limit: 10, publicOnly: true, search: marker },
        },
      });
      const items = JSON.parse(listed.result?.content?.[0]?.text || "{}").items || [];
      expect(items.some((item: any) => item.slug === `${marker}-published`)).toBe(true);
      expect(items.some((item: any) => item.slug === `${marker}-draft`)).toBe(false);
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

    it("should format MCP-created and updated markdown bodies", async () => {
      const stamp = Date.now();
      const postTitle = `sdk-format-post-${stamp}`;
      const memoTitle = `sdk-format-memo-${stamp}`;

      const postCreated = await rpc(
        {
          jsonrpc: "2.0",
          id: "fp1",
          method: "tools/call",
          params: {
            name: "posts_create",
            arguments: {
              content: "# Title\nParagraph\n- one\n- two",
              title: postTitle,
              isPublic: true,
              tags: ["mcp-format"],
            },
          },
        },
        TEST_PAT
      );
      expect(postCreated.error).toBeUndefined();
      const createdPostMarkdown = await readCreatedMarkdown(postTitle, "post");
      expect(createdPostMarkdown).toContain("# Title\n\nParagraph\n\n- one\n- two\n");

      const postRow = await getContentRowByTitle(postTitle);
      expect(postRow).toBeDefined();
      if (!postRow) throw new Error("Created post row missing");
      const postUpdated = await rpc(
        {
          jsonrpc: "2.0",
          id: "fp2",
          method: "tools/call",
          params: {
            name: "posts_update_content",
            arguments: {
              slug: postRow.slug,
              content: "## Updated\n|A|B|\n|-|-|\n|1|2|",
              title: postTitle,
              isPublic: true,
              tags: ["mcp-format", "updated"],
            },
          },
        },
        TEST_PAT
      );
      expect(postUpdated.error).toBeUndefined();
      const postUpdatePayload = JSON.parse(postUpdated.result?.content?.[0]?.text || "{}");
      expect(postUpdatePayload.ok).toBe(true);
      expect(postUpdatePayload.frontmatterAdded).toBe(false);
      const updatedPostMarkdown = await readCreatedMarkdown(postTitle, "post");
      expect(updatedPostMarkdown).toContain("## Updated\n\n| A | B |\n| - | - |\n| 1 | 2 |\n");

      const memoCreated = await rpc(
        {
          jsonrpc: "2.0",
          id: "fm1",
          method: "tools/call",
          params: {
            name: "memos_create",
            arguments: {
              content: "# Memo\nText\n- a\n- b",
              title: memoTitle,
              isPublic: true,
              tags: ["mcp-format"],
            },
          },
        },
        TEST_PAT
      );
      expect(memoCreated.error).toBeUndefined();
      const createdMemoMarkdown = await readCreatedMarkdown(memoTitle, "memo");
      expect(createdMemoMarkdown).toContain("# Memo\n\nText\n\n- a\n- b\n");

      const memoRow = await getContentRowByTitle(memoTitle);
      expect(memoRow).toBeDefined();
      if (!memoRow) throw new Error("Created memo row missing");
      const memoUpdated = await rpc(
        {
          jsonrpc: "2.0",
          id: "fm2",
          method: "tools/call",
          params: {
            name: "memos_update",
            arguments: {
              slug: memoRow.slug,
              content: "## Memo Updated\n- [x] done\n```ts\nconst value = 1\n```",
              title: memoTitle,
              isPublic: true,
              tags: ["mcp-format", "updated"],
            },
          },
        },
        TEST_PAT
      );
      expect(memoUpdated.error).toBeUndefined();
      const memoUpdatePayload = JSON.parse(memoUpdated.result?.content?.[0]?.text || "{}");
      expect(memoUpdatePayload.ok).toBe(true);
      expect(memoUpdatePayload.frontmatterAdded).toBe(false);
      const updatedMemoMarkdown = await readCreatedMarkdown(memoTitle, "memo");
      expect(matter(updatedMemoMarkdown).data.createdVia).toBe("mcp");
      expect(matter(updatedMemoMarkdown).data.updatedVia).toBe("mcp");
      expect(updatedMemoMarkdown).toContain(
        "## Memo Updated\n\n- [x] done\n\n```ts\nconst value = 1\n```\n"
      );
    });

    it("should add minimal MCP frontmatter guidance when updating legacy files", async () => {
      const stamp = Date.now();
      const postSlug = `legacy-no-frontmatter-post-${stamp}`;
      const postTitle = `Legacy No Frontmatter Post ${stamp}`;
      const legacyPostBody = "# Legacy Post\nText\n- a\n- b";
      const { filePath: postFilePath } = await seedLegacyMarkdownContent({
        type: "post",
        slug: postSlug,
        title: postTitle,
        body: legacyPostBody,
        tags: ["legacy"],
      });

      const listedBefore = await rpc({
        jsonrpc: "2.0",
        id: "lfm-list-before",
        method: "tools/call",
        params: {
          name: "posts_list",
          arguments: { page: 1, limit: 10, search: postTitle, published: true },
        },
      });
      const beforeItems = JSON.parse(listedBefore.result?.content?.[0]?.text || "{}").items || [];
      const beforeItem = beforeItems.find((item: any) => item.slug === postSlug);
      expect(beforeItem?.hasFrontmatter).toBe(false);
      expect(beforeItem?.missingRecommendedMetadata).toContain("publishDate");

      const postUpdated = await rpc(
        {
          jsonrpc: "2.0",
          id: "lfm-update-post",
          method: "tools/call",
          params: {
            name: "posts_update_content",
            arguments: {
              slug: postSlug,
              content: "## Updated Legacy\nParagraph\n- one\n- two",
            },
          },
        },
        TEST_PAT
      );
      expect(postUpdated.error).toBeUndefined();
      const updatePayload = JSON.parse(postUpdated.result?.content?.[0]?.text || "{}");
      expect(updatePayload.ok).toBe(true);
      expect(updatePayload.frontmatterAdded).toBe(true);
      expect(updatePayload.warnings.join("\n")).toContain("no YAML frontmatter");
      expect(updatePayload.recommendedMetadata.publishDate).toBeTruthy();

      const updatedRaw = await fs.readFile(path.join(LOCAL_CONTENT, postFilePath), "utf-8");
      const updatedParsed = matter(updatedRaw);
      expect(updatedRaw.startsWith("---\n")).toBe(true);
      expect(updatedParsed.data.title).toBe(postTitle);
      expect(updatedParsed.data.public).toBe(true);
      expect(updatedParsed.data.tags).toEqual(["legacy"]);
      expect(updatedParsed.data.updatedVia).toBe("mcp");
      expect(updatedParsed.data.createdVia).toBeUndefined();
      expect(updatedParsed.content.trimStart()).toBe(
        "## Updated Legacy\n\nParagraph\n\n- one\n- two\n"
      );

      const metadataOnlySlug = `legacy-metadata-only-${stamp}`;
      const metadataOnlyTitle = `Legacy Metadata Only ${stamp}`;
      const metadataOnlyBody = "Paragraph\n- cramped\n- list";
      const { filePath: metadataOnlyFilePath } = await seedLegacyMarkdownContent({
        type: "post",
        slug: metadataOnlySlug,
        title: metadataOnlyTitle,
        body: metadataOnlyBody,
      });
      const visibilityUpdated = await rpc(
        {
          jsonrpc: "2.0",
          id: "lfm-visibility",
          method: "tools/call",
          params: {
            name: "posts_update_visibility",
            arguments: { slug: metadataOnlySlug, isPublic: false },
          },
        },
        TEST_PAT
      );
      expect(visibilityUpdated.error).toBeUndefined();
      const visibilityPayload = JSON.parse(visibilityUpdated.result?.content?.[0]?.text || "{}");
      expect(visibilityPayload.frontmatterAdded).toBe(true);

      const metadataOnlyRaw = await fs.readFile(
        path.join(LOCAL_CONTENT, metadataOnlyFilePath),
        "utf-8"
      );
      const metadataOnlyParsed = matter(metadataOnlyRaw);
      expect(metadataOnlyParsed.data.updatedVia).toBe("mcp");
      expect(metadataOnlyParsed.data.public).toBe(false);
      expect(metadataOnlyParsed.content.trimStart()).toBe(metadataOnlyBody);
    });

    it("should delete local memo and post files plus indexed rows", async () => {
      const stamp = Date.now();
      const memoTitle = `sdk-delete-memo-${stamp}`;
      const postTitle = `sdk-delete-post-${stamp}`;

      const memoCreated = await rpc(
        {
          jsonrpc: "2.0",
          id: "dm1",
          method: "tools/call",
          params: {
            name: "memos_create",
            arguments: { content: "delete memo smoke", title: memoTitle, isPublic: true, tags: [] },
          },
        },
        TEST_PAT
      );
      expect(memoCreated.error).toBeUndefined();
      await expectCreatedViaMarker(memoTitle, "memo");
      const memoRow = await getContentRowByTitle(memoTitle);
      expect(memoRow).toBeDefined();
      expect(memoRow.filePath).toBeTruthy();
      if (!memoRow?.filePath) throw new Error("Created memo row missing filePath");

      const postCreated = await rpc(
        {
          jsonrpc: "2.0",
          id: "dp1",
          method: "tools/call",
          params: {
            name: "posts_create",
            arguments: { content: "delete post smoke", title: postTitle, isPublic: true, tags: [] },
          },
        },
        TEST_PAT
      );
      expect(postCreated.error).toBeUndefined();
      await expectCreatedViaMarker(postTitle, "post");
      const postRow = await getContentRowByTitle(postTitle);
      expect(postRow).toBeDefined();
      expect(postRow.filePath).toBeTruthy();
      if (!postRow?.filePath) throw new Error("Created post row missing filePath");

      const memoDeleted = await rpc(
        {
          jsonrpc: "2.0",
          id: "dm2",
          method: "tools/call",
          params: {
            name: "memos_delete",
            arguments: { slug: memoRow.slug },
          },
        },
        TEST_PAT
      );
      expect(memoDeleted.error).toBeUndefined();
      expect(memoDeleted.result?.isError).toBeFalsy();

      const postDeleted = await rpc(
        {
          jsonrpc: "2.0",
          id: "dp2",
          method: "tools/call",
          params: {
            name: "posts_delete",
            arguments: { slug: postRow.slug },
          },
        },
        TEST_PAT
      );
      expect(postDeleted.error).toBeUndefined();
      expect(postDeleted.result?.isError).toBeFalsy();

      await expectDeletedContent(memoTitle, memoRow.filePath);
      await expectDeletedContent(postTitle, postRow.filePath);
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
