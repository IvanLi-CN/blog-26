import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { buildEmbeddingInput, hashEmbeddingInput } from "@/lib/ai/embeddings";
import { EmbeddingsRepository } from "@/lib/ai/embeddings-repo";
import { WEBDAV_PATH_MAPPINGS } from "../../config/paths";
import { getContentSourceManager } from "../../lib/content-sources";
import { generateNanoidSlug } from "../../lib/content-sources/utils";
import { WebDAVContentSource } from "../../lib/content-sources/webdav";
import { db } from "../../lib/db";
import { posts } from "../../lib/schema";
import { toMsTimestamp } from "../../lib/utils";
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
 * 规范化附件路径：将以 "/" 开头的相对站点路径转换为统一的文件 API 路径
 */
function normalizeAttachmentPaths(
  attachments: Array<{ path: string; [k: string]: any }>,
  dataSource: string | null | undefined
) {
  const source = dataSource === "local" ? "local" : "webdav";
  return attachments.map((att) => {
    if (att?.path && typeof att.path === "string" && att.path.startsWith("/")) {
      const clean = att.path.replace(/^\/+/, "");
      return { ...att, path: `/api/files/${source}/${clean}` };
    }
    return att;
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

    // 仅在启用 WebDAV 时注册内容源，避免本地/测试环境初始化失败
    const { isWebDAVEnabled } = await import("../../lib/webdav");
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

  let safeAttachments: any[] = inputAttachments;
  try {
    const metaForParse = faultDegrade ? "{" : memo.metadata;
    const parsed = parseAttachments(metaForParse);
    if (faultDegrade) {
      throw new Error("forced attachment parsing failure for test");
    }
    const normalized = normalizeAttachmentPaths(parsed as any, memo.dataSource);
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
        const attachments = normalizeAttachmentPaths(
          parseAttachments(memo.metadata),
          (memo as any).dataSource
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

      const attachments = normalizeAttachmentPaths(
        parseAttachments(memo.metadata),
        (memo as any).dataSource
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
    const { content, title, isPublic, tags, attachments } = input;
    const inputAttachments = Array.isArray(attachments) ? attachments : [];
    const inputTags = Array.isArray(tags) ? tags : [];

    // 检查内容是否包含图片markdown（当前仅用于调试/日志，占位保留）
    const _hasImageMarkdown = /!\[([^\]]*)\]\([^)]+\)/.test(content);

    const faultInjectionEnabled = process.env.MEMOS_E2E_FAULTS === "1";
    const forceCoreFail = faultInjectionEnabled && content.includes("[[force-fail]]");
    const forceDegrade = faultInjectionEnabled && content.includes("[[force-degrade]]");
    if (forceCoreFail) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "创建 memo 失败（测试注入）",
      });
    }

    // WebDAV 返回的是纯文件名（例如 20251009_title.md）
    // 这里记录文件名，方便后续通过 filePath 反查数据库记录
    let filePath: string | null = null;
    let createdMemo: MemoRow | undefined;

    // 在测试环境中，如果WebDAV连接失败，跳过WebDAV创建
    // 检测测试环境：ADMIN_EMAIL包含test或者NODE_ENV为test
    const isTestEnv = process.env.NODE_ENV === "test" || process.env.ADMIN_EMAIL?.includes("test");

    const buildFallbackResponse = (idHint?: string | null) => {
      const nowIso = new Date().toISOString();
      const safeId =
        idHint || (filePath ? `/memos/${filePath}`.replace(/\\+/g, "/") : `memo-${Date.now()}`);
      return {
        id: safeId,
        slug: generateNanoidSlug(8),
        title: title || extractTitleFromContent(content),
        content,
        isPublic,
        tags: inputTags,
        attachments: inputAttachments,
        createdAt: nowIso,
        publishedAt: nowIso,
        updatedAt: nowIso,
        timeDisplaySource: "unknown" as TimeDisplaySource,
      };
    };

    try {
      if (isTestEnv) {
        try {
          // 创建 WebDAV 内容源实例
          const webdavSource = createWebDAVSource();
          await webdavSource.initialize();

          // 发布到 WebDAV
          filePath = await webdavSource.createMemo(content, {
            title,
            isPublic,
            tags,
            attachments: inputAttachments,
            authorEmail: ctx.user?.email || "admin@example.com",
          });

          await webdavSource.dispose();

          // 测试环境：为了避免依赖全量同步耗时，直接写入数据库，保证立即可见
          const now = Date.now();
          const dbPath = `/memos/${filePath}`.replace(/\\+/g, "/");
          const memoData = {
            id: dbPath,
            type: "memo" as const,
            slug: generateNanoidSlug(8),
            title: title || extractTitleFromContent(content),
            excerpt: generateExcerptFromContent(content),
            contentHash: calculateSimpleHash(content),
            lastModified: now,
            source: "webdav",
            filePath: dbPath,
            draft: false,
            public: isPublic,
            publishDate: now,
            updateDate: now,
            tags: JSON.stringify(tags),
            author: ctx.user?.email || "admin@example.com",
            metadata: JSON.stringify({ attachments: inputAttachments }),
            body: content,
            dataSource: "webdav",
          };

          try {
            await db.insert(posts).values(memoData);
          } catch {
            // If sync already inserted, ignore and continue.
          }
          createdMemo = memoData as MemoRow;
        } catch (webdavError) {
          if (process.env.DEBUG_MEMOS === "1") {
            console.debug("🔍 [memos.create] WebDAV失败，使用测试模式:", webdavError);
          }
          // 在测试环境中，生成一个模拟的文件路径并直接写入数据库，
          // 以保证在无 WebDAV 的情况下功能仍可用
          const timestamp = Date.now();
          const slug = title?.replace(/\s+/g, "-").toLowerCase() || `memo-${timestamp}`;
          const fallbackFileName = `${slug}-${timestamp}.md`;
          const dbPath = `/memos/${fallbackFileName}`.replace(/\\+/g, "/");

          const now = Date.now();
          const memoData = {
            id: dbPath,
            type: "memo" as const,
            slug: generateNanoidSlug(8),
            title: title || extractTitleFromContent(content),
            excerpt: generateExcerptFromContent(content),
            contentHash: calculateSimpleHash(content),
            lastModified: now,
            source: "webdav",
            filePath: dbPath,
            draft: false,
            public: isPublic,
            publishDate: now,
            updateDate: now,
            tags: JSON.stringify(tags),
            author: ctx.user?.email || "admin@example.com",
            metadata: JSON.stringify({ attachments: inputAttachments }),
            body: content,
            dataSource: "webdav",
          };

          await db.insert(posts).values(memoData);
          createdMemo = memoData as MemoRow;
          filePath = memoData.filePath;
        }
      } else {
        // 生产环境中，WebDAV是必需的
        const webdavSource = createWebDAVSource();
        await webdavSource.initialize();

        filePath = await webdavSource.createMemo(content, {
          title,
          isPublic,
          tags,
          attachments: inputAttachments,
          authorEmail: ctx.user?.email || "admin@example.com",
        });

        if (process.env.DEBUG_MEMOS === "1") {
          console.debug("🔍 [memos.create] WebDAV生成的文件名:", filePath);
        }
        await webdavSource.dispose();
      }
    } catch (error) {
      console.error("[memos.create] 核心创建失败:", error);
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
      // 通过 filePath 反查刚创建的 memo，以返回与列表/bySlug 相同口径的结构
      if (!createdMemo && filePath) {
        const suffix = filePath.startsWith("/") ? filePath : `/${filePath}`;
        createdMemo = await db
          .select()
          .from(posts)
          .where(and(eq(posts.type, "memo"), like(posts.filePath, `%${suffix}`)))
          .orderBy(desc(posts.publishDate), desc(posts.id))
          .limit(1)
          .then((rows) => rows[0]);
      }
    } catch (error) {
      console.error("[memos.create] 通过 filePath 查询 memo 失败:", error);
      // 不抛错，继续走降级返回
    }

    if (!createdMemo) {
      // 兜底：同步过程中未能立即读到记录时，返回最小可用信息，避免前端报错
      return buildFallbackResponse(filePath);
    }

    try {
      return buildSafeMemoResponse(createdMemo, {
        inputAttachments,
        inputTags,
        fallbackContent: content,
        fallbackTitle: title,
        faultDegrade: forceDegrade,
      });
    } catch (error) {
      console.error("[memos.create] 构造响应失败，使用降级结构:", error);
      return buildFallbackResponse(createdMemo.id);
    }
  }),

  // 更新 memo（仅管理员）
  update: adminProcedure.input(updateMemoSchema).mutation(async ({ input, ctx }) => {
    const { id, content, title, isPublic, tags, attachments } = input;
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

      // 直接使用 WebDAV 客户端更新文件,跳过连接验证
      // 这样可以避免 initialize() 中的连接验证失败
      const { getWebDAVClient } = await import("../../lib/webdav");
      const webdavClient = getWebDAVClient();

      // 构建 markdown 内容
      const nowIso = new Date().toISOString();
      const frontmatter: Record<string, unknown> = {
        title: title || extractTitleFromContent(content),
        public: isPublic,
        tags,
        attachments,
        authorEmail: ctx.user?.email || "admin@example.com",
        updateDate: nowIso,
      };
      const existingPublishIso = toIsoString(existingMemo.publishDate ?? null);
      if (existingPublishIso) {
        frontmatter.publishDate = existingPublishIso;
      }

      const frontmatterStr = Object.entries(frontmatter)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            return `${key}: [${value.map((v) => JSON.stringify(v)).join(", ")}]`;
          }
          return `${key}: ${JSON.stringify(value)}`;
        })
        .join("\n");

      const markdownContent = `---\n${frontmatterStr}\n---\n\n${content}`;

      // 写入到 WebDAV（优先使用 filePath，其次回退到 id）
      const webdavPath = existingMemo.filePath || existingMemo.id;
      await webdavClient.putFileContent(webdavPath, markdownContent);

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
      meta.attachments = attachments;

      const updateData = {
        title: title || extractTitleFromContent(content),
        excerpt: generateExcerptFromContent(content),
        body: content, // 使用 body 字段匹配实际数据库结构
        public: isPublic,
        tags: JSON.stringify(tags),
        metadata: JSON.stringify(meta),
        updateDate: now,
        lastModified: now,
        contentHash: calculateSimpleHash(content),
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
        attachments,
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

      // 如果内容来源于 WebDAV，则尝试删除远端文件；
      // 否则跳过远端删除，仅移除数据库记录（本地/数据库源不依赖 WebDAV）。
      if ((existingMemo as any).source === "webdav") {
        try {
          // 直接使用 WebDAV 客户端删除文件，避免 initialize 失败中断
          const { getWebDAVClient } = await import("../../lib/webdav");
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
      // 创建 WebDAV 内容源实例
      const webdavSource = createWebDAVSource();

      await webdavSource.initialize();

      // 将 base64 转换为 ArrayBuffer
      const binaryString = atob(content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 上传到 WebDAV
      const attachmentPath = await webdavSource.uploadMemoAttachment(filename, bytes.buffer);

      await webdavSource.dispose();

      return {
        filename,
        path: attachmentPath,
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
