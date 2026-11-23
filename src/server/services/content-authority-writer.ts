/**
 * Database-authority content writer.
 *
 * When `CONTENT_AUTHORITY=database` the content library is authoritative: no
 * Markdown content files exist and no local source scan runs. Authored content
 * lives in `posts.metadata` (`content` is the authored body, every other key is
 * the authored frontmatter). `posts.body` stays the reading projection and
 * `memo_clippings` stays the clipping projection, so repository sync and the
 * clipping runtime keep observing the same shapes as the local file flow.
 */
import { eq } from "drizzle-orm";
import { clearSearchCache } from "@/lib/ai/search-cache";
import {
  buildCanonicalDocument,
  type ContentClippingFrontmatter,
  type ContentRecord,
  sha256Hex,
} from "@/lib/content-repo/canonical";
import { db } from "@/lib/db";
import { type ClippingRecognition, recognizeMemoClipping } from "@/lib/memo-clipping";
import { contentRepoBaselines, memoClippings, posts } from "@/lib/schema";
import { clippingCreator, clippingIdForMemo, projectClippingMemo } from "@/server/clipping/store";

export type AuthoredKind = "post" | "memo";
export type ContentRow = typeof posts.$inferSelect;

export interface SaveAuthoredContentInput {
  kind: AuthoredKind;
  id: string;
  slug: string;
  body: string;
  frontmatter?: Record<string, unknown>;
  row?: ContentRow | null;
  filePath?: string | null;
  title?: string | null;
  excerpt?: string | null;
  publishDate?: number | null;
  updateDate?: number | null;
  draft?: boolean;
  public?: boolean;
  category?: string | null;
  tags?: string[];
  author?: string | null;
  image?: string | null;
  createdVia?: string | null;
  dataSource?: string;
  source?: string;
  lastModified?: number;
}

