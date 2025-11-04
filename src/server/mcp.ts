import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { and, desc, eq, like, sql } from "drizzle-orm";
import matter from "gray-matter";
import limax from "limax";
import { z } from "zod";
import { isLocalContentEnabled, LOCAL_PATHS, WEBDAV_PATHS } from "@/config/paths";
import { enhanced as enhancedSearch, semantic as semanticSearch } from "@/lib/ai/search";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "@/lib/content-sources";
import { db, initializeDB } from "@/lib/db";
import { posts as postsTable } from "@/lib/schema";
import { isWebDAVEnabled, WebDAVClient } from "@/lib/webdav";
import { requireAdmin } from "./mcp-auth-context";

let server: McpServer | null = null;
let transport: StreamableHTTPServerTransport | null = null;

function iso(ts: number | string | Date): string {
  return new Date(ts).toISOString();
}

function getLocalBasePathOrThrow(): string {
  const base = LOCAL_PATHS.basePath;
  if (!base || base.length === 0) {
    throw new Error(
      "Local content source is disabled. Set LOCAL_CONTENT_BASE_PATH to enable local operations."
    );
  }
  return base;
}

function buildFrontmatter(input: {
  title?: string;
  public?: boolean;
  tags?: string[];
  category?: string;
  publishDate?: number | string | Date;
  updateDate?: number | string | Date;
  extra?: Record<string, unknown>;
}): string {
  const fm: Record<string, unknown> = {};
  if (input.title) fm.title = input.title;
  if (typeof input.public === "boolean") fm.public = input.public;
  if (input.tags) fm.tags = input.tags;
  if (input.category) fm.category = input.category;
  if (input.publishDate) fm.publishDate = iso(input.publishDate);
  if (input.updateDate) fm.updateDate = iso(input.updateDate);
  if (input.extra) Object.assign(fm, input.extra);
  const yaml = Object.entries(fm)
    .map(([k, v]) =>
      Array.isArray(v)
        ? `${k}:\n${v.map((x) => `  - ${JSON.stringify(x)}`).join("\n")}`
        : `${k}: ${JSON.stringify(v)}`
    )
    .join("\n");
  return `---\n${yaml}\n---\n\n`;
}

async function ensureContentSourcesRegistered() {
  const manager = getContentSourceManager({ maxConcurrentSyncs: 2, syncTimeout: 30000 });
  if (manager.getSources().length > 0) return manager;
  if (isLocalContentEnabled()) {
    const localCfg = LocalContentSource.createDefaultConfig("local", 50, {
      contentPath: getLocalBasePathOrThrow(),
    });
    await manager.registerSource(new LocalContentSource(localCfg));
  }
  if (isWebDAVEnabled()) {
    const wdCfg = WebDAVContentSource.createDefaultConfig("webdav", 100);
    await manager.registerSource(new WebDAVContentSource(wdCfg));
  }
  return manager;
}

async function triggerIncrementalSync() {
  const manager = await ensureContentSourcesRegistered();
  try {
    await manager.syncAll(false);
  } catch (e) {
    console.warn("[MCP] incremental sync failed:", e);
  }
}

async function updateFrontmatterOnDAV(filePath: string, mut: (fm: any) => void, newBody?: string) {
  if (!isWebDAVEnabled()) throw new Error("WebDAV not configured");
  const dav = new WebDAVClient();
  const raw = await dav.getFileContent(filePath);
  const { data, content } = matter(raw);
  mut(data);
  const fmPart = buildFrontmatter({
    title: data.title as string | undefined,
    public: typeof data.public === "boolean" ? data.public : undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
    category: typeof data.category === "string" ? (data.category as string) : undefined,
    publishDate: data.publishDate || data.date,
    updateDate: data.updateDate,
    extra: Object.fromEntries(
      Object.entries(data).filter(
        ([k]) =>
          !["title", "public", "tags", "category", "publishDate", "date", "updateDate"].includes(k)
      )
    ) as Record<string, unknown>,
  });
  await dav.putFileContent(filePath, `${fmPart}${newBody ?? content}`);
}

const listPostsInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(10),
  search: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  published: z.boolean().default(true),
});
const createPostInput = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  isPublic: z.boolean().default(true),
  publishDate: z.union([z.string(), z.number()]).optional(),
});
const updatePostContentInput = z.object({
  slug: z.string(),
  content: z.string().min(1),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  isPublic: z.boolean().optional(),
});
const updatePostTimeInput = z.object({
  slug: z.string(),
  publishDate: z.union([z.string(), z.number(), z.date()]).optional(),
  updateDate: z.union([z.string(), z.number(), z.date()]).optional(),
});
const updatePostVisibilityInput = z.object({ slug: z.string(), isPublic: z.boolean() });
const deletePostInput = z.object({ slug: z.string() });

const listMemosInput = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  cursor: z.string().optional(),
  publicOnly: z.boolean().default(true),
  search: z.string().optional(),
  tag: z.string().optional(),
});
const createMemoInput = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});
const updateMemoInput = z.object({
  slug: z.string(),
  content: z.string().min(1),
  title: z.string().optional(),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});
const deleteMemoInput = z.object({ slug: z.string() });

const semanticInput = z.object({
  q: z.string().min(1),
  topK: z.number().int().min(1).max(50).default(20),
  type: z.enum(["all", "post", "memo"]).default("all"),
  publishedOnly: z.boolean().default(true),
});
const enhancedInput = semanticInput.extend({
  rerankTopK: z.number().int().min(1).max(50).default(20),
  rerank: z.boolean().default(true),
});

function ands(conds: any[]) {
  return conds.length ? and(...conds) : undefined;
}

