import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, initializeDB } from "../../lib/db";
import { posts } from "../../lib/schema";
import { toMsTimestamp } from "../../lib/utils";
export const runtime = "nodejs";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:25090";

  try {
    await initializeDB();
    // 获取最新的20篇公开文章
    const recentPosts = await db
      .select()
      .from(posts)
      .where(eq(posts.public, true))
      .orderBy(desc(posts.publishDate))
      .limit(20);

    const rssItems = recentPosts
      .map((post) => {
        const postUrl = `${baseUrl}/posts/${post.slug}`;
        const pubDate = new Date(toMsTimestamp(post.publishDate)).toUTCString();

        return `
    <item>
      <title><![CDATA[${post.title}]]></title>
      <description><![CDATA[${post.excerpt || post.title}]]></description>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      ${post.author ? `<author>noreply@ivanli.cc (${post.author})</author>` : ""}
      ${post.category ? `<category><![CDATA[${post.category}]]></category>` : ""}
      ${post.image ? `<enclosure url="${post.image.startsWith("http") ? post.image : baseUrl + post.image}" type="image/jpeg" />` : ""}
    </item>`;
      })
      .join("");

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title><![CDATA[Ivan's Blog]]></title>
    <description><![CDATA[Ivan Li 的个人博客，分享技术文章、项目经验和思考]]></description>
    <link>${baseUrl}</link>
    <language>zh-CN</language>
    <managingEditor>noreply@ivanli.cc (Ivan Li)</managingEditor>
    <webMaster>noreply@ivanli.cc (Ivan Li)</webMaster>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <generator>Next.js Blog</generator>
    <image>
      <url>${baseUrl}/logo.png</url>
      <title><![CDATA[Ivan's Blog]]></title>
      <link>${baseUrl}</link>
      <width>512</width>
      <height>512</height>
    </image>
    ${rssItems}
  </channel>
</rss>`;

    return new NextResponse(rssXml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("Error generating RSS feed:", error);
    return new NextResponse("Error generating RSS feed", { status: 500 });
  }
}
