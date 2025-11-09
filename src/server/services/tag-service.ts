import { and, eq, type SQL } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import { posts } from "@/lib/schema";
import type { TaggedPost, TagSummary } from "@/types/tags";

export interface TagServiceOptions {
  includeDrafts?: boolean;
  includeUnpublished?: boolean;
}

type PostRow = {
  title: string;
  slug: string;
  excerpt: string | null;
  tags: string | null;
  publishDate: number | null;
  draft: boolean;
  public: boolean;
  type: string;
};

async function ensureDBReady(): Promise<void> {
  if (!db) {
    await initializeDB();
  }
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

function splitTagSegments(tag: string): { path: string; segments: string[]; lastSegment: string } {
  const segments = tag
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const path = segments.join("/");
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : tag;

  return { path, segments, lastSegment };
}

async function fetchPosts(options: TagServiceOptions = {}): Promise<PostRow[]> {
  await ensureDBReady();

  if (!db) {
    throw new Error("Database connection is not available");
  }

  const filters: SQL[] = [eq(posts.type, "post")];

  if (!options.includeDrafts) {
    filters.push(eq(posts.draft, false));
  }

  if (!options.includeUnpublished) {
    filters.push(eq(posts.public, true));
  }

  return db
    .select({
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      tags: posts.tags,
      publishDate: posts.publishDate,
      draft: posts.draft,
      public: posts.public,
      type: posts.type,
    })
    .from(posts)
    .where(filters.length > 0 ? and(...filters) : undefined);
}

const collator = new Intl.Collator("zh-Hans-CN", { sensitivity: "base" });

export async function getTagSummaries(options: TagServiceOptions = {}): Promise<TagSummary[]> {
  const rows = await fetchPosts(options);
  const tagCounts = new Map<string, TagSummary>();

  for (const row of rows) {
    const tags = normalizeTags(row.tags);
    const uniqueTags = new Set(tags);

    for (const tag of uniqueTags) {
      const { path, segments, lastSegment } = splitTagSegments(tag);
      if (!path) continue;

      const existing = tagCounts.get(path);
      if (existing) {
        existing.count += 1;
      } else {
        tagCounts.set(path, {
          name: path,
          segments,
          lastSegment,
          count: 1,
        });
      }
    }
  }

  return Array.from(tagCounts.values()).sort((a, b) => {
    const lastSegmentCompare = collator.compare(a.lastSegment, b.lastSegment);
    if (lastSegmentCompare !== 0) {
      return lastSegmentCompare;
    }
    return collator.compare(a.name, b.name);
  });
}

export async function getPostsByTag(
  tag: string,
  options: TagServiceOptions = {}
): Promise<TaggedPost[]> {
  const trimmedTag = tag.trim();
  if (!trimmedTag) {
    return [];
  }

  const rows = await fetchPosts(options);
  const matching = rows
    .map((row) => {
      const parsedTags = normalizeTags(row.tags);
      return {
        title: row.title,
        slug: row.slug,
        excerpt: row.excerpt,
        tags: parsedTags,
        publishDate: row.publishDate ?? 0,
        matches: parsedTags.includes(trimmedTag),
      };
    })
    .filter((row) => row.matches);

  matching.sort((a, b) => {
    if (a.publishDate === b.publishDate) {
      return collator.compare(a.title, b.title);
    }
    return (b.publishDate ?? 0) - (a.publishDate ?? 0);
  });

  return matching.map((row) => ({
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    tags: row.tags,
  }));
}

export async function groupPostsByTag(
  options: TagServiceOptions = {},
  limitPerTag?: number
): Promise<Array<{ tag: TagSummary; posts: TaggedPost[] }>> {
  const rows = await fetchPosts(options);
  const groups = new Map<string, { tag: TagSummary; posts: TaggedPost[] }>();

  for (const row of rows) {
    const tags = Array.from(new Set(normalizeTags(row.tags)));
    for (const tag of tags) {
      const { path, segments, lastSegment } = splitTagSegments(tag);
      if (!path) continue;
      let bucket = groups.get(path);
      if (!bucket) {
        bucket = { tag: { name: path, segments, lastSegment, count: 0 }, posts: [] };
        groups.set(path, bucket);
      }
      bucket.tag.count += 1;
      bucket.posts.push({
        title: row.title,
        slug: row.slug,
        excerpt: row.excerpt,
        tags,
      });
    }
  }

  const arr = Array.from(groups.values());
  // sort like getTagSummaries
  arr.sort((a, b) => {
    const c1 = collator.compare(a.tag.lastSegment, b.tag.lastSegment);
    if (c1 !== 0) return c1;
    return collator.compare(a.tag.name, b.tag.name);
  });

  if (typeof limitPerTag === "number") {
    for (const g of arr) g.posts = g.posts.slice(0, limitPerTag);
  }

  return arr;
}

export function decodeTagFromPath(tagPath: string): string {
  try {
    return decodeURIComponent(tagPath);
  } catch {
    return tagPath;
  }
}
