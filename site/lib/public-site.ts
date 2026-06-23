import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SITE } from "@/config/site";
import { extractPostCoverCandidate, isExternalImageUrl } from "@/lib/post-cover";
import {
  createEmptyPublicMediaCollection,
  type PublicMediaCollection,
  rewritePublicContentMediaUrls,
} from "@/lib/public-media";
import { getPublicSiteUrl, toPublicSitePath } from "@/lib/public-runtime-url";
import type {
  PublicPostRecord,
  PublicSnapshot,
  PublicTagSummary,
  PublicTagTimelineItem,
} from "@/public-site/snapshot";
import { getProjectDetailPath, projectCatalog } from "./projects";

let snapshotPromise: Promise<PublicSnapshot> | undefined;

type SnapshotRecordWithPath = {
  id?: string | null;
  slug: string;
  filePath?: string | null;
};

function getSnapshotRecordPath(record: SnapshotRecordWithPath) {
  const filePath = record.filePath?.trim() || record.id?.trim();
  if (!filePath) {
    throw new Error(`Public snapshot record ${record.slug} is missing a canonical file path`);
  }
  return filePath;
}

function normalizeSnapshotMedia(
  media: PublicMediaCollection | null | undefined
): PublicMediaCollection {
  if (!media || typeof media !== "object") {
    return createEmptyPublicMediaCollection();
  }

  return {
    primary: media.primary ?? null,
    cover: media.cover ?? null,
    content: Array.isArray(media.content) ? media.content : [],
    attachments: Array.isArray(media.attachments) ? media.attachments : [],
  };
}

type SnapshotTimelineRecord = PublicTagTimelineItem & {
  media?: PublicMediaCollection | null;
};

function normalizeSnapshotPaths(snapshot: PublicSnapshot): PublicSnapshot {
  const posts = snapshot.posts.map((post) => ({
    ...post,
    media: normalizeSnapshotMedia(post.media),
    filePath: getSnapshotRecordPath(post),
    body: rewritePublicContentMediaUrls(post.body, {
      kind: "post",
      slug: post.slug,
      filePath: getSnapshotRecordPath(post),
    }),
  }));
  const memos = snapshot.memos.map((memo) => ({
    ...memo,
    media: normalizeSnapshotMedia(memo.media),
    filePath: getSnapshotRecordPath(memo),
    content: rewritePublicContentMediaUrls(memo.content, {
      kind: "memo",
      slug: memo.slug,
      filePath: getSnapshotRecordPath(memo),
    }),
  }));
  const pathByTimelineKey = new Map<string, string>();

  for (const post of posts) {
    pathByTimelineKey.set(`post:${post.slug}`, post.filePath);
  }
  for (const memo of memos) {
    pathByTimelineKey.set(`memo:${memo.slug}`, memo.filePath);
  }

  const timelines = Object.fromEntries(
    Object.entries(snapshot.tags.timelines).map(([tagPath, items]) => [
      tagPath,
      items.map((item) => {
        const timelineItem = item as SnapshotTimelineRecord;
        const filePath =
          timelineItem.filePath?.trim() ||
          pathByTimelineKey.get(`${timelineItem.type}:${timelineItem.slug}`);
        if (!filePath) {
          throw new Error(
            `Public snapshot timeline item ${timelineItem.type}:${timelineItem.slug} is missing a canonical file path`
          );
        }
        return {
          ...timelineItem,
          media: normalizeSnapshotMedia(timelineItem.media),
          filePath,
          content:
            timelineItem.type === "memo" && typeof timelineItem.content === "string"
              ? rewritePublicContentMediaUrls(timelineItem.content, {
                  kind: "memo",
                  slug: timelineItem.slug,
                  filePath,
                })
              : timelineItem.content,
        };
      }),
    ])
  );

  return {
    ...snapshot,
    posts,
    memos,
    tags: {
      ...snapshot.tags,
      timelines,
    },
  };
}

export function getSiteUrl() {
  return getPublicSiteUrl() || SITE.url;
}

export function getSiteOrigin() {
  const siteUrl = getSiteUrl();
  try {
    return new URL(siteUrl).origin;
  } catch {
    return siteUrl.replace(/\/+$/, "");
  }
}

export function getCanonicalUrl(pathname = "/") {
  if (/^https?:\/\//.test(pathname)) {
    return pathname;
  }
  const siteUrl = getSiteUrl().replace(/\/+$/, "");
  return new URL(toPublicSitePath(pathname) ?? pathname, `${siteUrl}/`).toString();
}

export function toAbsoluteSiteUrl(pathname: string) {
  return getCanonicalUrl(pathname);
}

