import { and, desc, eq } from "drizzle-orm";
import { SITE } from "@/config/site";
import { db, initializeDB } from "@/lib/db";
import { extractTextSummary } from "@/lib/markdown-utils";
import { posts } from "@/lib/schema";
import { parseContentTags } from "@/lib/tag-parser";
import { safeJsonParse, toMsTimestamp } from "@/lib/utils";
import { readTagGroupsFromDB } from "@/server/services/tag-groups";
import { resolveTagIconSvgsForTags } from "@/server/services/tag-icon-ssr";
import { getAllCategoryIcons } from "@/server/services/tag-icons";
import { getTagSummaries } from "@/server/services/tag-service";

export interface PublicPostRecord {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  publishDate: string;
  updateDate: string | null;
  category: string | null;
  tags: string[];
  author: string | null;
  image: string | null;
  dataSource: string | null;
  filePath: string | null;
  metadata: Record<string, unknown>;
}

export interface PublicMemoRecord {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  tags: string[];
  inlineTags: string[];
  isPublic: boolean;
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  dataSource: string | null;
  filePath: string | null;
  image: string | null;
}

export interface PublicTagSummary {
  name: string;
  segments: string[];
  lastSegment: string;
  count: number;
}

export interface PublicTagTimelineItem {
  type: "post" | "memo";
  slug: string;
  title: string;
  excerpt: string | null;
  content: string | null;
  publishDate: string;
  tags: string[];
  image: string | null;
  dataSource: string | null;
}

export interface PublicSnapshot {
  generatedAt: string;
  site: typeof SITE;
  stats: {
    totalPosts: number;
    categories: Array<{ name: string; count: number }>;
  };
  posts: PublicPostRecord[];
  memos: PublicMemoRecord[];
  relatedPosts: Record<string, string[]>;
  tags: {
    summaries: PublicTagSummary[];
    groups: Array<{ key: string; title: string; tags: string[] }>;
    categoryIcons: Record<string, string | null>;
    tagIconMap: Record<string, string | null>;
    tagIconSvgMap: Record<string, string | null>;
    timelines: Record<string, PublicTagTimelineItem[]>;
  };
}

function normalizeTags(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((tag) => String(tag).trim()).filter(Boolean);
      }
    } catch {
      // ignore
    }
    return trimmed
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  return safeJsonParse<Record<string, unknown>>(raw, {});
}

function toIso(input: number | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const normalized = toMsTimestamp(input);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return new Date(normalized).toISOString();
}

function resolveMemoTime(row: typeof posts.$inferSelect) {
  const publishDate = toIso(row.publishDate);
  const updateDate = toIso(row.updateDate ?? row.lastModified ?? undefined);
  const createdAt = publishDate ?? updateDate ?? new Date().toISOString();
  return {
    createdAt,
    publishedAt: publishDate,
    updatedAt: updateDate,
  };
}

function buildRelatedPosts(postList: PublicPostRecord[]): Record<string, string[]> {
  return Object.fromEntries(
    postList.map((post) => {
      const related = postList
        .filter((candidate) => candidate.slug !== post.slug)
        .filter((candidate) => {
          if (post.category && candidate.category) {
            return candidate.category === post.category;
          }
          return candidate.tags.some((tag) => post.tags.includes(tag));
        })
        .slice(0, 5)
        .map((candidate) => candidate.slug);
      return [post.slug, related];
    })
  );
}

function matchesTag(tagPath: string, tags: string[]): boolean {
  return tags.some((tag) => tag === tagPath || tag.startsWith(`${tagPath}/`));
}

function buildTagTimelines(
  tagPaths: string[],
  postList: PublicPostRecord[],
  memoList: PublicMemoRecord[]
): Record<string, PublicTagTimelineItem[]> {
  const timelines: Record<string, PublicTagTimelineItem[]> = {};

  for (const tagPath of tagPaths) {
    const items = [
      ...postList
        .filter((post) => matchesTag(tagPath, post.tags))
        .map<PublicTagTimelineItem>((post) => ({
          type: "post",
          slug: post.slug,
          title: post.title,
          excerpt: post.excerpt,
          content: null,
          publishDate: post.publishDate,
          tags: post.tags,
          image: post.image,
          dataSource: post.dataSource,
        })),
      ...memoList
        .filter((memo) => matchesTag(tagPath, memo.tags))
        .map<PublicTagTimelineItem>((memo) => ({
          type: "memo",
          slug: memo.slug,
          title: memo.title,
          excerpt: memo.excerpt,
          content: memo.content,
          publishDate: memo.publishedAt ?? memo.createdAt,
          tags: memo.tags,
          image: memo.image,
          dataSource: memo.dataSource,
        })),
    ].sort((a, b) => b.publishDate.localeCompare(a.publishDate));

    timelines[tagPath] = items;
  }

  return timelines;
}