async function ensureServer() {
  if (server && transport) return { server, transport };
  await initializeDB(false);
  server = new McpServer(
    { name: "blog-mcp-http", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.tool(
    "posts_list",
    "List blog posts (public by default)",
    listPostsInput.shape,
    async (args) => {
      const {
        page = 1,
        limit = 10,
        search,
        category,
        tag,
        published = true,
      } = args as z.infer<typeof listPostsInput>;
      const offset = (page - 1) * limit;
      const conds: any[] = [eq(postsTable.type, "post")];
      if (published) conds.push(eq(postsTable.draft, false), eq(postsTable.public, true));
      if (search) conds.push(like(postsTable.title, `%${search}%`));
      if (category) conds.push(eq(postsTable.category, category));
      if (tag) conds.push(like(postsTable.tags, `%${tag}%`));
      const rows = await db
        .select({
          id: postsTable.id,
          slug: postsTable.slug,
          title: postsTable.title,
          excerpt: postsTable.excerpt,
          publishDate: postsTable.publishDate,
          updateDate: postsTable.updateDate,
          category: postsTable.category,
          tags: postsTable.tags,
          public: postsTable.public,
        })
        .from(postsTable)
        .where(ands(conds))
        .orderBy(desc(postsTable.publishDate))
        .limit(limit)
        .offset(offset);
      const total =
        (await db.select({ count: sql<number>`count(*)` }).from(postsTable).where(ands(conds)))[0]
          ?.count ?? 0;
      return {
        content: [
          {
            type: "json",
            text: JSON.stringify({
              items: rows,
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "posts_create",
    "Create & publish a post (writes Markdown)",
    createPostInput.shape,
    async (args) => {
      // 管理员专属
      requireAdmin();
      const input = args as z.infer<typeof createPostInput>;
      const fm = buildFrontmatter({
        title: input.title,
        public: input.isPublic,
        tags: input.tags,
        category: input.category,
        publishDate: input.publishDate ?? Date.now(),
      });
      const md = `${fm}${input.content}`;
      if (isWebDAVEnabled()) {
        const dav = new WebDAVClient();
        const base = (WEBDAV_PATHS.posts[0] || "/blog").replace(/\/$/, "");
        const d = new Date();
        const datePrefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
        const path = `${base}/${datePrefix}_${limax(input.title)}.md`;
        await dav.putFileContent(path, md);
      } else {
        // write via local source
        const fs = await import("node:fs/promises");
        const p = await import("node:path");
        const base = getLocalBasePathOrThrow();
        const rel = `${(LOCAL_PATHS.posts[0] || "/blog").replace(/\/$/, "")}/${limax(input.title)}.md`;
        const full = p.join(base, rel);
        await fs.mkdir(p.dirname(full), { recursive: true });
        await fs.writeFile(full, md, "utf-8");
      }
      await triggerIncrementalSync();
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "posts_update_content",
    "Update a post's content/metadata by slug",
    updatePostContentInput.shape,
    async (args) => {
      // 管理员专属
      requireAdmin();
      const input = args as z.infer<typeof updatePostContentInput>;
      const row = await db
        .select()
        .from(postsTable)
        .where(and(eq(postsTable.slug, input.slug), eq(postsTable.type, "post")))
        .limit(1)
        .then((r) => r[0]);
      if (!row?.filePath) throw new Error("Post not found or missing filePath");
      await updateFrontmatterOnDAV(
        row.filePath,
        (fm) => {
          if (input.title) fm.title = input.title;
          if (Array.isArray(input.tags)) fm.tags = input.tags;
          if (typeof input.isPublic === "boolean") fm.public = input.isPublic;
          if (input.category) fm.category = input.category;
          fm.updateDate = new Date().toISOString();
        },
        input.content
      );
      await triggerIncrementalSync();
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "posts_update_time",
    "Update publish/update time by slug",
    updatePostTimeInput.shape,
    async (args) => {
      // 管理员专属
      requireAdmin();
      const input = args as z.infer<typeof updatePostTimeInput>;
      const row = await db
        .select()
        .from(postsTable)
        .where(and(eq(postsTable.slug, input.slug), eq(postsTable.type, "post")))
        .limit(1)
        .then((r) => r[0]);
      if (!row?.filePath) throw new Error("Post not found or missing filePath");
      await updateFrontmatterOnDAV(row.filePath, (fm) => {
        if (input.publishDate) fm.publishDate = iso(input.publishDate);
        if (input.updateDate) fm.updateDate = iso(input.updateDate);
      });
      await triggerIncrementalSync();
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "posts_update_visibility",
    "Toggle visibility by slug",
    updatePostVisibilityInput.shape,
    async (args) => {
      // 管理员专属
      requireAdmin();
      const input = args as z.infer<typeof updatePostVisibilityInput>;
      const row = await db
        .select()
        .from(postsTable)
        .where(and(eq(postsTable.slug, input.slug), eq(postsTable.type, "post")))
        .limit(1)
        .then((r) => r[0]);
      if (!row?.filePath) throw new Error("Post not found or missing filePath");
      await updateFrontmatterOnDAV(row.filePath, (fm) => {
        fm.public = input.isPublic;
        fm.updateDate = new Date().toISOString();
      });
      await triggerIncrementalSync();
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "posts_delete",
    "Delete a post by slug (removes file)",
    deletePostInput.shape,
    async (args) => {
      // 管理员专属
      requireAdmin();
      const input = args as z.infer<typeof deletePostInput>;
      const row = await db
        .select()
        .from(postsTable)
        .where(and(eq(postsTable.slug, input.slug), eq(postsTable.type, "post")))
        .limit(1)
        .then((r) => r[0]);
      if (!row?.filePath) throw new Error("Post not found or missing filePath");
      if (isWebDAVEnabled()) {
        const dav = new WebDAVClient();
        await dav.deleteFile(row.filePath);
      } else {
        const fs = await import("node:fs/promises");
        const p = await import("node:path");
        await fs.rm(p.join(getLocalBasePathOrThrow(), row.filePath), { force: true });
      }
      await triggerIncrementalSync();
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "memos_list",
    "List memos (supports cursor via date)",
    listMemosInput.shape,
    async (args) => {
      const input = args as z.infer<typeof listMemosInput>;
      const conds: any[] = [eq(postsTable.type, "memo")];
      if (input.publicOnly) conds.push(eq(postsTable.public, true));
      if (input.search) conds.push(like(postsTable.title, `%${input.search}%`));
      if (input.tag) conds.push(like(postsTable.tags, `%${input.tag}%`));
      if (input.cursor) {
        const [cursorDate] = decodeURIComponent(input.cursor).split("_");
        const ts = new Date(cursorDate).getTime();
        if (!Number.isNaN(ts)) conds.push(sql`${postsTable.publishDate} < ${ts}`);
      }
      const rows = await db
        .select()
        .from(postsTable)
        .where(ands(conds))
        .orderBy(desc(postsTable.publishDate), desc(postsTable.id))
        .limit(input.limit + 1);
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      let nextCursor: string | undefined;
      if (hasMore && items.length)
        nextCursor = `${iso(items[items.length - 1].publishDate || Date.now())}_${items[items.length - 1].id}`;
      return { content: [{ type: "json", text: JSON.stringify({ items, nextCursor, hasMore }) }] };
    }
  );

  server.tool("memos_create", "Create a memo", createMemoInput.shape, async (args) => {
    // 管理员专属
    requireAdmin();
    const input = args as z.infer<typeof createMemoInput>;
    const fm = buildFrontmatter({
      title: input.title,
      public: input.isPublic,
      tags: input.tags,
      publishDate: Date.now(),
    });
    const md = `${fm}${input.content}`;
    if (isWebDAVEnabled()) {
      const dav = new WebDAVClient();
      const base = (WEBDAV_PATHS.memos[0] || "/memos").replace(/\/$/, "");
      const d = new Date();
      const datePrefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      const path = `${base}/${datePrefix}_${limax(input.title || "memo")}.md`;
      await dav.putFileContent(path, md);
    } else {
      const fs = await import("node:fs/promises");
      const p = await import("node:path");
      const base = getLocalBasePathOrThrow();
      const rel = `${(LOCAL_PATHS.memos[0] || "/memos").replace(/\/$/, "")}/${Date.now()}_${limax(input.title || "memo")}.md`;
      const full = p.join(base, rel);
      await fs.mkdir(p.dirname(full), { recursive: true });
      await fs.writeFile(full, md, "utf-8");
    }
    await triggerIncrementalSync();
    return { content: [{ type: "text", text: "ok" }] };
  });

  server.tool(
    "memos_update",
    "Update memo content/metadata by slug",
    updateMemoInput.shape,
    async (args) => {
      // 管理员专属
      requireAdmin();
      const input = args as z.infer<typeof updateMemoInput>;
      const row = await db
        .select()
        .from(postsTable)
        .where(and(eq(postsTable.slug, input.slug), eq(postsTable.type, "memo")))
        .limit(1)
        .then((r) => r[0]);
      if (!row?.filePath) throw new Error("Memo not found or missing filePath");
      await updateFrontmatterOnDAV(
        row.filePath,
        (fm) => {
          if (input.title) fm.title = input.title;
          fm.public = input.isPublic;
          fm.tags = input.tags;
          fm.updateDate = new Date().toISOString();
        },
        input.content
      );
      await triggerIncrementalSync();
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool("memos_delete", "Delete memo by slug", deleteMemoInput.shape, async (args) => {
    // 管理员专属
    requireAdmin();
    const input = args as z.infer<typeof deleteMemoInput>;
    const row = await db
      .select()
      .from(postsTable)
      .where(and(eq(postsTable.slug, input.slug), eq(postsTable.type, "memo")))
      .limit(1)
      .then((r) => r[0]);
    if (!row?.filePath) throw new Error("Memo not found or missing filePath");
    if (isWebDAVEnabled()) {
      const dav = new WebDAVClient();
      await dav.deleteFile(row.filePath);
    } else {
      const fs = await import("node:fs/promises");
      const p = await import("node:path");
      await fs.rm(p.join(getLocalBasePathOrThrow(), row.filePath), { force: true });
    }
    await triggerIncrementalSync();
    return { content: [{ type: "text", text: "ok" }] };
  });

  server.tool(
    "search_semantic",
    "Semantic search over posts and memos",
    semanticInput.shape,
    async (args) => {
      const input = args as z.infer<typeof semanticInput>;
      const items = await semanticSearch({
        q: input.q,
        topK: input.topK,
        type: input.type,
        publishedOnly: input.publishedOnly,
      });
      return { content: [{ type: "json", text: JSON.stringify(items) }] };
    }
  );
  server.tool("search_enhanced", "Semantic+rerank search", enhancedInput.shape, async (args) => {
    const input = args as z.infer<typeof enhancedInput>;
    const items = await enhancedSearch({
      q: input.q,
      topK: input.topK,
      type: input.type,
      publishedOnly: input.publishedOnly,
      rerankTopK: input.rerankTopK,
      rerank: input.rerank,
    });
    return { content: [{ type: "json", text: JSON.stringify(items) }] };
  });

  transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return { server, transport };
}

export async function getMcpTransport(): Promise<StreamableHTTPServerTransport> {
  const { transport: t } = await ensureServer();
  if (!t) {
    throw new Error("MCP transport unavailable");
  }
  return t;
}
