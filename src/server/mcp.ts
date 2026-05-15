import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { and, desc, eq, like, sql } from "drizzle-orm";
import matter from "gray-matter";
import limax from "limax";
import { z } from "zod";
import {
  getActiveLocalBasePath,
  isLocalContentEnabled,
  LOCAL_PATHS,
  WEBDAV_PATHS,
} from "@/config/paths";
import { enhanced as enhancedSearch, semantic as semanticSearch } from "@/lib/ai/search";
import { clearSearchCache } from "@/lib/ai/search-cache";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "@/lib/content-sources";
import { db, initializeDB } from "@/lib/db";
import { formatMarkdownBody } from "@/lib/markdown-format";
import { buildMemoRelativePath, getMemoRootPath } from "@/lib/memo-paths";
import { posts as postsTable } from "@/lib/schema";
import { isWebDAVEnabled, WebDAVClient } from "@/lib/webdav";
import { getPostsByTag, getTagSummaries, groupPostsByTag } from "@/server/services/tag-service";
import { requireAdmin } from "./mcp-auth-context";

const MCP_CREATED_VIA = "mcp";
const MCP_UPDATED_VIA = "mcp";

function iso(ts: number | string | Date): string {
  return new Date(ts).toISOString();
}

function getLocalBasePathOrThrow(): string {
  const base = getActiveLocalBasePath();
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
      Array.isArray(v) && v.length === 0
        ? `${k}: []`
        : Array.isArray(v)
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

type StorageSource = "local" | "webdav";
type PostRow = typeof postsTable.$inferSelect;
type ContentKind = "post" | "memo";

type FrontmatterWriteResult = {
  ok: true;
  frontmatterAdded: boolean;
  warnings: string[];
  recommendedMetadata: Record<string, unknown>;
};

function hasYamlFrontmatter(raw: string): boolean {
  return /^---[ \t]*(?:\r?\n|$)/.test(raw);
}

function parseStoredTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.filter((tag) => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function isMissingFrontmatterValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function getMissingRecommendedMetadata(fm: Record<string, unknown>, kind: ContentKind): string[] {
  const fields = kind === "post" ? ["publishDate", "category"] : ["publishDate"];
  return fields.filter((field) => isMissingFrontmatterValue(fm[field]));
}

function buildRecommendedMetadata(row: PostRow, missing: string[]): Record<string, unknown> {
  const recommended: Record<string, unknown> = {};
  for (const field of missing) {
    if (field === "publishDate") recommended.publishDate = iso(row.publishDate || Date.now());
    if (field === "category" && row.category) recommended.category = row.category;
  }
  return recommended;
}

function ensureMcpUpdateFrontmatter(fm: Record<string, unknown>, row: PostRow, nowIso: string) {
  if (isMissingFrontmatterValue(fm.title)) fm.title = row.title;
  if (typeof fm.public !== "boolean") fm.public = row.public;
  if (!Array.isArray(fm.tags)) fm.tags = parseStoredTags(row.tags);
  if (isMissingFrontmatterValue(fm.updateDate)) {
    fm.updateDate = row.updateDate ? iso(row.updateDate) : nowIso;
  }
  fm.updatedVia = MCP_UPDATED_VIA;
}

function buildToolResult(result: FrontmatterWriteResult) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

async function getFrontmatterDiagnostics(row: PostRow, kind: ContentKind) {
  if (!row.filePath) {
    return {
      hasFrontmatter: false,
      missingRecommendedMetadata: [],
    };
  }
  try {
    const raw = await readStorageFile(resolveStorageSource(row), row.filePath);
    const hasFrontmatter = hasYamlFrontmatter(raw);
    const parsed = matter(raw);
    return {
      hasFrontmatter,
      missingRecommendedMetadata: getMissingRecommendedMetadata(parsed.data, kind),
    };
  } catch {
    return {
      hasFrontmatter: false,
      missingRecommendedMetadata: [],
    };
  }
}

async function annotateContentRows<T extends PostRow>(rows: T[], kind: ContentKind) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      ...(await getFrontmatterDiagnostics(row, kind)),
    }))
  );
}

function resolveStorageSource(row: Pick<PostRow, "source" | "dataSource">): StorageSource {
  const source = `${row.source || ""} ${row.dataSource || ""}`.toLowerCase();
  return source.includes("webdav") ? "webdav" : "local";
}

async function readStorageFile(source: StorageSource, filePath: string): Promise<string> {
  if (source === "webdav") {
    if (!isWebDAVEnabled()) throw new Error("WebDAV not configured");
    return new WebDAVClient().getFileContent(filePath);
  }

  const fs = await import("node:fs/promises");
  const p = await import("node:path");
  return fs.readFile(p.join(getLocalBasePathOrThrow(), filePath), "utf-8");
}

