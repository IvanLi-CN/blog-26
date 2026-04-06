import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { buildEmbeddingInput, hashEmbeddingInput } from "@/lib/ai/embeddings";
import { EmbeddingsRepository } from "@/lib/ai/embeddings-repo";
import {
  buildMemoAssetPath,
  buildMemoRelativePath,
  buildMemoRootPath,
  getMemoNewPath,
  getMemoRootPath,
} from "@/lib/memo-paths";
import {
  hasApiFilesReference,
  normalizePersistedLink,
  rewriteApiFilesUrlsToRelative,
} from "@/lib/persisted-paths";
import {
  isLocalContentEnabled,
  LOCAL_PATHS,
  WEBDAV_PATH_MAPPINGS,
  WEBDAV_PATHS,
} from "../../config/paths";
import { getContentSourceManager, LocalContentSource } from "../../lib/content-sources";
import { generateMemoFilename, generateSlugFromPath } from "../../lib/content-sources/utils";
import { WebDAVContentSource } from "../../lib/content-sources/webdav";
import { db } from "../../lib/db";
import { posts } from "../../lib/schema";
import { toMsTimestamp } from "../../lib/utils";
import { getWebDAVClient, isWebDAVEnabled } from "../../lib/webdav";
import { adminProcedure, publicProcedure, router } from "../trpc";

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建 WebDAV 内容源实例
 */
function createWebDAVSource(): WebDAVContentSource {
  return new WebDAVContentSource({
    name: "webdav",
    priority: 100,
    enabled: true,
    options: {
      pathMappings: WEBDAV_PATH_MAPPINGS,
    },
  });
}

/**
 * 从 posts.metadata 中解析附件数组
 */
function parseAttachments(metadata: string | null | undefined): any[] {
  try {
    if (!metadata) return [];
    const meta = JSON.parse(metadata);
    return Array.isArray(meta.attachments) ? meta.attachments : [];
  } catch {
    return [];
  }
}

/**
 * 规范化附件路径（持久化语义）：
 * - persisted metadata 必须是相对路径（no /api/files/）
 * - 这里作为 API 输出的 best-effort 兜底，也用于兼容历史数据形态
 */
function normalizeAttachmentsToPersistedSemantics(
  attachments: Array<{ path: string; [k: string]: any }>,
  markdownFilePath: string
) {
  return attachments.map((att) => {
    if (!att?.path || typeof att.path !== "string") return att;
    try {
      const normalized = normalizePersistedLink(att.path, markdownFilePath);
      return normalized === att.path ? att : { ...att, path: normalized };
    } catch {
      // Keep original when normalization fails to avoid breaking legacy data unexpectedly.
      return att;
    }
  });
}

export type MemoRow = typeof posts.$inferSelect;

const timeDisplaySources = ["publishDate", "updateDate", "lastModified", "unknown"] as const;
type TimeDisplaySource = (typeof timeDisplaySources)[number];

function toIsoString(value?: number | bigint | null): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    const normalized = typeof value === "bigint" ? Number(value) : value;
    if (!Number.isFinite(normalized)) {
      return undefined;
    }

    const timestamp = toMsTimestamp(normalized as number);
    if (!Number.isFinite(timestamp)) {
      return undefined;
    }

    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  } catch {
    return undefined;
  }
}

function resolveMemoTimestamps(memo: MemoRow): {
  publishedAt?: string;
  displayTime: string;
  updatedAt: string;
  source: TimeDisplaySource;
} {
  const publishIso = toIsoString(memo.publishDate);
  const updateIso = toIsoString(memo.updateDate ?? undefined);
  const lastModifiedIso = toIsoString(memo.lastModified ?? undefined);

  if (publishIso) {
    return {
      publishedAt: publishIso,
      displayTime: publishIso,
      updatedAt: updateIso ?? publishIso,
      source: "publishDate",
    };
  }

  if (updateIso) {
    return {
      publishedAt: undefined,
      displayTime: updateIso,
      updatedAt: updateIso,
      source: "updateDate",
    };
  }

  if (lastModifiedIso) {
    return {
      publishedAt: undefined,
      displayTime: lastModifiedIso,
      updatedAt: lastModifiedIso,
      source: "lastModified",
    };
  }

  const fallback = new Date().toISOString();
  return {
    publishedAt: undefined,
    displayTime: fallback,
    updatedAt: fallback,
    source: "unknown",
  };
}

function normalizeFaultInjectionMarkers(content: string) {
  return content.replace(/\\(?=[[\]])/g, "");
}

