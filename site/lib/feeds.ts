import { SITE } from "@/config/site";
import { resolveImagePath } from "@/lib/image-utils";
import { type BuiltFeed, buildFeed } from "@/lib/rss";
import type { PublicSnapshot } from "@/public-site/snapshot";
import { buildTagFeedItems, getCanonicalUrl, getSiteUrl, toAbsoluteSiteUrl } from "./public-site";
import { toPublicAssetUrl } from "./runtime-urls";

type FeedFormat = "rss" | "atom" | "json";

function buildMeta(feedPath: string) {
  const baseUrl = getSiteUrl();
  return {
    title: SITE.title,
    description: SITE.description,
    id: baseUrl,
    link: baseUrl,
    language: "zh-CN",
    image: toAbsoluteSiteUrl(SITE.images.default),
    favicon: toAbsoluteSiteUrl(SITE.images.favicon),
    author: { name: SITE.author.name, email: SITE.author.email },
    feedLinks:
      feedPath === "/atom.xml"
        ? { atom1: getCanonicalUrl(feedPath) }
        : feedPath === "/feed.json"
          ? { json1: getCanonicalUrl(feedPath) }
          : { rss2: getCanonicalUrl(feedPath) },
  };
}

function buildOptions(format: FeedFormat) {
  return {
    formats: {
      rss: format === "rss",
      atom: format === "atom",
      json: format === "json",
    },
  };
}

function resolveContentImageUrl(
  image: string | null | undefined,
  dataSource: string | null | undefined,
  filePath: string | null | undefined,
  fallbackPath: string
) {
  const resolved = resolveImagePath(
    image || undefined,
    (dataSource?.includes("local") ? "local" : "webdav") as "local" | "webdav",
    filePath || fallbackPath
  );
  return toPublicAssetUrl(resolved ?? image ?? undefined) ?? undefined;
}

export function buildSiteFeed(snapshot: PublicSnapshot, format: FeedFormat): BuiltFeed {
  const items = snapshot.posts.slice(0, 30).map((post) => {
    const imageUrl = resolveContentImageUrl(
      post.image,
      post.dataSource,
      post.filePath,
      `blog/${post.slug}.md`
    );
    return {
      id: getCanonicalUrl(`/posts/${post.slug}`),
      title: post.title,
      link: getCanonicalUrl(`/posts/${post.slug}`),
      description: post.excerpt ?? undefined,
      content: post.body,
      authorName: post.author ?? SITE.author.name,
      authorEmail: SITE.author.email,
      categories: post.tags,
      image: imageUrl,
      publishedAt: new Date(post.publishDate),
      updatedAt: new Date(post.updateDate ?? post.publishDate),
      enclosureUrl: imageUrl,
    };
  });

  const feedPath = format === "atom" ? "/atom.xml" : format === "json" ? "/feed.json" : "/feed.xml";
  return buildFeed(buildMeta(feedPath), items, buildOptions(format));
}

export function buildMemosFeed(snapshot: PublicSnapshot): BuiltFeed {
  const items = snapshot.memos.slice(0, 30).map((memo) => {
    const imageUrl = resolveContentImageUrl(
      memo.image,
      memo.dataSource,
      memo.filePath,
      `Memos/${memo.slug}.md`
    );
    return {
      id: getCanonicalUrl(`/memos/${memo.slug}`),
      title: memo.title,
      link: getCanonicalUrl(`/memos/${memo.slug}`),
      description: memo.excerpt ?? undefined,
      content: memo.content,
      authorName: SITE.author.name,
      authorEmail: SITE.author.email,
      categories: memo.tags,
      image: imageUrl,
      publishedAt: new Date(memo.publishedAt ?? memo.createdAt),
      updatedAt: new Date(memo.updatedAt ?? memo.publishedAt ?? memo.createdAt),
    };
  });

  return buildFeed(
    {
      ...buildMeta("/memos/feed.xml"),
      title: `${SITE.title} · Memos`,
      description: "公开 Memos 时间线订阅",
    },
    items,
    buildOptions("rss")
  );
}

export function buildTagFeed(snapshot: PublicSnapshot, tagPath: string): BuiltFeed {
  const items = buildTagFeedItems(tagPath, snapshot.tags.timelines[tagPath] ?? [], snapshot).slice(
    0,
    30
  );
  return buildFeed(
    {
      ...buildMeta(`/tags/${tagPath}/feed.xml`),
      title: `${SITE.title} · #${tagPath}`,
      description: `标签 #${tagPath} 的公开订阅`,
    },
    items,
    buildOptions("rss")
  );
}
