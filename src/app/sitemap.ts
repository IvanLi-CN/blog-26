import { eq } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { db, initializeDB } from "../lib/db";
import { posts } from "../lib/schema";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:25090";

  // 静态页面
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/posts`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    },
  ];

  try {
    // 确保数据库已初始化
    await initializeDB();

    // 获取所有公开的文章
    const publishedPosts = await db
      .select({
        slug: posts.slug,
        publishDate: posts.publishDate,
        updateDate: posts.updateDate,
      })
      .from(posts)
      .where(eq(posts.public, true));

    // 文章页面
    const postPages = publishedPosts.map((post) => ({
      url: `${baseUrl}/posts/${post.slug}`,
      lastModified: post.updateDate
        ? new Date(post.updateDate < 1_000_000_000_000 ? post.updateDate * 1000 : post.updateDate)
        : new Date(
            post.publishDate < 1_000_000_000_000 ? post.publishDate * 1000 : post.publishDate
          ),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    return [...staticPages, ...postPages];
  } catch (error) {
    console.error("生成 sitemap 时出错:", error);
    // 如果数据库出错，至少返回静态页面
    return staticPages;
  }
}