/**
 * 确保内容源已注册
 */
async function _ensureContentSourcesRegistered(manager: any): Promise<void> {
  try {
    // 检查是否已有注册的内容源
    const sourcesStatus = await manager.getAllSourcesStatus();
    if (sourcesStatus.length > 0) {
      if (process.env.DEBUG_MEMOS === "1") {
        console.debug(`🔍 [memo-sync] 发现 ${sourcesStatus.length} 个已注册的内容源`);
      }
      return;
    }

    if (process.env.DEBUG_MEMOS === "1") {
      console.debug("🔧 [memo-sync] 注册内容源...");
    }

    // 仅在启用对应内容源时注册，避免 FS-only 下的初始化失败
    if (isLocalContentEnabled()) {
      const basePath = LOCAL_PATHS.basePath;
      if (basePath) {
        const localCfg = LocalContentSource.createDefaultConfig("local", 50, {
          contentPath: basePath,
        });
        await manager.registerSource(new LocalContentSource(localCfg));
        if (process.env.DEBUG_MEMOS === "1") {
          console.debug("✅ [memo-sync] local 内容源注册成功");
        }
      }
    } else if (process.env.DEBUG_MEMOS === "1") {
      console.debug("ℹ️ [memo-sync] 跳过注册 local 内容源：未启用");
    }

    if (isWebDAVEnabled()) {
      const webdavSource = createWebDAVSource();
      await manager.registerSource(webdavSource);
      if (process.env.DEBUG_MEMOS === "1") {
        console.debug("✅ [memo-sync] WebDAV内容源注册成功");
      }
    } else if (process.env.DEBUG_MEMOS === "1") {
      console.debug("ℹ️ [memo-sync] 跳过注册 WebDAV 内容源：未启用");
    }
  } catch (error) {
    console.error("⚠️ [memo-sync] 内容源注册失败:", error);
    // 注册失败不应该阻止同步尝试，让同步函数自己处理
  }
}

/**
 * 触发增量数据同步并等待完成
 */