export function appendPublicAssetVersion(
  url: string | null | undefined,
  version: string | null | undefined
) {
  if (!url) return url ?? null;
  if (!version) return url;

  if (url.startsWith("/")) {
    const parsed = new URL(url, "https://public.invalid");
    if (!parsed.pathname.startsWith("/api/public/assets/")) return url;
    parsed.searchParams.set("v", version);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/api/public/assets/")) return url;
    parsed.searchParams.set("v", version);
    return parsed.toString();
  } catch {
    return url;
  }
}

function getSnapshotPath() {
  return resolve(
    process.cwd(),
    process.env.PUBLIC_SNAPSHOT_PATH || "site/generated/public-snapshot.json"
  );
}

export async function getSnapshot() {
  if (!snapshotPromise) {
    snapshotPromise = readFile(getSnapshotPath(), "utf8").then((raw) =>
      normalizeSnapshotPaths(JSON.parse(raw) as PublicSnapshot)
    );
  }
  return snapshotPromise;
}

export function __resetSnapshotForTests() {
  snapshotPromise = undefined;
}

export function getPostBySlug(snapshot: PublicSnapshot, slug: string) {
  return snapshot.posts.find((post) => post.slug === slug);
}

export function getMemoBySlug(snapshot: PublicSnapshot, slug: string) {
  return snapshot.memos.find((memo) => memo.slug === slug);
}

function getTopLevelContentRoot(filePath: string | null | undefined) {
  const normalized = filePath?.trim().replace(/^\/+/, "") ?? "";
  if (!normalized) return null;
  return normalized.split("/")[0] || null;
}

function normalizeTagSet(tags: string[]) {
  return new Set(tags.map((tag) => tag.trim()).filter(Boolean));
}

function countSharedTags(left: string[], right: string[]) {
  const rightSet = normalizeTagSet(right);
  return left.reduce((count, tag) => count + (rightSet.has(tag.trim()) ? 1 : 0), 0);
}

function getMeaningfulTags(tags: string[]) {
  const genericRoots = new Set(["Hardware", "HomeLab", "Ops", "Project", "Memos"]);
  return tags.map((tag) => tag.trim()).filter((tag) => tag && !genericRoots.has(tag));
}

function hasDisplayCover(post: PublicPostRecord) {
  const coverCandidate = extractPostCoverCandidate(post);
  return Boolean(coverCandidate && !isExternalImageUrl(coverCandidate));
}

function scoreRelatedPost(current: PublicPostRecord, candidate: PublicPostRecord) {
  const currentRoot = getTopLevelContentRoot(current.filePath);
  const candidateRoot = getTopLevelContentRoot(candidate.filePath);
  const sharedAllTags = countSharedTags(current.tags, candidate.tags);
  const sharedMeaningfulTags = countSharedTags(
    getMeaningfulTags(current.tags),
    getMeaningfulTags(candidate.tags)
  );

  let score = 0;
  if (currentRoot && candidateRoot && currentRoot === candidateRoot) {
    score += 100;
  }
  score += sharedMeaningfulTags * 20;
  score += sharedAllTags * 5;
  if (hasDisplayCover(candidate)) {
    score += 60;
  }

  if (candidate.publishDate <= current.publishDate) {
    score += 3;
  }

  return score;
}

export function getRelatedPosts(snapshot: PublicSnapshot, slug: string) {
  const currentPost = getPostBySlug(snapshot, slug);
  if (!currentPost) {
    return [];
  }

  const seenTitles = new Set<string>([currentPost.title.trim()]);

  return snapshot.posts
    .filter((candidate) => candidate.slug !== currentPost.slug)
    .filter((candidate) => !(candidate.filePath ?? "").includes(".sync-conflict-"))
    .filter((candidate) => candidate.title.trim() !== currentPost.title.trim())
    .sort((left, right) => {
      const scoreDiff = scoreRelatedPost(currentPost, right) - scoreRelatedPost(currentPost, left);
      if (scoreDiff !== 0) return scoreDiff;

      const dateDiff = right.publishDate.localeCompare(left.publishDate);
      if (dateDiff !== 0) return dateDiff;

      return left.title.localeCompare(right.title, "zh-Hans");
    })
    .filter((candidate) => {
      const normalizedTitle = candidate.title.trim();
      if (seenTitles.has(normalizedTitle)) {
        return false;
      }
      seenTitles.add(normalizedTitle);
      return true;
    })
    .slice(0, 4);
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
    media: post.media,
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
    media: memo.media,
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

  for (const project of projectCatalog) {
    pages.push(getProjectDetailPath(project.slug));
  }

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
    const image =
      item.media?.cover?.variants.cover ?? item.media?.primary?.variants.content ?? item.image;
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
      image: image ?? undefined,
      updatedAt: new Date(item.publishDate),
      publishedAt: new Date(item.publishDate),
    };
  });
}