export interface SavedAuthoredContent {
  row: ContentRow;
  contentHash: string;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asTimestamp(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function frontmatterTags(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((tag): tag is string => typeof tag === "string");
}

function storedTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

export function authoredExcerpt(body: string, maxLength = 200): string {
  return body
    .replace(/[#*`>[\]]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

export function toContentRecord(row: ContentRow): ContentRecord {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    draft: row.draft,
    public: row.public,
    category: row.category,
    tags: row.tags,
    author: row.author,
    image: row.image,
    publishDate: row.publishDate,
    updateDate: row.updateDate,
    filePath: row.filePath,
    metadata: row.metadata,
  };
}

/** Canonical repository projection of a memo's clipping reference. */
export function memoClippingFrontmatter(contentId: string): ContentClippingFrontmatter | null {
  const clipping = db.select().from(memoClippings).where(eq(memoClippings.memoId, contentId)).get();
  return clipping?.targetUrl
    ? { targetUrl: clipping.targetUrl, capturedAt: new Date(clipping.updatedAt).toISOString() }
    : null;
}

function patchManifest(raw: string | null | undefined, patch: Record<string, unknown>): string {
  let base: Record<string, unknown> = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        base = parsed as Record<string, unknown>;
    } catch {
      /* Rebuildable index; fall back to a minimal manifest. */
    }
  }
  return JSON.stringify({
    schemaVersion: 1,
    previousConversations: [],
    versions: [],
    ...base,
    ...patch,
  });
}

/**
 * Keep the clipping index aligned with the authored memo. The runtime still owns
 * versions and conversations; this only refreshes the projection fields that the
 * repository sync and public surfaces read.
 */
async function syncMemoClippingRow(
  memoId: string,
  recognition: ClippingRecognition,
  frontmatter: Record<string, unknown>
): Promise<void> {
  const existing = db.select().from(memoClippings).where(eq(memoClippings.memoId, memoId)).get();
  if (!recognition.enabled) {
    if (!existing) return;
    const updatedAt = Date.now();
    db.update(memoClippings)
      .set({
        enabled: false,
        deleted: false,
        targetUrl: null,
        updatedAt,
        manifest: patchManifest(existing.manifest, {
          enabled: false,
          deleted: false,
          targetUrl: null,
        }),
      })
      .where(eq(memoClippings.memoId, memoId))
      .run();
    return;
  }
  const id = existing?.id ?? clippingIdForMemo(memoId, frontmatter);
  const creatorId = existing?.creatorId ?? (await clippingCreator(frontmatter, memoId));
  const revision = existing?.revision ?? 0;
  const updatedAt = Date.now();
  const targetUrl = recognition.targetUrl;
  const record = {
    id,
    memoId,
    creatorId,
    revision,
    enabled: true,
    deleted: false,
    targetUrl,
    currentVersionId: existing?.currentVersionId ?? null,
    conversationId: existing?.conversationId ?? null,
    manifest: patchManifest(existing?.manifest, {
      id,
      memoId,
      creatorId,
      revision,
      enabled: true,
      deleted: false,
      targetUrl,
    }),
    updatedAt,
  };
  db.insert(memoClippings)
    .values(record)
    .onConflictDoUpdate({ target: memoClippings.memoId, set: record })
    .run();
}

/**
 * Persist authored Markdown into the content library and refresh every
 * derivative projection. Returns the committed row and its canonical hash.
 */
export async function saveAuthoredContent(
  input: SaveAuthoredContentInput
): Promise<SavedAuthoredContent> {
  const id = input.id;
  const existing = input.row ?? db.select().from(posts).where(eq(posts.id, id)).get() ?? null;
  const frontmatter = { ...(input.frontmatter ?? {}) };
  delete frontmatter.content;
  const authoredBody = input.body;
  const recognition =
    input.kind === "memo" ? recognizeMemoClipping(authoredBody, frontmatter) : null;

  const metadata: Record<string, unknown> = { ...frontmatter, content: authoredBody };
  if (input.kind === "memo") {
    if (recognition?.enabled) metadata.authoredClipping = true;
    else delete metadata.authoredClipping;
  }

  const title = asString(frontmatter.title)?.trim() || input.title || existing?.title || input.slug;
  const isPublic = asBoolean(frontmatter.public) ?? input.public ?? existing?.public ?? true;
  const draft = asBoolean(frontmatter.draft) ?? input.draft ?? existing?.draft ?? false;
  const tags = frontmatterTags(frontmatter.tags) ?? input.tags ?? storedTags(existing?.tags) ?? [];
  const category =
    asString(frontmatter.category) ??
    (input.category !== undefined ? input.category : (existing?.category ?? null));
  const publishDate =
    asTimestamp(frontmatter.publishDate) ??
    asTimestamp(frontmatter.date) ??
    input.publishDate ??
    existing?.publishDate ??
    Date.now();
  const updateDate =
    asTimestamp(frontmatter.updateDate) ?? input.updateDate ?? existing?.updateDate ?? null;
  const author = asString(frontmatter.author) ?? input.author ?? existing?.author ?? null;
  const image = asString(frontmatter.image) ?? input.image ?? existing?.image ?? null;
  const excerpt = input.excerpt ?? authoredExcerpt(authoredBody);
  const createdVia =
    existing?.createdVia ?? input.createdVia ?? asString(frontmatter.createdVia) ?? null;
  const dataSource = existing?.dataSource ?? input.dataSource ?? "database";
  const source = existing?.source ?? input.source ?? "database";
  const filePath = input.filePath ?? existing?.filePath ?? id;
  const lastModified = input.lastModified ?? Date.now();

  const values = {
    id,
    slug: input.slug,
    type: input.kind,
    title,
    excerpt,
    body: authoredBody,
    publishDate,
    updateDate,
    draft,
    public: isPublic,
    category,
    tags: JSON.stringify(tags),
    author,
    image,
    metadata: JSON.stringify(metadata),
    dataSource,
    createdVia,
    contentHash: sha256Hex(new TextEncoder().encode(authoredBody)),
    lastModified,
    source,
    filePath,
  };
  const { id: _id, ...updateValues } = values;
  db.insert(posts).values(values).onConflictDoUpdate({ target: posts.id, set: updateValues }).run();

  if (input.kind === "memo" && recognition) {
    await syncMemoClippingRow(id, recognition, frontmatter);
    const projection = recognition.enabled ? await projectClippingMemo(id) : null;
    if (projection) {
      db.update(posts)
        .set({
          body: projection.content,
          title: projection.title ?? "",
          excerpt: authoredExcerpt(projection.content),
        })
        .where(eq(posts.id, id))
        .run();
    }
  }

  const row = db.select().from(posts).where(eq(posts.id, id)).get();
  if (!row) throw new Error("Content was not persisted.");
  const document = buildCanonicalDocument(toContentRecord(row), {
    clipping: input.kind === "memo" ? memoClippingFrontmatter(id) : null,
  });
  db.update(posts)
    .set({ contentHash: document.contentHash, lastModified: Date.now() })
    .where(eq(posts.id, id))
    .run();
  clearSearchCache();
  const persisted = db.select().from(posts).where(eq(posts.id, id)).get() ?? row;
  return { row: persisted, contentHash: document.contentHash };
}

/** Remove the authored row and every database projection that points at it. */
export async function deleteAuthoredContent(id: string): Promise<void> {
  db.transaction((tx) => {
    tx.delete(memoClippings).where(eq(memoClippings.memoId, id)).run();
    tx.delete(contentRepoBaselines).where(eq(contentRepoBaselines.contentId, id)).run();
    tx.delete(posts).where(eq(posts.id, id)).run();
  });
  clearSearchCache();
}