async function writeStorageFile(
  source: StorageSource,
  filePath: string,
  content: string
): Promise<void> {
  if (source === "webdav") {
    if (!isWebDAVEnabled()) throw new Error("WebDAV not configured");
    await new WebDAVClient().putFileContent(filePath, content);
    return;
  }

  const fs = await import("node:fs/promises");
  const p = await import("node:path");
  const full = p.join(getLocalBasePathOrThrow(), filePath);
  await fs.mkdir(p.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

async function deleteStorageFile(source: StorageSource, filePath: string): Promise<void> {
  if (source === "webdav") {
    if (!isWebDAVEnabled()) throw new Error("WebDAV not configured");
    await new WebDAVClient().deleteFile(filePath);
    return;
  }

  const fs = await import("node:fs/promises");
  const p = await import("node:path");
  await fs.rm(p.join(getLocalBasePathOrThrow(), filePath), { force: true });
}

async function deleteIndexedContentRow(id: string): Promise<void> {
  await db.delete(postsTable).where(eq(postsTable.id, id));
  clearSearchCache();
}

async function updateFrontmatterInStorage(
  row: PostRow,
  mut: (fm: Record<string, unknown>) => void,
  newBody?: string,
  kind: ContentKind = row.type === "memo" ? "memo" : "post"
): Promise<FrontmatterWriteResult> {
  if (!row.filePath) throw new Error("Content not found or missing filePath");
  const source = resolveStorageSource(row);
  const raw = await readStorageFile(source, row.filePath);
  const frontmatterAdded = !hasYamlFrontmatter(raw);
  const { data, content } = matter(raw);
  const nowIso = new Date().toISOString();
  mut(data);
  ensureMcpUpdateFrontmatter(data, row, nowIso);
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
  const missingRecommendedMetadata = getMissingRecommendedMetadata(data, kind);
  const warnings = [
    ...(frontmatterAdded
      ? ["Original Markdown had no YAML frontmatter; minimal MCP update metadata was added."]
      : []),
    ...(missingRecommendedMetadata.length > 0
      ? [
          `Recommended frontmatter fields are still missing: ${missingRecommendedMetadata.join(
            ", "
          )}.`,
        ]
      : []),
  ];
  await writeStorageFile(
    source,
    row.filePath,
    `${fmPart}${newBody === undefined ? content : formatMarkdownBody(newBody)}`
  );
  return {
    ok: true,
    frontmatterAdded,
    warnings,
    recommendedMetadata: buildRecommendedMetadata(row, missingRecommendedMetadata),
  };
}

function buildDatedMarkdownPath(basePath: string, title: string): string {
  const base = basePath.replace(/\/$/, "");
  const d = new Date();
  const datePrefix = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${base}/${datePrefix}_${limax(title)}.md`;
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
  publishDate: z.union([z.string(), z.number()]).optional(),
  updateDate: z.union([z.string(), z.number()]).optional(),
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

const listTagsInput = z.object({
  includeDrafts: z.boolean().default(false),
  includeUnpublished: z.boolean().default(false),
});

const listTagPostsInput = listTagsInput.extend({
  tag: z.string().min(1),
});

const listAllTagPostsInput = listTagsInput.extend({
  limitPerTag: z.number().int().min(1).optional(),
});

function ands(conds: any[]) {
  return conds.length ? and(...conds) : undefined;
}

async function buildConnectedServer<TTransport>(nextTransport: TTransport) {
  await initializeDB(false);
  const server = new McpServer(
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
          createdVia: postsTable.createdVia,
          source: postsTable.source,
          dataSource: postsTable.dataSource,
          filePath: postsTable.filePath,
        })
        .from(postsTable)
        .where(ands(conds))
        .orderBy(desc(postsTable.publishDate))
        .limit(limit)
        .offset(offset);
      const items = (await annotateContentRows(rows as PostRow[], "post")).map(
        ({ filePath: _filePath, source: _source, dataSource: _dataSource, ...item }) => item
      );
      const total =
        (await db.select({ count: sql<number>`count(*)` }).from(postsTable).where(ands(conds)))[0]
          ?.count ?? 0;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                items,
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
              },
              null,
              2
            ),
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
        extra: { createdVia: MCP_CREATED_VIA },
      });
      const md = `${fm}${formatMarkdownBody(input.content)}`;
      if (isWebDAVEnabled()) {
        await writeStorageFile(
          "webdav",
          buildDatedMarkdownPath(WEBDAV_PATHS.posts[0] || "/blog", input.title),
          md
        );
      } else {
        await writeStorageFile(
          "local",
          buildDatedMarkdownPath(LOCAL_PATHS.posts[0] || "/blog", input.title),
          md
        );
      }
      await triggerIncrementalSync();
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  server.tool(
    "posts_update_content",
    "Update a post's content/metadata by slug. Prefer preserving or supplying complete frontmatter metadata such as title, tags, category, public, and publishDate when available.",
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
      const result = await updateFrontmatterInStorage(
        row,
        (fm) => {
          if (input.title) fm.title = input.title;
          if (Array.isArray(input.tags)) fm.tags = input.tags;
          if (typeof input.isPublic === "boolean") fm.public = input.isPublic;
          if (input.category) fm.category = input.category;
          fm.updateDate = new Date().toISOString();
        },
        input.content,
        "post"
      );
      await triggerIncrementalSync();
      return buildToolResult(result);
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
      const result = await updateFrontmatterInStorage(
        row,
        (fm) => {
          if (input.publishDate) fm.publishDate = iso(input.publishDate);
          if (input.updateDate) fm.updateDate = iso(input.updateDate);
        },
        undefined,
        "post"
      );
      await triggerIncrementalSync();
      return buildToolResult(result);
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
      const result = await updateFrontmatterInStorage(
        row,
        (fm) => {
          fm.public = input.isPublic;
          fm.updateDate = new Date().toISOString();
        },
        undefined,
        "post"
      );
      await triggerIncrementalSync();
      return buildToolResult(result);
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
      await deleteStorageFile(resolveStorageSource(row), row.filePath);
      await deleteIndexedContentRow(row.id);
      await triggerIncrementalSync();
      return { content: [{ type: "text", text: "ok" }] };
    }
  );

  function requireAdminIfRequested(options: {
    includeDrafts?: boolean;
    includeUnpublished?: boolean;
  }) {
    if (options.includeDrafts || options.includeUnpublished) {
      requireAdmin();
    }
  }

  server.tool(
    "tags.list",
    "List aggregated tags (public by default)",
    listTagsInput.shape,
    async (args) => {
      const { includeDrafts = false, includeUnpublished = false } = args as z.infer<
        typeof listTagsInput
      >;
      requireAdminIfRequested({ includeDrafts, includeUnpublished });
      const summaries = await getTagSummaries({ includeDrafts, includeUnpublished });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              items: summaries,
              total: summaries.length,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "tags.listPosts",
    "List posts that contain the given tag",
    listTagPostsInput.shape,
    async (args) => {
      const {
        tag,
        includeDrafts = false,
        includeUnpublished = false,
      } = args as z.infer<typeof listTagPostsInput>;
      requireAdminIfRequested({ includeDrafts, includeUnpublished });
      const posts = await getPostsByTag(tag, { includeDrafts, includeUnpublished });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              tag,
              items: posts,
              total: posts.length,
            }),
          },
        ],
      };
    }
  );

  server.tool(
    "tags.listAllPosts",
    "List all tags along with their associated posts",
    listAllTagPostsInput.shape,
    async (args) => {
      const {
        includeDrafts = false,
        includeUnpublished = false,
        limitPerTag,
      } = args as z.infer<typeof listAllTagPostsInput>;
      requireAdminIfRequested({ includeDrafts, includeUnpublished });
      const options = { includeDrafts, includeUnpublished };
      const bundles = await groupPostsByTag(
        options,
        typeof limitPerTag === "number" ? limitPerTag : undefined
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              items: bundles,
              total: bundles.length,
              limitPerTag: typeof limitPerTag === "number" ? limitPerTag : undefined,
            }),
          },
        ],
      };
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
      const items = await annotateContentRows(hasMore ? rows.slice(0, input.limit) : rows, "memo");
      let nextCursor: string | undefined;
      if (hasMore && items.length)
        nextCursor = `${iso(items[items.length - 1].publishDate || Date.now())}_${items[items.length - 1].id}`;
      return {
        content: [{ type: "text", text: JSON.stringify({ items, nextCursor, hasMore }, null, 2) }],
      };
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
      extra: { createdVia: MCP_CREATED_VIA },
    });
    const md = `${fm}${formatMarkdownBody(input.content)}`;
    if (isWebDAVEnabled()) {
      await writeStorageFile(
        "webdav",
        buildDatedMarkdownPath(getMemoRootPath(WEBDAV_PATHS.memos[0]), input.title || "memo"),
        md
      );
    } else {
      const rel = buildMemoRelativePath(
        `${Date.now()}_${limax(input.title || "memo")}.md`,
        LOCAL_PATHS.memos[0]
      );
      await writeStorageFile("local", rel, md);
    }
    await triggerIncrementalSync();
    return { content: [{ type: "text", text: "ok" }] };
  });

  server.tool(
    "memos_update",
    "Update memo content/metadata by slug. Prefer preserving or supplying complete frontmatter metadata such as title, tags, public, and publishDate when available.",
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
      const result = await updateFrontmatterInStorage(
        row,
        (fm) => {
          if (input.title) fm.title = input.title;
          fm.public = input.isPublic;
          fm.tags = input.tags;
          fm.updateDate = new Date().toISOString();
        },
        input.content,
        "memo"
      );
      await triggerIncrementalSync();
      return buildToolResult(result);
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
    await deleteStorageFile(resolveStorageSource(row), row.filePath);
    await deleteIndexedContentRow(row.id);
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
      return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
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
    return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
  });

  await server.connect(nextTransport as any);
  return { server, transport: nextTransport };
}

export async function createMcpWebTransport(): Promise<{
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}> {
  return buildConnectedServer(
    new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() })
  );
}
