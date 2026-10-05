import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { and, desc, eq } from "drizzle-orm";
import { getLocalPath, isLocalContentEnabled } from "@/config/paths";
import {
  extractMemoTitle,
  isGeneratedMemoTitle,
  parseMarkdownContent,
} from "@/lib/content-sources/utils";
import { db, initializeDB } from "@/lib/db";
import { extractTextSummary } from "@/lib/markdown-utils";
import {
  buildLegacyPublicMediaUrl,
  isLocalPublicMediaDataSource,
  type PublicMediaCollection,
  rewritePublicContentMediaUrls,
} from "@/lib/public-media";
import { posts } from "@/lib/schema";
import { normalizeTags } from "@/lib/tag-directory";
import { parseContentTags } from "@/lib/tag-parser";
import { safeJsonParse, toMsTimestamp } from "@/lib/utils";
import type { PublicMemoRecord, PublicPostRecord } from "@/public-site/snapshot";
import { buildPublicMediaCollection, pickLegacyPublicImage } from "@/server/public-media";

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

function getCanonicalFilePath(row: typeof posts.$inferSelect): string {
  const filePath = row.filePath?.trim() || row.id.trim();
  if (!filePath) {
    throw new Error(`Public content row ${row.slug || row.id} is missing a canonical file path`);
  }
  return filePath;
}

function isLocalMemoRow(row: typeof posts.$inferSelect) {
  return row.dataSource === "local" || row.source === "local";
}

/**
 * Resolve memo titles at the public read boundary. Legacy rows whose title is
 * exactly the generated filename title are re-read from the local Markdown
 * source; inaccessible sources keep the stored value conservatively.
 */
export async function resolvePublicMemoTitle(
  row: typeof posts.$inferSelect
): Promise<string | null> {
  const storedTitle = row.title?.trim() || "";
  if (!storedTitle) return null;

  const filePath = getCanonicalFilePath(row);
  if (!isLocalMemoRow(row) || !isGeneratedMemoTitle(storedTitle, filePath)) {
    return storedTitle;
  }

  if (!isLocalContentEnabled()) {
    console.warn("[public-snapshot] cannot verify legacy memo title without local source", {
      slug: row.slug,
      filePath,
    });
    return storedTitle;
  }

  try {
    const rawContent = await readFile(getLocalPath(filePath), "utf8");
    const parsed = parseMarkdownContent(rawContent, filePath);
    return extractMemoTitle(parsed.frontmatter, parsed.body) || null;
  } catch (error) {
    console.warn("[public-snapshot] preserving legacy memo title because source is unavailable", {
      slug: row.slug,
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return storedTitle;
  }
}

function publicMediaItems(media: PublicMediaCollection) {
  return [media.primary, media.cover, ...media.content, ...media.attachments].filter(
    (item): item is NonNullable<typeof item> => item !== null
  );
}

function hasAvailableLocalMedia(kind: "post" | "memo", row: typeof posts.$inferSelect) {
  if (!isLocalContentEnabled() || !isLocalPublicMediaDataSource(row.dataSource)) {
    return true;
  }

  const media = buildPublicMediaCollection(kind, row);
  const mediaItems = publicMediaItems(media);
  const missing = mediaItems.filter((item) => !existsSync(getLocalPath(item.sourcePath)));
  const contentPath = getCanonicalFilePath(row);
  if (mediaItems.length > 0 && !existsSync(getLocalPath(contentPath))) {
    console.warn("[public-snapshot] skipping content with missing local source:", {
      kind,
      slug: row.slug,
      contentPath,
    });
    return false;
  }
  if (missing.length > 0) {
    console.warn("[public-snapshot] skipping content with missing local media:", {
      kind,
      slug: row.slug,
      sourcePaths: missing.map((item) => item.sourcePath),
    });
    return false;
  }
  return true;
}

export interface ContentReadOptions {
  includeDrafts?: boolean;
  includeUnpublished?: boolean;
}

export async function readEligibleContent(options: ContentReadOptions = {}) {
  await initializeDB();
  const filters = [
    ...(!options.includeDrafts ? [eq(posts.draft, false)] : []),
    ...(!options.includeUnpublished ? [eq(posts.public, true)] : []),
  ];
  const rawPosts = await db
    .select()
    .from(posts)
    .where(and(eq(posts.type, "post"), ...filters))
    .orderBy(desc(posts.publishDate), desc(posts.id));

  const rawMemos = await db
    .select()
    .from(posts)
    .where(and(eq(posts.type, "memo"), ...filters))
    .orderBy(desc(posts.publishDate), desc(posts.id));

  const postList: PublicPostRecord[] = rawPosts
    .filter((row) => hasAvailableLocalMedia("post", row))
    .map((row) => {
      const filePath = getCanonicalFilePath(row);
      const media = buildPublicMediaCollection("post", row);
      const publicMediaContext = {
        kind: "post" as const,
        slug: row.slug,
        filePath,
      };
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt || extractTextSummary(row.body, 180),
        body: rewritePublicContentMediaUrls(row.body, publicMediaContext),
        publishDate: toIso(row.publishDate) ?? new Date().toISOString(),
        updateDate: toIso(row.updateDate),
        category: row.category,
        tags: normalizeTags(row.tags),
        author: row.author,
        image:
          pickLegacyPublicImage(media, "cover") ??
          buildLegacyPublicMediaUrl({
            mediaPath: row.image,
            dataSource: row.dataSource,
            filePath,
          }),
        media,
        dataSource: row.dataSource,
        filePath,
        metadata: normalizeMetadata(row.metadata),
      };
    });

  const memoList: PublicMemoRecord[] = (
    await Promise.all(
      rawMemos
        .filter((row) => hasAvailableLocalMedia("memo", row))
        .map(async (row) => {
          const parsed = parseContentTags(row.body || "");
          const storedTags = normalizeTags(row.tags);
          const inlineTags = parsed.tags.map((tag) => tag.name);
          const mergedTags = Array.from(new Set([...inlineTags, ...storedTags]));
          const { createdAt, publishedAt, updatedAt } = resolveMemoTime(row);
          const filePath = getCanonicalFilePath(row);
          const media = buildPublicMediaCollection("memo", row);
          const publicMediaContext = {
            kind: "memo" as const,
            slug: row.slug,
            filePath,
          };
          const title = await resolvePublicMemoTitle(row);
          return {
            id: row.id,
            slug: row.slug,
            title,
            excerpt: row.excerpt || extractTextSummary(parsed.cleanedContent || row.body, 140),
            content: rewritePublicContentMediaUrls(row.body, publicMediaContext),
            tags: mergedTags,
            inlineTags,
            isPublic: row.public,
            createdAt,
            publishedAt,
            updatedAt,
            dataSource: row.dataSource,
            filePath,
            image:
              pickLegacyPublicImage(media, "content") ??
              buildLegacyPublicMediaUrl({
                mediaPath: row.image,
                dataSource: row.dataSource,
                filePath,
              }),
            media,
          };
        })
    )
  ).filter((memo): memo is PublicMemoRecord => Boolean(memo));

  return { posts: postList, memos: memoList };
}
