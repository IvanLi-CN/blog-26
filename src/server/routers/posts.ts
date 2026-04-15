import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";
import { buildEmbeddingInput, hashEmbeddingInput } from "@/lib/ai/embeddings";
import { EmbeddingsRepository } from "@/lib/ai/embeddings-repo";
import { db } from "../../lib/db";
import { posts } from "../../lib/schema";
import { publicProcedure, router } from "../trpc";

const listPostsSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(50).default(10),
  search: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  published: z.boolean().default(true),
});

const getPostSchema = z.object({
  slug: z.string(),
});

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
      }
    } catch {
      // ignore JSON parse errors and fall back to comma-separated parsing
    }

    return trimmed
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  return [];
}

export const postsRouter = router({
  // 获取文章列表
  list: publicProcedure.input(listPostsSchema).query(async ({ input }) => {
    const { page, limit, search, category, tag, published } = input;
    const offset = (page - 1) * limit;

    try {
      // 构建查询条件
      const conditions = [] as any[];

      // 只显示文章类型的内容，排除闪念(memo)和其他类型
      conditions.push(eq(posts.type, "post"));

      // 只显示已发布的文章（除非明确指定）
      if (published) {
        conditions.push(eq(posts.draft, false));
        conditions.push(eq(posts.public, true));
      }

      // 搜索条件
      if (search) {
        conditions.push(like(posts.title, `%${search}%`));
      }

      // 分类过滤
      if (category) {
        conditions.push(eq(posts.category, category));
      }

      // 标签过滤
      if (tag) {
        conditions.push(like(posts.tags, `%${tag}%`));
      }

      // 可选：仅允许特定内容源（通过环境变量控制）
      const sourcesEnv =
        process.env.CONTENT_SOURCES || (process.env.FORCE_WEBDAV_ONLY === "true" ? "webdav" : "");
      const allowedSources = sourcesEnv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (allowedSources.length > 0) {
        conditions.push(inArray(posts.source, allowedSources));
      }

      // 获取文章列表
      const postsQuery = db
        .select({
          id: posts.id,
          slug: posts.slug,
          title: posts.title,
          excerpt: posts.excerpt,
          body: posts.body,
          publishDate: posts.publishDate,
          updateDate: posts.updateDate,
          category: posts.category,
          tags: posts.tags,
          author: posts.author,
          image: posts.image,
          draft: posts.draft,
          public: posts.public,
          dataSource: posts.dataSource,
          contentHash: posts.contentHash,
        })
        .from(posts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(posts.publishDate))
        .limit(limit)
        .offset(offset);

      const postsList = await postsQuery;

      const normalizedPosts = postsList.map((post) => ({
        ...post,
        tags: normalizeTags(post.tags),
      }));

      // 计算每条记录是否已按当前模型完成向量化（哈希匹配且存在向量）
      const modelName = process.env.EMBEDDING_MODEL_NAME || "BAAI/bge-m3";
      const postsWithVectorStatus = await Promise.all(
        normalizedPosts.map(async (p) => {
          try {
            // 使用与向量化相同的拼接与哈希算法，确保校验口径一致
            const embeddingInput = buildEmbeddingInput({
              title: p.title,
              excerpt: p.excerpt,
              body: p.body,
            });
            const embeddingHash = hashEmbeddingInput(embeddingInput);
            const status = await EmbeddingsRepository.getVectorizationStatus(
              p.id,
              modelName,
              embeddingHash
            );
            return { ...p, isVectorized: status === "indexed" };
          } catch {
            return { ...p, isVectorized: false };
          }
        })
      );

      // 获取总数
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = totalResult[0]?.count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        posts: postsWithVectorStatus,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      console.error("获取文章列表失败:", error);
      throw new Error("获取文章列表失败");
    }
  }),

  // 获取单个文章
  get: publicProcedure.input(getPostSchema).query(async ({ input, ctx }) => {
    let { slug } = input;
    const isAdminPreview = ctx.isAdmin && ctx.req.headers.get("x-admin-preview") === "1";

    try {
      // 解码 URL 编码的 slug
      slug = decodeURIComponent(slug);

      console.log("🔍 [posts.get] 开始查询文章:", slug);

      const conditions = [eq(posts.slug, slug), eq(posts.type, "post")] as any[];

      if (!isAdminPreview) {
        conditions.push(eq(posts.draft, false), eq(posts.public, true));
      }

      conditions.push(
        (() => {
          const sourcesEnv =
            process.env.CONTENT_SOURCES ||
            (process.env.FORCE_WEBDAV_ONLY === "true" ? "webdav" : "");
          const allowedSources = sourcesEnv
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          return allowedSources.length > 0 ? inArray(posts.source, allowedSources) : sql`1=1`;
        })()
      );

      const post = await db
        .select()
        .from(posts)
        .where(and(...conditions))
        .limit(1);

      console.log("🔍 [posts.get] 查询结果:", post.length > 0 ? "找到文章" : "未找到文章");

      if (!post || post.length === 0) {
        throw new Error("文章不存在");
      }

      console.log("🔍 [posts.get] 开始处理文章数据...");
      console.log("🔍 [posts.get] 文章字段检查:", {
        hasId: !!post[0].id,
        hasSlug: !!post[0].slug,
        hasTags: !!post[0].tags,
        hasMetadata: !!post[0].metadata,
        tagsType: typeof post[0].tags,
        metadataType: typeof post[0].metadata,
      });

      // 解析 JSON 字段并返回处理后的数据
      const processedPost = { ...post[0] };

      try {
        // 解析 tags 字段
        processedPost.tags = normalizeTags(processedPost.tags);

        // 解析 metadata 字段
        if (processedPost.metadata) {
          console.log("🔍 [posts.get] 尝试解析 metadata...");
          processedPost.metadata = JSON.parse(processedPost.metadata);
          console.log("🔍 [posts.get] metadata 解析成功");
        } else {
          processedPost.metadata = "{}";
        }
      } catch (parseError) {
        console.error("🔍 [posts.get] JSON 解析错误:", parseError);
        // 如果解析失败，设置默认值
        processedPost.tags = [];
        processedPost.metadata = "{}";
      }

      console.log("🔍 [posts.get] 返回的文章数据:", {
        id: processedPost.id,
        filePath: processedPost.filePath,
        hasFilePath: !!processedPost.filePath,
        tagsType: typeof processedPost.tags,
        tagsValue: processedPost.tags,
      });

      return processedPost;
    } catch (error) {
      console.error("获取文章失败:", error);
      throw new Error("文章不存在或已被删除");
    }
  }),

  // 获取相关文章
  related: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        limit: z.number().min(1).max(10).default(5),
      })
    )
    .query(async ({ input }) => {
      const { slug, limit } = input;

      try {
        // 先获取当前文章的分类和标签
        const currentPost = await db
          .select({
            category: posts.category,
            tags: posts.tags,
          })
          .from(posts)
          .where(eq(posts.slug, slug))
          .limit(1);

        if (!currentPost || currentPost.length === 0) {
          return [];
        }

        const { category } = currentPost[0];

        // 构建相关文章查询条件
        const conditions = [
          eq(posts.draft, false),
          eq(posts.public, true),
          // 排除当前文章
          sql`${posts.slug} != ${slug}`,
        ];

        // 优先显示同分类的文章
        if (category) {
          conditions.push(eq(posts.category, category));
        }

        const relatedPosts = await db
          .select({
            id: posts.id,
            slug: posts.slug,
            title: posts.title,
            excerpt: posts.excerpt,
            body: posts.body,
            publishDate: posts.publishDate,
            category: posts.category,
            tags: posts.tags,
            author: posts.author,
            image: posts.image,
            dataSource: posts.dataSource,
          })
          .from(posts)
          .where(
            and(
              ...conditions,
              (() => {
                const sourcesEnv =
                  process.env.CONTENT_SOURCES ||
                  (process.env.FORCE_WEBDAV_ONLY === "true" ? "webdav" : "");
                const allowedSources = sourcesEnv
                  .split(",")
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0);
                return allowedSources.length > 0 ? inArray(posts.source, allowedSources) : sql`1=1`;
              })()
            )
          )
          .orderBy(desc(posts.publishDate))
          .limit(limit);

        return relatedPosts.map((post) => ({
          ...post,
          tags: normalizeTags(post.tags),
        }));
      } catch (error) {
        console.error("获取相关文章失败:", error);
        return [];
      }
    }),

  // 获取文章统计
  stats: publicProcedure.query(async () => {
    try {
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(and(eq(posts.draft, false), eq(posts.public, true)));

      const categoriesResult = await db
        .select({
          category: posts.category,
          count: sql<number>`count(*)`,
        })
        .from(posts)
        .where(and(eq(posts.draft, false), eq(posts.public, true)))
        .groupBy(posts.category);

      return {
        total: totalResult[0]?.count || 0,
        categories: categoriesResult
          .filter((c) => c.category)
          .map((c) => ({
            name: c.category,
            count: c.count,
          })),
      };
    } catch (error) {
      console.error("获取文章统计失败:", error);
      return {
        total: 0,
        categories: [],
      };
    }
  }),
});
