import { and, desc, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
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

export const postsRouter = router({
  // 获取文章列表
  list: publicProcedure.input(listPostsSchema).query(async ({ input }) => {
    const { page, limit, search, category, tag, published } = input;
    const offset = (page - 1) * limit;

    try {
      // 构建查询条件
      const conditions = [];

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
        })
        .from(posts)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(posts.publishDate))
        .limit(limit)
        .offset(offset);

      const postsList = await postsQuery;

      // 获取总数
      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(posts)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = totalResult[0]?.count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        posts: postsList,
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
  get: publicProcedure.input(getPostSchema).query(async ({ input }) => {
    let { slug } = input;

    try {
      // 解码 URL 编码的 slug
      slug = decodeURIComponent(slug);

      const post = await db
        .select()
        .from(posts)
        .where(and(eq(posts.slug, slug), eq(posts.draft, false), eq(posts.public, true)))
        .limit(1);

      if (!post || post.length === 0) {
        throw new Error("文章不存在");
      }

      return post[0];
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
          })
          .from(posts)
          .where(and(...conditions))
          .orderBy(desc(posts.publishDate))
          .limit(limit);

        return relatedPosts;
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