export async function buildPublicSnapshot(): Promise<PublicSnapshot> {
  await initializeDB();

  const rawPosts = await db
    .select()
    .from(posts)
    .where(and(eq(posts.type, "post"), eq(posts.draft, false), eq(posts.public, true)))
    .orderBy(desc(posts.publishDate));

  const rawMemos = await db
    .select()
    .from(posts)
    .where(and(eq(posts.type, "memo"), eq(posts.public, true)))
    .orderBy(desc(posts.publishDate), desc(posts.id));

  const postList: PublicPostRecord[] = rawPosts.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt || extractTextSummary(row.body, 180),
    body: row.body,
    publishDate: toIso(row.publishDate) ?? new Date().toISOString(),
    updateDate: toIso(row.updateDate),
    category: row.category,
    tags: normalizeTags(row.tags),
    author: row.author,
    image: row.image,
    dataSource: row.dataSource,
    filePath: row.filePath || null,
    metadata: normalizeMetadata(row.metadata),
  }));

  const memoList: PublicMemoRecord[] = rawMemos.map((row) => {
    const parsed = parseContentTags(row.body || "");
    const storedTags = normalizeTags(row.tags);
    const inlineTags = parsed.tags.map((tag) => tag.name);
    const mergedTags = Array.from(new Set([...inlineTags, ...storedTags]));
    const { createdAt, publishedAt, updatedAt } = resolveMemoTime(row);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title || row.slug,
      excerpt: row.excerpt || extractTextSummary(parsed.cleanedContent || row.body, 140),
      content: row.body,
      tags: mergedTags,
      inlineTags,
      isPublic: row.public,
      createdAt,
      publishedAt,
      updatedAt,
      dataSource: row.dataSource,
      filePath: row.filePath || null,
      image: row.image,
    };
  });

  const [tagSummaries, tagGroupsConfig, categoryIcons] = await Promise.all([
    getTagSummaries({ includeDrafts: false, includeUnpublished: false }),
    readTagGroupsFromDB(),
    getAllCategoryIcons(),
  ]);

  const allTagPaths = Array.from(
    new Set([
      ...tagSummaries.map((tag) => tag.name),
      ...postList.flatMap((post) => post.tags),
      ...memoList.flatMap((memo) => memo.tags),
    ])
  );

  const { iconMap, svgMap } =
    allTagPaths.length > 0
      ? await resolveTagIconSvgsForTags(allTagPaths, {
          svgHeight: "20",
          includeHashFallback: true,
        })
      : { iconMap: {}, svgMap: {} };

  const categories = new Map<string, number>();
  for (const post of postList) {
    if (!post.category) continue;
    categories.set(post.category, (categories.get(post.category) ?? 0) + 1);
  }

  return {
    generatedAt: new Date().toISOString(),
    site: SITE,
    stats: {
      totalPosts: postList.length,
      categories: Array.from(categories.entries()).map(([name, count]) => ({ name, count })),
    },
    posts: postList,
    memos: memoList,
    relatedPosts: buildRelatedPosts(postList),
    tags: {
      summaries: tagSummaries.map((tag) => ({
        name: tag.name,
        segments: tag.segments,
        lastSegment: tag.lastSegment,
        count: tag.count,
      })),
      groups: tagGroupsConfig.groups,
      categoryIcons,
      tagIconMap: iconMap,
      tagIconSvgMap: svgMap,
      timelines: buildTagTimelines(allTagPaths, postList, memoList),
    },
  };
}

export async function writePublicSnapshot(outputPath: string) {
  const snapshot = await buildPublicSnapshot();
  await Bun.write(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}
