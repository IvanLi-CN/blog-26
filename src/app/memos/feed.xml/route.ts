import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { SITE } from "@/config/site";
import {
  buildFeed,
  defaultBaseUrl,
  inferImageContentType,
  sanitizeLimit,
  shouldReturnNotModified,
  toAbsoluteUrl,
} from "@/lib/rss";
import { db, initializeDB } from "../../../lib/db";
import { extractTextSummary } from "../../../lib/markdown-utils";
import { posts } from "../../../lib/schema";
import { safeJsonParse, toMsTimestamp } from "../../../lib/utils";

export const runtime = "nodejs";

type Attachment = { path: string; contentType?: string; isImage?: boolean };

function pickFirstImageFromMetadata(metadata?: string | null): { url?: string; type?: string } {
  if (!metadata) return {};
  try {
    const meta = JSON.parse(metadata);
    const atts: Attachment[] = Array.isArray(meta.attachments) ? meta.attachments : [];
    const img = atts.find(
      (a) => a?.isImage || inferImageContentType(a?.path || "")?.startsWith("image/")
    );
    if (!img) return {};
    return { url: img.path, type: img.contentType || inferImageContentType(img.path) };
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = sanitizeLimit(url.searchParams.get("limit") ?? 30, 30, 50);
  const baseUrl = defaultBaseUrl;

  try {
    await initializeDB();

    const rows = (await db
      .select()
      .from(posts)
      .where(and(eq(posts.type, "memo"), eq(posts.public, true), eq(posts.draft, false)))
      .orderBy(desc(posts.publishDate))
      .limit(limit)) as Array<typeof posts.$inferSelect>;

    const items = rows.map((post) => {
      const link = `${baseUrl}/memos/${post.slug}`;
      const rawTags = safeJsonParse<string[]>(post.tags || "[]", []);
      const categories = Array.isArray(rawTags) ? rawTags.filter(Boolean) : [];
      const description = post.excerpt || extractTextSummary(post.body || "", 150);
      const updatedAt = post.updateDate ? toMsTimestamp(post.updateDate) : undefined;
      const publishedAt = post.publishDate ? toMsTimestamp(post.publishDate) : undefined;
      const enclosure = pickFirstImageFromMetadata(post.metadata);
      const image = post.image ? toAbsoluteUrl(post.image) : enclosure.url;
      return {
        id: link,
        title: post.title || description || `Memo ${post.slug}`,
        link,
        description,
        authorName: post.author || SITE.author.name,
        authorEmail: SITE.author.email,
        categories,
        image,
        publishedAt,
        updatedAt,
        enclosureUrl: enclosure.url,
        enclosureType: enclosure.type,
      };
    });

    const built = buildFeed(
      {
        title: `${SITE.title} - Memos`,
        description: "闪念与片段",
        id: `${baseUrl}/memos`,
        link: `${baseUrl}/memos`,
        language: "zh-CN",
        image: toAbsoluteUrl(SITE.images.default),
        favicon: toAbsoluteUrl(SITE.images.favicon),
        author: { name: SITE.author.name, email: SITE.author.email },
        feedLinks: { rss2: `${baseUrl}/memos/feed.xml` },
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
    console.error("Error generating memos RSS:", error);
    return new NextResponse("Error generating memos RSS feed", { status: 500 });
  }
}