async function triggerIncrementalSync(): Promise<void> {
  try {
    if (process.env.DEBUG_MEMOS === "1") {
      console.debug("🔄 [memo-sync] 开始触发增量数据同步...");
    }

    const manager = getContentSourceManager({
      maxConcurrentSyncs: 2,
      syncTimeout: 30000, // 30秒超时
      enableTransactions: true,
      conflictResolution: "priority",
    });

    // 确保内容源已注册
    await _ensureContentSourcesRegistered(manager);

    // 执行增量同步
    const result = await manager.syncAll();

    if (result.success) {
      if (process.env.DEBUG_MEMOS === "1") {
        console.debug(`✅ [memo-sync] 增量同步完成，处理了 ${result.stats.totalProcessed} 个项目`);
      }
    } else {
      const errorMessages = result.errors.map((e) => e.message).join(", ");
      throw new Error(`增量同步失败: ${errorMessages}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [memo-sync] 增量同步失败:", errorMessage);
    // 同步失败不应该影响memo操作的成功响应，但需要记录错误
    // 注意：这里我们选择不抛出错误，因为memo操作已经成功完成
  }
}

function getLocalMemoRootPath(): string {
  return getMemoRootPath(LOCAL_PATHS.memos[0]);
}

function getWebDAVMemoRootPath(): string {
  return getMemoRootPath(WEBDAV_PATHS.memos[0]);
}

function getLocalBasePathOrThrow(): string {
  const base = LOCAL_PATHS.basePath;
  if (!base || base.length === 0) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "本地内容源未启用：请设置 LOCAL_CONTENT_BASE_PATH",
    });
  }
  return base;
}

function pickDefaultMemoSource(): "local" | "webdav" {
  if (isLocalContentEnabled()) return "local";
  if (isWebDAVEnabled()) return "webdav";
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "未启用任何内容源：请配置 LOCAL_CONTENT_BASE_PATH 或 WEBDAV_URL",
  });
}

function buildMemoMarkdownDocument(content: string, frontmatter: Record<string, unknown>): string {
  const frontmatterYaml = Object.entries(frontmatter)
    .filter(([, v]) => v !== undefined)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map((v) => `  - ${JSON.stringify(v)}`).join("\n")}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join("\n");

  return `---\n${frontmatterYaml}\n---\n\n${content}`;
}

function normalizePersistedMemoInput(opts: {
  content: string;
  attachments: Array<{ path: string; [k: string]: any }>;
  markdownFilePath: string;
}): { content: string; attachments: Array<{ path: string; [k: string]: any }> } {
  const rewritten = rewriteApiFilesUrlsToRelative(opts.content, opts.markdownFilePath).content;
  const normalizedAttachments = normalizeAttachmentsToPersistedSemantics(
    opts.attachments,
    opts.markdownFilePath
  );

  // Optional strict mode: reject any persisted content still containing /api/files/
  const strict = process.env.PERSISTED_PATHS_STRICT === "1" || process.env.NODE_ENV === "test";
  if (strict) {
    if (hasApiFilesReference(rewritten)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "持久化内容不允许包含 /api/files/ 链接，请先转换为相对路径。",
      });
    }
    if (normalizedAttachments.some((att) => hasApiFilesReference(att.path))) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "attachments.path 不允许包含 /api/files/ 链接，请先转换为相对路径。",
      });
    }
  }

  return { content: rewritten, attachments: normalizedAttachments };
}

// ============================================================================
// 安全构造响应（可测试）
// ============================================================================

export interface BuildSafeMemoResponseOptions {
  inputAttachments: any[];
  inputTags: string[];
  fallbackContent: string;
  fallbackTitle?: string;
  faultDegrade?: boolean;
  now?: Date;
}

export function buildSafeMemoResponse(
  memo: MemoRow,
  {
    inputAttachments,
    inputTags,
    fallbackContent,
    fallbackTitle,
    faultDegrade = false,
    now,
  }: BuildSafeMemoResponseOptions
) {
  const fallbackIso = (now ?? new Date()).toISOString();
  const markdownFilePath = memo.filePath || memo.id;

  let safeAttachments: any[] = inputAttachments;
  try {
    const metaForParse = faultDegrade ? "{" : memo.metadata;
    const parsed = parseAttachments(metaForParse);
    if (faultDegrade) {
      throw new Error("forced attachment parsing failure for test");
    }
    const normalized = normalizeAttachmentsToPersistedSemantics(parsed as any, markdownFilePath);
    safeAttachments = Array.isArray(normalized) ? normalized : inputAttachments;
  } catch (error) {
    console.error("[memos.create] 解析附件失败，使用入参降级:", error);
    safeAttachments = inputAttachments;
  }
  if (!Array.isArray(safeAttachments)) {
    safeAttachments = inputAttachments;
  }
  if (safeAttachments.length === 0 && inputAttachments.length > 0) {
    safeAttachments = inputAttachments;
  }

  let memoTags = Array.isArray(inputTags) ? inputTags : [];
  try {
    const parsedTags = memo.tags ? JSON.parse(memo.tags) : inputTags;
    memoTags = Array.isArray(parsedTags) ? parsedTags : Array.isArray(inputTags) ? inputTags : [];
  } catch (error) {
    console.error("[memos.create] 解析 tags 失败，使用入参降级:", error);
    memoTags = Array.isArray(inputTags) ? inputTags : [];
  }

  let publishedAt = fallbackIso;
  let displayTime = fallbackIso;
  let updatedAt = fallbackIso;
  let source: TimeDisplaySource = "unknown";
  try {
    const resolved = faultDegrade
      ? (() => {
          throw new Error("forced time parsing failure for test");
        })()
      : resolveMemoTimestamps(memo);
    publishedAt = resolved.publishedAt ?? fallbackIso;
    displayTime = resolved.displayTime ?? fallbackIso;
    updatedAt = resolved.updatedAt ?? fallbackIso;
    source = resolved.source ?? "unknown";
  } catch (error) {
    console.error("[memos.create] 解析时间戳失败，使用当前时间降级:", error);
  }

  const safeTitle = memo.title || fallbackTitle || extractTitleFromContent(fallbackContent);
  const safeContent = (memo as any).body ?? fallbackContent;

  return {
    id: memo.id,
    slug: memo.slug,
    title: safeTitle,
    content: safeContent,
    isPublic: memo.public,
    tags: memoTags,
    attachments: safeAttachments,
    createdAt: displayTime,
    publishedAt,
    updatedAt,
    timeDisplaySource: source,
  };
}

// ============================================================================
// 输入验证 Schema
// ============================================================================

const listMemosSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
  cursor: z.string().optional(), // cursor format: "publishDate_id"
  search: z.string().optional(),
  tag: z.string().optional(),
  publicOnly: z.boolean().default(true),
});

const getMemoSchema = z.object({
  slug: z.string(),
});

const createMemoSchema = z.object({
  content: z.string().min(1, "内容不能为空"),
  title: z.string().optional(),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        path: z.string(),
        contentType: z.string().optional(),
        size: z.number().optional(),
        isImage: z.boolean(),
      })
    )
    .default([]),
});

const updateMemoSchema = z.object({
  id: z.string(),
  content: z.string().min(1, "内容不能为空"),
  title: z.string().optional(),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        path: z.string(),
        contentType: z.string().optional(),
        size: z.number().optional(),
        isImage: z.boolean(),
      })
    )
    .default([]),
});

const deleteMemoSchema = z.object({
  id: z.string(),
});

const uploadAttachmentSchema = z.object({
  filename: z.string(),
  content: z.string(), // Base64 编码的文件内容
  contentType: z.string().optional(),
});

// ============================================================================
// Memo 路由器
// ============================================================================

export const memosRouter = router({
  // 获取 memo 列表（无限滚动）
  list: publicProcedure.input(listMemosSchema).query(async ({ input, ctx }) => {
    const { cursor, limit, search, tag } = input;

    try {
      // 构建查询条件
      const conditions = [eq(posts.type, "memo")];

      // 权限过滤：非管理员只能看到公开的 memo
      if (!ctx.isAdmin) {
        conditions.push(eq(posts.public, true));
      }

      // 搜索条件
      if (search) {
        conditions.push(like(posts.title, `%${search}%`));
      }

      // 标签过滤
      if (tag) {
        conditions.push(like(posts.tags, `%${tag}%`));
      }

      // Cursor 分页条件 - 使用 (publishDate, id) 组合游标，避免同一时间戳的记录被跳过
      if (cursor) {
        try {
          // 解码 URL 编码的 cursor
          const decodedCursor = decodeURIComponent(cursor);
          const [cursorDate, cursorId] = decodedCursor.split("_");

          if (cursorDate && cursorId) {
            // 将日期字符串转换为时间戳进行比较
            const cursorTimestamp = new Date(cursorDate).getTime();
            if (!Number.isNaN(cursorTimestamp)) {
              // 使用 (publishDate, id) 组合进行严格的“游标之后”判断：
              // - publishDate 更小的记录
              // - 或者 publishDate 相同但 id 更小的记录
              conditions.push(
                sql`(${posts.publishDate} < ${cursorTimestamp} OR (${posts.publishDate} = ${cursorTimestamp} AND ${posts.id} < ${cursorId}))`
              );
            }
          }
        } catch (error) {
          console.error("解析 cursor 失败:", error);
          // 如果 cursor 解析失败，忽略分页条件，从头开始
        }
      }

      // 查询数据 - 多取一条用于判断是否有下一页
      const memoList = await db
        .select()
        .from(posts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        // 重要：严格按发布/创建时间倒序排序，而非更新时间
        .orderBy(desc(posts.publishDate), desc(posts.id)) // 添加 id 作为辅助排序确保稳定性
        .limit(limit + 1); // 多取一条用于判断 hasMore

      // 判断是否有更多数据
      const hasMore = memoList.length > limit;
      const actualMemos = hasMore ? memoList.slice(0, limit) : memoList;

      // 计算向量化状态（与 /posts 相同口径：当前模型名 + 输入拼接哈希一致且存在向量）
      const modelName = process.env.EMBEDDING_MODEL_NAME || "BAAI/bge-m3";
      const memosWithVectorStatus = await Promise.all(
        actualMemos.map(async (m) => {
          try {
            const embeddingInput = buildEmbeddingInput({
              title: m.title || "",
              excerpt: m.excerpt || "",
              body: m.body || "",
            });
            const embeddingHash = hashEmbeddingInput(embeddingInput);
            const status = await EmbeddingsRepository.getVectorizationStatus(
              m.id,
              modelName,
              embeddingHash
            );
            return {
              ...m,
              isVectorized: status === "indexed",
            } as typeof m & { isVectorized: boolean };
          } catch {
            return { ...m, isVectorized: false } as typeof m & { isVectorized: boolean };
          }
        })
      );

      // 转换为 API 响应格式
      const formattedMemos = memosWithVectorStatus.map((memo) => {
        const markdownFilePath = memo.filePath || memo.id;
        const attachments = normalizeAttachmentsToPersistedSemantics(
          parseAttachments(memo.metadata),
          markdownFilePath
        );
        const { publishedAt, displayTime, updatedAt, source } = resolveMemoTimestamps(memo);

        return {
          id: memo.id,
          slug: memo.slug,
          title: memo.title || "无标题 Memo",
          excerpt: memo.excerpt,
          content: memo.body, // 使用 body 字段匹配实际数据库结构
          isPublic: memo.public,
          tags: memo.tags ? JSON.parse(memo.tags) : [],
          attachments,
          author: memo.author || undefined,
          filePath: memo.filePath,
          source: memo.source,
          dataSource: memo.dataSource || "webdav",
          createdAt: displayTime,
          publishedAt,
          updatedAt,
          timeDisplaySource: source,
          // 新增：向量化标记
          isVectorized: (memo as any).isVectorized === true,
        };
      });

      // 为非管理员移除不在界面展示的敏感/内部字段，避免接口信息泄露
      // 对非管理员进行字段最小化（但保留 UI 必需字段：attachments、author、filePath、source）
      const sanitizedMemos = ctx.isAdmin
        ? formattedMemos
        : formattedMemos.map((m) => ({
            id: m.id,
            slug: m.slug,
            title: m.title,
            excerpt: m.excerpt,
            content: m.content,
            isPublic: m.isPublic,
            tags: m.tags,
            attachments: (m as any).attachments,
            author: (m as any).author,
            filePath: (m as any).filePath,
            source: (m as any).source,
            createdAt: m.createdAt,
            publishedAt: m.publishedAt,
            updatedAt: m.updatedAt,
            timeDisplaySource: m.timeDisplaySource,
          }));

      // 生成下一页的 cursor
      let nextCursor: string | undefined;
      if (hasMore && actualMemos.length > 0) {
        const lastMemo = actualMemos[actualMemos.length - 1];
        const lastDate = new Date(toMsTimestamp(lastMemo.publishDate)).toISOString();
        nextCursor = `${lastDate}_${lastMemo.id}`;
      }

      return {
        memos: sanitizedMemos,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      console.error("获取 memo 列表失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取 memo 列表失败",
      });
    }
  }),

  // 获取单个 memo
  bySlug: publicProcedure.input(getMemoSchema).query(async ({ input, ctx }) => {
    const { slug } = input;

    try {
      const memo = await db
        .select()
        .from(posts)
        .where(and(eq(posts.slug, slug), eq(posts.type, "memo")))
        .limit(1)
        .then((result) => result[0]);

      if (!memo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Memo 不存在",
        });
      }

      // 权限检查：非管理员只能查看公开的 memo
      if (!memo.public && !ctx.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "无权访问此 memo",
        });
      }

      const markdownFilePath = memo.filePath || memo.id;
      const attachments = normalizeAttachmentsToPersistedSemantics(
        parseAttachments(memo.metadata),
        markdownFilePath
      );

      const { publishedAt, displayTime, updatedAt, source } = resolveMemoTimestamps(memo);

      const base = {
        id: memo.id,
        slug: memo.slug,
        title: memo.title || "无标题 Memo",
        excerpt: memo.excerpt,
        content: memo.body,
        isPublic: memo.public,
        tags: memo.tags ? JSON.parse(memo.tags) : [],
        createdAt: displayTime,
        publishedAt,
        updatedAt,
        timeDisplaySource: source,
      } as const;

      // 非管理员只返回界面会显示的字段
      if (!ctx.isAdmin) {
        return base;
      }

      // 管理员返回完整信息
      return {
        ...base,
        attachments,
        author: memo.author || undefined,
        filePath: memo.filePath,
        source: memo.source,
        dataSource: (memo as any).dataSource || "webdav",
        isVectorized: false,
      } as any;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("获取 memo 失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取 memo 失败",
      });
    }
  }),

  // 创建新 memo（仅管理员）
  create: adminProcedure.input(createMemoSchema).mutation(async ({ input, ctx }) => {
    const { content: rawContent, title, isPublic, tags, attachments } = input;
    const inputAttachments = Array.isArray(attachments) ? attachments : [];
    const inputTags = Array.isArray(tags) ? tags : [];

    const faultInjectionEnabled = process.env.MEMOS_E2E_FAULTS === "1";
    const faultMarkerContent = normalizeFaultInjectionMarkers(rawContent);
    const forceCoreFail = faultInjectionEnabled && faultMarkerContent.includes("[[force-fail]]");
    const forceDegrade = faultInjectionEnabled && faultMarkerContent.includes("[[force-degrade]]");
    if (forceCoreFail) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "创建 memo 失败（测试注入）",
      });
    }

    const isTestEnv = process.env.NODE_ENV === "test" || process.env.ADMIN_EMAIL?.includes("test");

    const buildFallbackResponse = (idHint?: string | null) => {
      const nowIso = new Date().toISOString();
      const safeId = idHint || `memo-${Date.now()}`;
      return {
        id: safeId,
        slug: generateSlugFromPath(safeId),
        title: title || extractTitleFromContent(rawContent),
        content: rawContent,
        isPublic,
        tags: inputTags,
        attachments: inputAttachments,
        createdAt: nowIso,
        publishedAt: nowIso,
        updatedAt: nowIso,
        timeDisplaySource: "unknown" as TimeDisplaySource,
      };
    };

    const candidates: Array<"local" | "webdav"> = [];
    if (isLocalContentEnabled()) candidates.push("local");
    if (isWebDAVEnabled()) candidates.push("webdav");
    if (candidates.length === 0) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "未启用任何内容源：请配置 LOCAL_CONTENT_BASE_PATH 或 WEBDAV_URL",
      });
    }

    let createdId: string | null = null;
    let createdSource: "local" | "webdav" | null = null;
    let createdMemo: MemoRow | undefined;
    let normalizedContent = rawContent;
    let normalizedAttachments = inputAttachments;
    let lastError: unknown = null;

    for (const source of candidates) {
      try {
        const markdownFilePathForNormalization =
          source === "webdav"
            ? getMemoNewPath(getWebDAVMemoRootPath())
            : buildMemoRelativePath("__new__.md", getLocalMemoRootPath());

        const normalized = normalizePersistedMemoInput({
          content: rawContent,
          attachments: inputAttachments,
          markdownFilePath: markdownFilePathForNormalization,
        });

        normalizedContent = normalized.content;
        normalizedAttachments = normalized.attachments;

        const now = Date.now();
        const nowIso = new Date(now).toISOString();

        if (source === "local") {
          const fileName = generateMemoFilename(normalizedContent, title, now);
          createdId = buildMemoRelativePath(fileName, getLocalMemoRootPath()).replace(/\\+/g, "/");

          const frontmatter: Record<string, unknown> = {
            title: title || extractTitleFromContent(normalizedContent),
            public: isPublic,
            tags: inputTags,
            attachments: normalizedAttachments,
            authorEmail: ctx.user?.email || "admin@example.com",
            publishDate: nowIso,
          };

          const markdownContent = buildMemoMarkdownDocument(normalizedContent, frontmatter);
          const basePath = getLocalBasePathOrThrow();
          const fullPath = join(basePath, createdId);
          await mkdir(dirname(fullPath), { recursive: true });
          await writeFile(fullPath, markdownContent, "utf-8");
        } else {
          const webdavSource = createWebDAVSource();
          await webdavSource.initialize();

          const fileName = await webdavSource.createMemo(normalizedContent, {
            title,
            isPublic,
            tags: inputTags,
            attachments: normalizedAttachments,
            authorEmail: ctx.user?.email || "admin@example.com",
          });

          await webdavSource.dispose();
          createdId = buildMemoRootPath(fileName, getWebDAVMemoRootPath()).replace(/\\+/g, "/");
        }

        createdSource = source;

        if (isTestEnv && createdId) {
          const memoData = {
            id: createdId,
            type: "memo" as const,
            slug: generateSlugFromPath(createdId),
            title: title || extractTitleFromContent(normalizedContent),
            excerpt: generateExcerptFromContent(normalizedContent),
            contentHash: calculateSimpleHash(normalizedContent),
            lastModified: now,
            source,
            filePath: createdId,
            draft: false,
            public: isPublic,
            publishDate: now,
            updateDate: now,
            tags: JSON.stringify(inputTags),
            author: ctx.user?.email || "admin@example.com",
            metadata: JSON.stringify({ attachments: normalizedAttachments }),
            body: normalizedContent,
            dataSource: source,
          };

          try {
            await db.insert(posts).values(memoData);
          } catch {
            // If sync already inserted, ignore and continue.
          }
          createdMemo = memoData as MemoRow;
        }

        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (process.env.DEBUG_MEMOS === "1") {
          console.debug(`🔍 [memos.create] ${source} 创建失败，尝试下一个内容源:`, error);
        }
      }
    }

    if (!createdId || !createdSource) {
      console.error("[memos.create] 核心创建失败:", lastError);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "创建 memo 失败",
      });
    }

    // 触发增量数据同步（内部已处理错误日志）
    if (isTestEnv) {
      void triggerIncrementalSync();
    } else {
      await triggerIncrementalSync();
    }

    try {
      // 通过 id 反查刚创建的 memo，以返回与列表/bySlug 相同口径的结构
      if (!createdMemo && createdId) {
        createdMemo = await db
          .select()
          .from(posts)
          .where(and(eq(posts.type, "memo"), eq(posts.id, createdId)))
          .limit(1)
          .then((rows) => rows[0]);
      }
    } catch (error) {
      console.error("[memos.create] 通过 id 查询 memo 失败:", error);
      // 不抛错，继续走降级返回
    }

    if (!createdMemo) {
      // 兜底：同步过程中未能立即读到记录时，返回最小可用信息，避免前端报错
      return buildFallbackResponse(createdId);
    }

    try {
      return buildSafeMemoResponse(createdMemo, {
        inputAttachments: normalizedAttachments,
        inputTags,
        fallbackContent: normalizedContent,
        fallbackTitle: title,
        faultDegrade: forceDegrade,
      });
    } catch (error) {
      console.error("[memos.create] 构造响应失败，使用降级结构:", error);
      return buildFallbackResponse(createdId);
    }
  }),

  // 更新 memo（仅管理员）
  update: adminProcedure.input(updateMemoSchema).mutation(async ({ input, ctx }) => {
    const { id, content: rawContent, title, isPublic, tags, attachments } = input;
    const isTestEnv = process.env.NODE_ENV === "test" || process.env.ADMIN_EMAIL?.includes("test");

    try {
      // 查找现有 memo
      const existingMemo = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, id), eq(posts.type, "memo")))
        .limit(1)
        .then((result) => result[0]);

      if (!existingMemo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Memo 不存在",
        });
      }

      const markdownFilePath = existingMemo.filePath || existingMemo.id;
      const normalized = normalizePersistedMemoInput({
        content: rawContent,
        attachments: Array.isArray(attachments) ? attachments : [],
        markdownFilePath,
      });

      // 构建 markdown 内容
      const nowIso = new Date().toISOString();
      const frontmatter: Record<string, unknown> = {
        title: title || extractTitleFromContent(normalized.content),
        public: isPublic,
        tags,
        attachments: normalized.attachments,
        authorEmail: ctx.user?.email || "admin@example.com",
        updateDate: nowIso,
      };
      const existingPublishIso = toIsoString(existingMemo.publishDate ?? null);
      if (existingPublishIso) {
        frontmatter.publishDate = existingPublishIso;
      }

      const markdownContent = buildMemoMarkdownDocument(normalized.content, frontmatter);

      const memoSource = existingMemo.source === "local" ? "local" : "webdav";
      if (memoSource === "webdav") {
        if (!isWebDAVEnabled()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "WebDAV 已禁用：请先将该 memo 迁移为 local（或启用 WEBDAV_URL / CONTENT_SOURCES=webdav）。",
          });
        }
        const webdavClient = getWebDAVClient();
        const webdavPath = existingMemo.filePath || existingMemo.id;
        await webdavClient.putFileContent(webdavPath, markdownContent);
      } else {
        const basePath = getLocalBasePathOrThrow();
        const localFilePath = (existingMemo.filePath || existingMemo.id).replace(/^\/+/, "");
        const fullPath = join(basePath, localFilePath);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, markdownContent, "utf-8");
      }

      // 更新数据库
      const now = Date.now();
      // 合并并更新元数据
      let meta: any = {};
      try {
        meta = existingMemo.metadata ? JSON.parse(existingMemo.metadata) : {};
      } catch {
        // ignore malformed metadata json
        meta = {};
      }
      meta.attachments = normalized.attachments;

      const updateData = {
        title: title || extractTitleFromContent(normalized.content),
        excerpt: generateExcerptFromContent(normalized.content),
        body: normalized.content, // 使用 body 字段匹配实际数据库结构
        public: isPublic,
        tags: JSON.stringify(tags),
        metadata: JSON.stringify(meta),
        updateDate: now,
        lastModified: now,
        contentHash: calculateSimpleHash(normalized.content),
      };

      await db.update(posts).set(updateData).where(eq(posts.id, id));

      // 触发增量数据同步
      if (isTestEnv) {
        void triggerIncrementalSync();
      } else {
        await triggerIncrementalSync();
      }

      const updatedRow: MemoRow = { ...existingMemo, ...updateData } as MemoRow;
      const { publishedAt, displayTime, updatedAt, source } = resolveMemoTimestamps(updatedRow);

      return {
        id,
        slug: existingMemo.slug,
        title: updateData.title,
        content: updateData.body, // 使用 body 字段匹配实际数据库结构
        isPublic: updateData.public,
        tags,
        attachments: normalized.attachments,
        createdAt: displayTime,
        publishedAt,
        updatedAt,
        timeDisplaySource: source,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("更新 memo 失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "更新 memo 失败",
      });
    }
  }),

  // 删除 memo（仅管理员）
  delete: adminProcedure.input(deleteMemoSchema).mutation(async ({ input }) => {
    const { id } = input;
    const isTestEnv = process.env.NODE_ENV === "test" || process.env.ADMIN_EMAIL?.includes("test");

    try {
      // 查找现有 memo
      const existingMemo = await db
        .select()
        .from(posts)
        .where(and(eq(posts.id, id), eq(posts.type, "memo")))
        .limit(1)
        .then((result) => result[0]);

      if (!existingMemo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Memo 不存在",
        });
      }

      const memoSource = existingMemo.source === "local" ? "local" : "webdav";
      if (memoSource === "webdav") {
        if (!isWebDAVEnabled()) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[memos.delete] WebDAV 已禁用，跳过远端删除:", existingMemo.id);
          } else {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "WebDAV 已禁用，无法删除远端 memo 文件。",
            });
          }
        } else {
          try {
            // 直接使用 WebDAV 客户端删除文件，避免 initialize 失败中断
            const webdavClient = getWebDAVClient();
            const webdavPath = existingMemo.filePath || existingMemo.id;

            try {
              await webdavClient.deleteFile(webdavPath);
            } catch (err) {
              // 在开发/测试环境，如远端不存在对应文件，则记录并继续数据库删除
              if (process.env.NODE_ENV !== "production") {
                console.warn("[memos.delete] WebDAV 删除失败(开发环境忽略)", webdavPath, err);
              } else {
                throw err;
              }
            }
          } catch (err) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[memos.delete] 跳过 WebDAV 删除(开发环境)", err);
            } else {
              throw err;
            }
          }
        }
      } else {
        // local source: best-effort delete local file (non-fatal in dev/test)
        if (isLocalContentEnabled()) {
          const basePath = getLocalBasePathOrThrow();
          const localFilePath = (existingMemo.filePath || existingMemo.id).replace(/^\/+/, "");
          try {
            await rm(join(basePath, localFilePath), { force: true });
          } catch (err) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[memos.delete] local 删除失败(开发环境忽略)", localFilePath, err);
            } else {
              throw err;
            }
          }
        }
      }

      // 从数据库删除
      await db.delete(posts).where(eq(posts.id, id));

      // 触发增量数据同步
      if (isTestEnv) {
        void triggerIncrementalSync();
      } else {
        await triggerIncrementalSync();
      }

      return { success: true, id };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("删除 memo 失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "删除 memo 失败",
      });
    }
  }),

  // 上传附件（仅管理员）
  uploadAttachment: adminProcedure.input(uploadAttachmentSchema).mutation(async ({ input }) => {
    const { filename, content, contentType } = input;

    try {
      // 将 base64 转换为 ArrayBuffer
      const binaryString = atob(content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const targetSource = pickDefaultMemoSource();

      let persistedPath = `./assets/${filename}`;
      if (targetSource === "local") {
        const basePath = getLocalBasePathOrThrow();
        const fileRelPath = buildMemoAssetPath(filename, getLocalMemoRootPath());
        const fullPath = join(basePath, fileRelPath);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, bytes);
      } else {
        const webdavSource = createWebDAVSource();
        await webdavSource.initialize();

        const attachmentPath = await webdavSource.uploadMemoAttachment(filename, bytes.buffer);
        await webdavSource.dispose();

        // Convert WebDAV absolute path to persisted relative.
        persistedPath = normalizePersistedLink(
          attachmentPath,
          getMemoNewPath(getWebDAVMemoRootPath())
        );
      }

      return {
        filename,
        path: persistedPath,
        contentType,
        size: bytes.length,
        isImage: contentType?.startsWith("image/") || false,
      };
    } catch (error) {
      console.error("上传附件失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "上传附件失败",
      });
    }
  }),
});

// ============================================================================
// 辅助函数
// ============================================================================

export function extractTitleFromContent(content: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Fallback: first non-empty line's text as-is (no concatenation)
  const lines = content.split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length > 0) {
      return line.substring(0, 50);
    }
  }

  return "无标题 Memo";
}

export function generateExcerptFromContent(content: string): string {
  const plainText = content
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .trim();

  return plainText.length > 150 ? `${plainText.substring(0, 150)}...` : plainText;
}

function calculateSimpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}
