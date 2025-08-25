import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import { WEBDAV_PATH_MAPPINGS } from "../../config/paths";
import { WebDAVContentSource } from "../../lib/content-sources/webdav";
import { db } from "../../lib/db";
import { memos, posts } from "../../lib/schema";
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

// ============================================================================
// 输入验证 Schema
// ============================================================================

const listMemosSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(10),
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
  // 获取 memo 列表（分页）
  list: publicProcedure.input(listMemosSchema).query(async ({ input, ctx }) => {
    const { page, limit, search, tag } = input;
    const offset = (page - 1) * limit;

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

      // 查询数据
      const [memoList, totalCount] = await Promise.all([
        db
          .select()
          .from(posts)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(posts.publishDate))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(posts)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .then((result) => result[0]?.count || 0),
      ]);

      // 转换为 API 响应格式
      const formattedMemos = memoList.map((memo) => ({
        id: memo.id,
        slug: memo.slug,
        title: memo.title || "无标题 Memo",
        excerpt: memo.excerpt,
        content: memo.body, // 使用 body 字段匹配实际数据库结构
        isPublic: memo.public,
        tags: memo.tags ? JSON.parse(memo.tags) : [],
        attachments: (memo as any).attachments ? JSON.parse((memo as any).attachments) : [],
        author: memo.author || (memo as any).authorEmail,
        source: (memo as any).source,
        dataSource: memo.dataSource || "webdav",
        createdAt: new Date(toMsTimestamp(memo.publishDate)).toISOString(),
        updatedAt: memo.updateDate
          ? new Date(toMsTimestamp(memo.updateDate)).toISOString()
          : new Date(toMsTimestamp(memo.publishDate)).toISOString(),
      }));

      const totalPages = Math.ceil(totalCount / limit);
      const hasMore = page < totalPages;

      return {
        memos: formattedMemos,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
          hasMore,
        },
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

      return {
        id: memo.id,
        slug: memo.slug,
        title: memo.title || "无标题 Memo",
        excerpt: memo.excerpt,
        content: memo.body, // 使用 body 字段匹配实际数据库结构
        isPublic: memo.public,
        tags: memo.tags ? JSON.parse(memo.tags) : [],
        attachments: (memo as any).attachments ? JSON.parse((memo as any).attachments) : [],
        author: memo.author || (memo as any).authorEmail,
        source: (memo as any).source,
        createdAt: new Date(toMsTimestamp(memo.publishDate)).toISOString(),
        updatedAt: memo.updateDate
          ? new Date(toMsTimestamp(memo.updateDate)).toISOString()
          : new Date(toMsTimestamp(memo.publishDate)).toISOString(),
      };
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

    try {
      // 创建 WebDAV 内容源实例
      const webdavSource = createWebDAVSource();

      await webdavSource.initialize();

      // 发布到 WebDAV
      const filePath = await webdavSource.createMemo(content, {
        title,
        isPublic,
        tags,
        attachments,
        authorEmail: ctx.user?.email || "admin@example.com",
      });

      // 生成 slug
      const slug = filePath.replace(/\.md$/, "").replace(/^.*\//, "");

      // 保存到数据库
      const now = Math.floor(Date.now() / 1000);
      const memoData = {
        id: `memos/${filePath}`,
        type: "memo" as const,
        slug,
        title: title || extractTitleFromContent(content),
        excerpt: generateExcerptFromContent(content),
        contentHash: calculateSimpleHash(content),
        lastModified: now,
        source: "webdav",
        filePath: `memos/${filePath}`,
        draft: false,
        public: isPublic,
        publishDate: now,
        updateDate: now,
        tags: JSON.stringify(tags),
        author: ctx.user?.email || "admin@example.com",
        metadata: JSON.stringify({}),
        body: content, // 使用 body 字段匹配实际数据库结构
        authorEmail: ctx.user?.email || "admin@example.com",
        attachments: JSON.stringify(attachments),
        isPublic,
        createdAt: now,
        updatedAt: now,
        sourcePath: `memos/${filePath}`,
        dataSource: "webdav",
      };

      await db.insert(memos).values(memoData);

      await webdavSource.dispose();

      return {
        id: memoData.id,
        slug: memoData.slug,
        title: memoData.title,
        content: memoData.body, // 使用 body 字段匹配实际数据库结构
        isPublic: memoData.public,
        tags,
        attachments,
        createdAt: new Date(toMsTimestamp(now)).toISOString(),
        updatedAt: new Date(toMsTimestamp(now)).toISOString(),
      };
    } catch (error) {
      console.error("创建 memo 失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "创建 memo 失败",
      });
    }
  }),

  // 更新 memo（仅管理员）
  update: adminProcedure.input(updateMemoSchema).mutation(async ({ input, ctx }) => {
    const { id, content, title, isPublic, tags, attachments } = input;

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

      // 创建 WebDAV 内容源实例
      const webdavSource = createWebDAVSource();

      await webdavSource.initialize();

      // 更新 WebDAV 文件
      await webdavSource.updateMemo(existingMemo.slug, content, {
        title,
        isPublic,
        tags,
        attachments,
        authorEmail: ctx.user?.email || "admin@example.com",
      });

      // 更新数据库
      const now = Math.floor(Date.now() / 1000);
      const updateData = {
        title: title || extractTitleFromContent(content),
        excerpt: generateExcerptFromContent(content),
        body: content, // 使用 body 字段匹配实际数据库结构
        public: isPublic,
        tags: JSON.stringify(tags),
        attachments: JSON.stringify(attachments),
        updateDate: now,
        lastModified: now,
        updatedAt: now,
        contentHash: calculateSimpleHash(content),
      };

      await db.update(posts).set(updateData).where(eq(posts.id, id));

      await webdavSource.dispose();

      return {
        id,
        slug: existingMemo.slug,
        title: updateData.title,
        content: updateData.body, // 使用 body 字段匹配实际数据库结构
        isPublic: updateData.public,
        tags,
        attachments,
        updatedAt: new Date(toMsTimestamp(now)).toISOString(),
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

      // 创建 WebDAV 内容源实例
      const webdavSource = createWebDAVSource();

      await webdavSource.initialize();

      // 从 WebDAV 删除文件
      await webdavSource.deleteMemo(existingMemo.slug);

      // 从数据库删除
      await db.delete(posts).where(eq(posts.id, id));

      await webdavSource.dispose();

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

function extractTitleFromContent(content: string): string {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  const firstLine = content.split("\n")[0]?.trim();
  if (firstLine) return firstLine.substring(0, 50);

  return "无标题 Memo";
}

function generateExcerptFromContent(content: string): string {
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
