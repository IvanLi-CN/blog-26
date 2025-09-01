import { TRPCError } from "@trpc/server";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../lib/db";
import { posts } from "../../../lib/schema";
import { adminProcedure, createTRPCRouter } from "../../trpc";

// 输入验证 schemas
const getPostsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["all", "published", "draft"]).default("all"),
  sortBy: z.enum(["publishDate", "updateDate", "title"]).default("publishDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const createPostSchema = z.object({
  title: z.string().min(1, "标题不能为空"),
  body: z.string().min(1, "内容不能为空"),
  slug: z.string().min(1, "Slug 不能为空"),
  excerpt: z.string().optional(),
  type: z.string().default("post"),
  draft: z.boolean().default(true),
  public: z.boolean().default(true),
});

const updatePostSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "标题不能为空").optional(),
  body: z.string().min(1, "内容不能为空").optional(),
  slug: z.string().min(1, "Slug 不能为空").optional(),
  excerpt: z.string().optional(),
  type: z.string().optional(),
  draft: z.boolean().optional(),
  public: z.boolean().optional(),
});

const deletePostSchema = z.object({
  id: z.string(),
});

const uploadImageSchema = z.object({
  filename: z.string().min(1, "文件名不能为空"),
  content: z.string().min(1, "文件内容不能为空"), // Base64 encoded
  contentType: z.string().optional(),
});

export const adminPostsRouter = createTRPCRouter({
  // 获取文章列表
  list: adminProcedure.input(getPostsSchema).query(async ({ input }) => {
    const { page, limit, search, status, sortBy, sortOrder } = input;
    const offset = (page - 1) * limit;

    try {
      // 构建查询条件
      const conditions = [];

      // 只显示文章类型的内容，排除闪念(memo)和其他类型
      conditions.push(eq(posts.type, "post"));

      // 搜索条件
      if (search) {
        conditions.push(
          or(
            like(posts.title, `%${search}%`),
            like(posts.body, `%${search}%`),
            like(posts.slug, `%${search}%`)
          )
        );
      }

      // 状态过滤
      if (status === "published") {
        conditions.push(and(eq(posts.draft, false), eq(posts.public, true)));
      } else if (status === "draft") {
        conditions.push(eq(posts.draft, true));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // 排序字段映射
      const sortField = {
        publishDate: posts.publishDate,
        updateDate: posts.updateDate,
        title: posts.title,
      }[sortBy];

      // 获取文章列表
      const postsList = await db
        .select()
        .from(posts)
        .where(whereClause)
        .orderBy(sortOrder === "desc" ? desc(sortField) : sortField)
        .limit(limit)
        .offset(offset);

      // 获取总数
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(whereClause);

      const total = totalResult[0]?.count || 0;

      return {
        posts: postsList,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error("获取文章列表失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取文章列表失败",
      });
    }
  }),

  // 获取单个文章
  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    try {
      const post = await db.select().from(posts).where(eq(posts.id, input.id)).get();

      if (!post) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在",
        });
      }

      return post;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("获取文章失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取文章失败",
      });
    }
  }),

  // 通过 slug 获取文章
  getBySlug: adminProcedure.input(z.object({ slug: z.string() })).query(async ({ input }) => {
    try {
      const post = await db.select().from(posts).where(eq(posts.slug, input.slug)).get();

      if (!post) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在",
        });
      }

      return post;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("通过 slug 获取文章失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "获取文章失败",
      });
    }
  }),

  // 创建文章
  create: adminProcedure.input(createPostSchema).mutation(async ({ input }) => {
    try {
      const now = Date.now();
      const newPost = {
        id: `post-${now}`,
        ...input,
        publishDate: now,
        updateDate: now,
        contentHash: `hash-${now}`,
      };

      await db.insert(posts).values(newPost);

      return {
        success: true,
        message: "文章创建成功",
        post: newPost,
      };
    } catch (error) {
      console.error("创建文章失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "创建文章失败",
      });
    }
  }),

  // 更新文章
  update: adminProcedure.input(updatePostSchema).mutation(async ({ input }) => {
    const { id, ...updateData } = input;

    try {
      // 检查文章是否存在
      const existingPost = await db.select().from(posts).where(eq(posts.id, id)).get();

      if (!existingPost) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在",
        });
      }

      // 更新文章
      const updatedData = {
        ...updateData,
        updateDate: Date.now(),
      };

      await db.update(posts).set(updatedData).where(eq(posts.id, id));

      return {
        success: true,
        message: "文章更新成功",
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("更新文章失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "更新文章失败",
      });
    }
  }),

  // 删除文章
  delete: adminProcedure.input(deletePostSchema).mutation(async ({ input }) => {
    try {
      // 检查文章是否存在
      const existingPost = await db.select().from(posts).where(eq(posts.id, input.id)).get();

      if (!existingPost) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "文章不存在",
        });
      }

      // 删除文章
      await db.delete(posts).where(eq(posts.id, input.id));

      return {
        success: true,
        message: "文章删除成功",
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("删除文章失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "删除文章失败",
      });
    }
  }),

  // 批量操作
  batchUpdate: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        action: z.enum(["publish", "unpublish", "delete"]),
      })
    )
    .mutation(async ({ input }) => {
      const { ids, action } = input;

      try {
        let _result: unknown;

        switch (action) {
          case "publish":
            _result = await db
              .update(posts)
              .set({ draft: false, public: true, updateDate: Date.now() })
              .where(or(...ids.map((id) => eq(posts.id, id))));
            break;

          case "unpublish":
            _result = await db
              .update(posts)
              .set({ draft: true, updateDate: Date.now() })
              .where(or(...ids.map((id) => eq(posts.id, id))));
            break;

          case "delete":
            _result = await db.delete(posts).where(or(...ids.map((id) => eq(posts.id, id))));
            break;

          default:
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "无效的操作类型",
            });
        }

        return {
          success: true,
          message: `批量${action === "publish" ? "发布" : action === "unpublish" ? "取消发布" : "删除"}成功`,
          affectedCount: ids.length,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("批量操作失败:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "批量操作失败",
        });
      }
    }),

  // 上传图片
  uploadImage: adminProcedure.input(uploadImageSchema).mutation(async ({ input }) => {
    const { filename, content, contentType } = input;

    try {
      // 验证文件类型
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      if (contentType && !allowedTypes.includes(contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不支持的文件类型。支持的类型：JPEG, PNG, GIF, WebP",
        });
      }

      // 解码 Base64 内容
      const buffer = Buffer.from(content, "base64");

      // 验证文件大小 (5MB)
      const maxSize = 5 * 1024 * 1024;
      if (buffer.length > maxSize) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "文件太大。最大支持 5MB",
        });
      }

      // 生成安全的文件名
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const extension = filename.split(".").pop() || "jpg";
      const safeFilename = `${timestamp}-${randomString}.${extension}`;

      // 确保上传目录存在
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { existsSync } = await import("node:fs");

      const uploadDir = join(process.cwd(), "public", "uploads", "images");
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      // 保存文件
      const filePath = join(uploadDir, safeFilename);
      await writeFile(filePath, buffer);

      // 返回文件 URL
      const fileUrl = `/uploads/images/${safeFilename}`;

      return {
        success: true,
        url: fileUrl,
        filename: safeFilename,
        size: buffer.length,
        type: contentType || "image/jpeg",
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("图片上传失败:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "图片上传失败",
      });
    }
  }),
});
