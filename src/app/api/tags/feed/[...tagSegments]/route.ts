import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { SITE } from "@/config/site";
import { db, initializeDB } from "@/lib/db";
import { extractTextSummary } from "@/lib/markdown-utils";
import { buildFeed, sanitizeLimit, shouldReturnNotModified, toAbsoluteUrl } from "@/lib/rss";
import { posts } from "@/lib/schema";
import { buildTagHref } from "@/lib/tag-href";
import { safeJsonParse, toMsTimestamp } from "@/lib/utils";

export const runtime = "nodejs";

function decodePathSegment(segment: string) {
  return decodeURIComponent(segment);
}

function buildTagPath(tagSegments: string[] | undefined) {
  return (tagSegments ?? [])
    .map(decodePathSegment)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

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

function buildHierarchicalTagFilter(tagPath: string) {
  // Tags are stored as a JSON string array, e.g. ["Geek/SMS","Geek/SMS/Child"].
  // We match:
  // - exact element: "Geek/SMS"
  // - hierarchical child: "Geek/SMS/<...>"
  const exact = like(posts.tags, `%"${tagPath}"%`);
  const childPrefix = like(posts.tags, `%"${tagPath}/%`);
  return or(exact, childPrefix);
}

async function loadTagFeedItems(tagPath: string, limit: number) {
  const rows = (await db
    .select()
    .from(posts)
    .where(
      and(
        inArray(posts.type, ["post", "memo"]),
        buildHierarchicalTagFilter(tagPath),
        eq(posts.public, true),
        sql`(${posts.type} <> 'post' OR ${posts.draft} = 0)`
      )
    )
    .orderBy(desc(posts.publishDate), desc(posts.id))
    .limit(limit)) as Array<typeof posts.$inferSelect>;

  return rows.map((post) => {
    const isMemo = (post.type || "").toLowerCase() === "memo";
    const link = `${toAbsoluteUrl(isMemo ? "/memos" : "/posts")}/${post.slug}`;
    const rawTags = safeJsonParse<string[]>(post.tags || "[]", []);
    const categories = Array.isArray(rawTags) ? rawTags.filter(Boolean) : [];
    const description = post.excerpt || extractTextSummary(post.body || "", isMemo ? 150 : 180);
    const updatedAt = post.updateDate ? toMsTimestamp(post.updateDate) : undefined;
    const publishedAt = post.publishDate ? toMsTimestamp(post.publishDate) : undefined;
    return {
      id: link,
      title: post.title || (isMemo ? description || `Memo ${post.slug}` : post.slug),
      link,
      description,
      authorName: post.author || SITE.author.name,
      authorEmail: SITE.author.email,
      categories: categories.length > 0 ? categories : normalizeTags(post.tags),
      image: post.image ? toAbsoluteUrl(post.image) : toAbsoluteUrl(SITE.images.default),
      publishedAt,
      updatedAt,
      enclosureUrl: post.image || undefined,
    };
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tagSegments?: string[] }> }
) {
  const { tagSegments } = await params;
  const tagPath = buildTagPath(tagSegments);
  if (!tagPath) {
    return new NextResponse("Tag not found", { status: 404 });
  }

  const url = new URL(request.url);
  const limit = sanitizeLimit(url.searchParams.get("limit") ?? 30, 30, 50);

  try {
    await initializeDB();

    const candidates = [tagPath, `#${tagPath}`];
    let items: Awaited<ReturnType<typeof loadTagFeedItems>> = [];

    for (const candidate of candidates) {
      const loaded = await loadTagFeedItems(candidate, limit);
      if (loaded.length > 0 || candidate === candidates.at(-1)) {
        items = loaded;
        break;
      }
    }

    const canonicalHref = buildTagHref(tagPath);
    const feedHref = `${canonicalHref}/feed.xml`;

    const built = buildFeed(
      {
        title: `${SITE.title} - #${tagPath}`,
        description: `标签 #${tagPath} 的最新内容（含子标签）`,
        id: toAbsoluteUrl(canonicalHref) || canonicalHref,
        link: toAbsoluteUrl(canonicalHref) || canonicalHref,
        language: "zh-CN",
        image: toAbsoluteUrl(SITE.images.default),
        favicon: toAbsoluteUrl(SITE.images.favicon),
        author: { name: SITE.author.name, email: SITE.author.email },
        feedLinks: {
          rss2: toAbsoluteUrl(feedHref) || feedHref,
        },
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
    console.error("Error generating hierarchical tag RSS:", error);
    return new NextResponse("Error generating tag RSS feed", { status: 500 });
  }
}
