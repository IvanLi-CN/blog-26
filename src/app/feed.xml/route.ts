import { and, desc, eq, like } from "drizzle-orm";
import { NextResponse } from "next/server";
import { SITE } from "@/config/site";
import {
  buildFeed,
  defaultBaseUrl,
  sanitizeLimit,
  shouldReturnNotModified,
  toAbsoluteUrl,
} from "@/lib/rss";
import { db, initializeDB } from "../../lib/db";
import { extractTextSummary } from "../../lib/markdown-utils";
import { posts } from "../../lib/schema";
import { safeJsonParse, toMsTimestamp } from "../../lib/utils";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = sanitizeLimit(url.searchParams.get("limit") ?? 30, 30, 50);
  const baseUrl = defaultBaseUrl;

  try {
    await initializeDB();
    // 获取最新公开文章（排除草稿）
    const recentPosts = (await db
      .select()
      .from(posts)
      .where(and(eq(posts.public, true), eq(posts.draft, false)))
      .orderBy(desc(posts.publishDate))
      .limit(limit)) as Array<typeof posts.$inferSelect>;

    const items = recentPosts.map((post) => {
      const link = `${baseUrl}/posts/${post.slug}`;
      const rawTags = safeJsonParse<string[]>(post.tags || "[]", []);
      const categories = Array.isArray(rawTags) ? rawTags.filter(Boolean) : [];
      const description = post.excerpt || extractTextSummary(post.body || "", 180);
      const updatedAt = post.updateDate ? toMsTimestamp(post.updateDate) : undefined;
      const publishedAt = post.publishDate ? toMsTimestamp(post.publishDate) : undefined;
      return {
        id: link,
        title: post.title,
        link,
        description,
        authorName: post.author || SITE.author.name,
        authorEmail: SITE.author.email,
        categories,
        image: post.image ? toAbsoluteUrl(post.image) : SITE.images.default,
        publishedAt,
        updatedAt,
        // Treat cover image as enclosure when image exists
        enclosureUrl: post.image || undefined,
      };
    });

    const built = buildFeed(
      {
        title: SITE.title,
        description: SITE.description,
        id: baseUrl,
        link: baseUrl,
        language: "zh-CN",
        image: toAbsoluteUrl(SITE.images.default),
        favicon: toAbsoluteUrl(SITE.images.favicon),
        author: { name: SITE.author.name, email: SITE.author.email },
        feedLinks: { rss2: `${baseUrl}/feed.xml` },
      },
      items,
      { formats: { rss: true } }
    );

    if (shouldReturnNotModified(request, built.etag, built.lastModified)) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
          ETag: built.etag,
          "Last-Modified": built.lastModified.toUTCString(),
        },
      });
    }

    return new NextResponse(built.rss, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        ETag: built.etag,
        "Last-Modified": built.lastModified.toUTCString(),
      },
    });
  } catch (error) {
    console.error("Error generating RSS feed:", error);
    return new NextResponse("Error generating RSS feed", { status: 500 });
  }
}
