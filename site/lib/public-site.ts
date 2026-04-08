import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SITE } from "@/config/site";
import type {
  PublicPostRecord,
  PublicSnapshot,
  PublicTagSummary,
  PublicTagTimelineItem,
} from "@/public-site/snapshot";

const snapshotPath = resolve(
  process.cwd(),
  process.env.PUBLIC_SNAPSHOT_PATH || "site/generated/public-snapshot.json"
);

let snapshotPromise: Promise<PublicSnapshot> | undefined;

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || SITE.url;
}

export function getCanonicalUrl(pathname = "/") {
  return new URL(pathname, getSiteUrl()).toString();
}

export async function getSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = readFile(snapshotPath, "utf8").then(
      (raw) => JSON.parse(raw) as PublicSnapshot
    );
  }
  return snapshotPromise;
}

export function getPostBySlug(snapshot: PublicSnapshot, slug: string) {
  return snapshot.posts.find((post) => post.slug === slug);
}

export function getMemoBySlug(snapshot: PublicSnapshot, slug: string) {
  return snapshot.memos.find((memo) => memo.slug === slug);
}

export function getRelatedPosts(snapshot: PublicSnapshot, slug: string) {
  const relatedSlugs = snapshot.relatedPosts[slug] ?? [];
  return relatedSlugs
    .map((candidateSlug) => snapshot.posts.find((post) => post.slug === candidateSlug))
    .filter((post): post is PublicPostRecord => Boolean(post));
}

export function getGroupedTags(snapshot: PublicSnapshot) {
  const groupMeta = snapshot.tags.groups ?? [];
  const tagToGroup = new Map<string, { key: string; title: string }>();
  for (const group of groupMeta) {
    for (const tag of group.tags) {
      tagToGroup.set(tag, { key: group.key, title: group.title });
    }
  }

  const grouped = new Map<string, { title: string; items: PublicTagSummary[] }>();
  const ensureGroup = (key: string, title: string) => {
    const existing = grouped.get(key);
    if (existing) return existing;

    const created = { title, items: [] as PublicTagSummary[] };
    grouped.set(key, created);
    return created;
  };

  for (const summary of snapshot.tags.summaries) {
    const meta = tagToGroup.get(summary.name);
    if (meta) {
      ensureGroup(meta.key, meta.title).items.push(summary);
    } else {
      ensureGroup("other", "Other").items.push(summary);
    }
  }

  const collator = new Intl.Collator("zh-Hans", { numeric: true, sensitivity: "base" });
  const ordered = groupMeta
    .map((group) => ({
      key: group.key,
      title: group.title,
      items: [...(grouped.get(group.key)?.items ?? [])].sort((a, b) =>
        collator.compare(a.lastSegment, b.lastSegment)
      ),
    }))
    .filter((group) => group.items.length > 0);

  const other = grouped.get("other");
  if (other && other.items.length > 0) {
    ordered.push({
      key: "other",
      title: other.title,
      items: [...other.items].sort((a, b) => collator.compare(a.lastSegment, b.lastSegment)),
    });
  }

  return ordered;
}

export function getTagTimeline(snapshot: PublicSnapshot, tagPath: string) {
  return snapshot.tags.timelines[tagPath] ?? [];
}

export function buildHomeTimeline(snapshot: PublicSnapshot) {
  const postItems = snapshot.posts.slice(0, 10).map((post) => ({
    type: "post" as const,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: null,
    publishDate: post.publishDate,
    tags: post.tags,
    image: post.image,
    dataSource: post.dataSource,
    filePath: post.filePath,
  }));

  const memoItems = snapshot.memos.slice(0, 5).map((memo) => ({
    type: "memo" as const,
    slug: memo.slug,
    title: memo.title,
    excerpt: memo.excerpt,
    content: memo.content,
    publishDate: memo.publishedAt ?? memo.createdAt,
    tags: memo.tags,
    image: memo.image,
    dataSource: memo.dataSource,
    filePath: memo.filePath,
  }));

  return [...postItems, ...memoItems]
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate))
    .slice(0, 15);
}

export function getStaticPageEntries(snapshot: PublicSnapshot) {
  const pages = [
    "/",
    "/about",
    "/posts",
    "/memos",
    "/tags",
    "/projects",
    "/search",
    "/feed.xml",
    "/rss.xml",
    "/atom.xml",
    "/feed.json",
  ];

  for (const post of snapshot.posts) {
    pages.push(`/posts/${post.slug}`);
  }
  for (const memo of snapshot.memos) {
    pages.push(`/memos/${memo.slug}`);
  }
  for (const tag of snapshot.tags.summaries) {
    pages.push(`/tags/${tag.segments.map((segment) => encodeURIComponent(segment)).join("/")}`);
  }
  return pages;
}

export function pickTagIconSvg(
  tag: string,
  iconMap: Record<string, string | null>,
  iconSvgMap: Record<string, string | null>
) {
  const iconId = iconMap[tag] ?? "tabler:hash";
  return {
    iconId,
    iconSvg: iconSvgMap[iconId] ?? iconSvgMap["tabler:hash"] ?? null,
  };
}

export function buildTagFeedItems(
  _tagPath: string,
  items: PublicTagTimelineItem[],
  snapshot: PublicSnapshot
) {
  return items.map((item) => {
    const path = item.type === "memo" ? `/memos/${item.slug}` : `/posts/${item.slug}`;
    const source =
      item.type === "memo"
        ? (snapshot.memos.find((memo) => memo.slug === item.slug)?.content ?? item.content ?? "")
        : (snapshot.posts.find((post) => post.slug === item.slug)?.body ?? item.excerpt ?? "");
    return {
      id: getCanonicalUrl(path),
      title: item.title,
      link: getCanonicalUrl(path),
      description: item.excerpt ?? undefined,
      content: source,
      authorName: SITE.author.name,
      authorEmail: SITE.author.email,
      categories: item.tags,
      image: item.image ?? undefined,
      updatedAt: new Date(item.publishDate),
      publishedAt: new Date(item.publishDate),
    };
  });
}
