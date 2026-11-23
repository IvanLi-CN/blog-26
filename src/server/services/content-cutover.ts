import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, posix } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { getActiveLocalPathMappings, getLocalPath, isLocalContentEnabled } from "@/config/paths";
import {
  buildCanonicalDocument,
  type ContentRecord,
  canonicalContentPath,
} from "@/lib/content-repo/canonical";
import { parseRemoteDocument } from "@/lib/content-repo/document";
import type { ContentItem, ContentType } from "@/lib/content-sources/types";
import { createContentItemFromParsed, parseMarkdownContent } from "@/lib/content-sources/utils";
import { db } from "@/lib/db";
import { resolveContentMediaPath } from "@/lib/public-media";
import { contentAuthority, contentRepoBaselines, memoClippings, posts } from "@/lib/schema";
import { recordMediaIdentity } from "./media-identity";

const MARKDOWN_TARGET_PATTERN = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu;
const SYNC_CONFLICT_PATTERN = /\.sync-conflict-[^/]*\.md$/iu;
const DEFAULT_EXCLUDES = ["*.tmp", "*.bak", "*~"];

export interface CutoverSkipped {
  path: string;
  reason: string;
}

export interface CutoverReport {
  status: "dry-run" | "applied" | "completed" | "blocked";
  documents: { post: number; memo: number; project: number };
  created: number;
  updated: number;
  unchanged: number;
  mediaCopied: number;
  mediaReused: number;
  skipped: CutoverSkipped[];
  orphans: string[];
  missingAttachments: { path: string; attachment: string }[];
  errors: string[];
}

export interface CutoverOptions {
  apply?: boolean;
  removeOrphans?: boolean;
  onProgress?: (message: string) => void;
}

function log(options: CutoverOptions, message: string) {
  options.onProgress?.(message);
}

function readRoots(): { posts: string[]; projects: string[]; memos: string[] } {
  const mappings = getActiveLocalPathMappings();
  return {
    posts: mappings.posts.map(normalizeRoot),
    projects: mappings.projects.map(normalizeRoot),
    memos: mappings.memos.map(normalizeRoot),
  };
}

function normalizeRoot(value: string) {
  const clean = value.replace(/\\/gu, "/").replace(/^\/+/u, "").replace(/\/+$/u, "");
  return clean;
}

function excluded(name: string) {
  return DEFAULT_EXCLUDES.some((pattern) => {
    if (pattern.startsWith("*")) return name.endsWith(pattern.slice(1));
    return name === pattern;
  });
}

async function walk(root: string, relative: string, files: string[], report: CutoverReport) {
  const absolute = relative ? `${root}/${relative}` : root;
  let entries: Dirent[];
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (SYNC_CONFLICT_PATTERN.test(entry.name)) {
      report.skipped.push({ path: child, reason: "syncthing-conflict" });
      continue;
    }
    if (excluded(entry.name)) continue;
    if (entry.isDirectory()) {
      await walk(root, child, files, report);
      continue;
    }
    if (!/\.md$/iu.test(entry.name)) continue;
    files.push(child);
  }
}

interface MediaChoice {
  original: string;
  target: string;
  name: string;
  created: boolean;
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function relativeAsset(name: string) {
  return `./assets/${name}`;
}

async function chooseMedia(
  original: string,
  kind: "blog" | "Memos",
  report: CutoverReport,
  apply: boolean,
  documentPath: string
): Promise<MediaChoice | null> {
  const source = getLocalPath(original);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(source);
  } catch {
    report.missingAttachments.push({ path: documentPath, attachment: original });
    return null;
  }
  const extension = posix.extname(original);
  const base = basename(original);
  const targetDir = `${kind}/assets`;
  const candidates = [base, `${sha256(bytes).slice(0, 8)}-${base}`];
  for (const candidate of candidates) {
    const target = `${targetDir}/${candidate}`;
    let existing: Uint8Array | null = null;
    try {
      existing = await readFile(getLocalPath(target));
    } catch {
      existing = null;
    }
    if (existing) {
      if (sha256(existing) === sha256(bytes)) {
        recordMediaIdentity(target, bytes);
        report.mediaReused += 1;
        return { original, target, name: candidate, created: false };
      }
      continue;
    }
    if (apply) {
      const absolute = getLocalPath(target);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, bytes);
      recordMediaIdentity(target, bytes);
    }
    report.mediaCopied += 1;
    log({}, `attachment ${original} -> ${target}`);
    return { original, target, name: candidate, created: true };
  }
  report.errors.push(`attachment name collision unresolved: ${original}${extension}`);
  return null;
}

function rewriteTargets(text: string, filePath: string, choices: Map<string, MediaChoice>): string {
  return text.replace(MARKDOWN_TARGET_PATTERN, (match, target: string) => {
    const resolved = resolveContentMediaPath(target, filePath);
    if (!resolved) return match;
    const choice = choices.get(posix.normalize(resolved));
    if (!choice) return match;
    return match.replace(target, relativeAsset(choice.name));
  });
}

function imageTarget(image: string | null, filePath: string, choices: Map<string, MediaChoice>) {
  if (!image) return null;
  const resolved = resolveContentMediaPath(image, filePath);
  if (!resolved) return image;
  const choice = choices.get(posix.normalize(resolved));
  return choice ? relativeAsset(choice.name) : image;
}

function collectTargets(text: string, filePath: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(MARKDOWN_TARGET_PATTERN)) {
    const target = match[1];
    if (!target) continue;
    const resolved = resolveContentMediaPath(target, filePath);
    if (resolved) found.add(posix.normalize(resolved));
  }
  return [...found];
}

function typeOf(root: "posts" | "memos" | "projects"): ContentType {
  if (root === "memos") return "memo";
  if (root === "projects") return "project";
  return "post";
}

function clippingFrontmatterFor(memoId: string) {
  const clipping = db.select().from(memoClippings).where(eq(memoClippings.memoId, memoId)).get();
  return clipping?.targetUrl
    ? { targetUrl: clipping.targetUrl, capturedAt: new Date(clipping.updatedAt).toISOString() }
    : null;
}

const cutoverMarker = "database";

export async function runContentCutover(options: CutoverOptions = {}): Promise<CutoverReport> {
  const report: CutoverReport = {
    status: options.apply ? "applied" : "dry-run",
    documents: { post: 0, memo: 0, project: 0 },
    created: 0,
    updated: 0,
    unchanged: 0,
    mediaCopied: 0,
    mediaReused: 0,
    skipped: [],
    orphans: [],
    missingAttachments: [],
    errors: [],
  };

  const existingMarker = db
    .select()
    .from(contentAuthority)
    .where(eq(contentAuthority.id, cutoverMarker))
    .get();
  if (existingMarker) {
    report.status = "completed";
    log(
      options,
      `cutover already completed at ${new Date(existingMarker.completedAt).toISOString()}`
    );
    return report;
  }

  if (!isLocalContentEnabled()) {
    report.status = "blocked";
    report.errors.push("LOCAL_CONTENT_BASE_PATH is not configured");
    return report;
  }
  const root = getLocalPath("");
  if (
    !(await stat(root)
      .then((value) => value.isDirectory())
      .catch(() => false))
  ) {
    report.status = "blocked";
    report.errors.push(`content root is not a directory: ${root}`);
    return report;
  }

  const roots = readRoots();
  const filesByType: Record<"posts" | "memos" | "projects", string[]> = {
    posts: [],
    memos: [],
    projects: [],
  };
  for (const key of ["posts", "memos", "projects"] as const) {
    for (const dir of roots[key]) await walk(root, dir, filesByType[key], report);
  }

  const existingRows = db
    .select()
    .from(posts)
    .where(inArray(posts.type, ["post", "memo", "project"]))
    .all();
  const rowsByPath = new Map(existingRows.map((row) => [posix.normalize(row.filePath), row]));

  const plannedPaths = new Set<string>();
  const canonicalOwners = new Map<string, string>();
  const pending: Array<{
    absolute: string;
    relative: string;
    type: ContentType;
    item: ContentItem;
    canonical: string;
    row: (typeof existingRows)[number] | undefined;
  }> = [];

  for (const key of ["posts", "memos", "projects"] as const) {
    for (const relative of filesByType[key]) {
      const clean = posix.normalize(relative);
      plannedPaths.add(clean);
      const type = typeOf(key);
      if (type === "project") {
        report.documents.project += 1;
        if (!rowsByPath.has(clean)) {
          report.errors.push(`project file has no library row: ${clean}`);
        }
        continue;
      }
      report.documents[type] += 1;
      const absolute = getLocalPath(clean);
      const parsed = parseMarkdownContent(await readFile(absolute, "utf8"), clean);
      const item = createContentItemFromParsed(parsed, clean, "local", { contentType: type });
      pending.push({
        absolute,
        relative: clean,
        type,
        item,
        canonical: "",
        row: rowsByPath.get(clean),
      });
    }
  }

  for (const entry of pending) {
    const recordType = entry.type === "memo" ? "memo" : "post";
    const canonical = canonicalContentPath({
      type: recordType,
      slug: entry.item.slug,
      filePath: entry.relative,
    });
    const owner = canonicalOwners.get(canonical);
    if (owner && owner !== entry.relative) {
      report.errors.push(`canonical path collision: ${canonical} (${owner} vs ${entry.relative})`);
      continue;
    }
    canonicalOwners.set(canonical, entry.relative);
    entry.canonical = canonical;
  }

  for (const row of existingRows) {
    if (row.type === "project") continue;
    if (row.dataSource !== "local") continue;
    if (plannedPaths.has(posix.normalize(row.filePath))) continue;
    report.orphans.push(posix.normalize(row.filePath));
  }
  const removingOrphans = options.apply === true && options.removeOrphans === true;
  if (report.orphans.length && !removingOrphans) {
    report.status = "blocked";
    report.errors.push(
      `${report.orphans.length} library rows have no file; pass removeOrphans to delete them`
    );
  }

  for (const entry of pending) {
    const item = entry.item;
    const canonical = entry.canonical;
    if (!canonical) continue;
    const kindDir = entry.type === "memo" ? "Memos" : "blog";
    const authoredClipping = item.metadata?.authoredClipping === true;
    const authoredBody = typeof item.metadata?.content === "string" ? item.metadata.content : "";
    const baseBody = entry.row && authoredClipping ? entry.row.body : authoredBody;
    const choices = new Map<string, MediaChoice>();
    for (const original of collectTargets(baseBody, entry.relative)) {
      const choice = await chooseMedia(
        original,
        kindDir,
        report,
        options.apply === true,
        entry.relative
      );
      if (choice) choices.set(original, choice);
    }
    const rewrittenBody = rewriteTargets(baseBody, entry.relative, choices);
    const rewrittenImage = imageTarget(item.image ?? null, entry.relative, choices);
    const record = buildRecord(item, entry.row, {
      type: entry.type,
      body: rewrittenBody,
      image: rewrittenImage,
      canonical,
    });
    const document = buildCanonicalDocument(record, {
      clipping: entry.type === "memo" ? clippingFrontmatterFor(record.id) : null,
    });
    const canonicalBody = parseRemoteDocument(document.bytes).body;

    if (entry.row) {
      const bodyChanged = entry.row.body !== canonicalBody;
      const imageChanged = (entry.row.image ?? null) !== rewrittenImage;
      const hashChanged = entry.row.contentHash !== document.contentHash;
      if (!bodyChanged && !imageChanged && !hashChanged) {
        report.unchanged += 1;
        continue;
      }
      report.updated += 1;
      if (!options.apply) continue;
      db.update(posts)
        .set({
          body: canonicalBody,
          image: rewrittenImage,
          contentHash: document.contentHash,
          dataSource: "database",
          source: "database",
          lastModified: Date.now(),
        })
        .where(eq(posts.id, entry.row.id))
        .run();
      continue;
    }

    report.created += 1;
    if (!options.apply) continue;
    db.insert(posts)
      .values({
        id: canonical,
        slug: item.slug,
        type: entry.type,
        title: item.title ?? item.slug,
        excerpt: item.excerpt ?? null,
        body: canonicalBody,
        publishDate: item.publishDate,
        updateDate: item.updateDate ?? null,
        draft: item.draft,
        public: item.public,
        category: item.category ?? null,
        tags: JSON.stringify(item.tags ?? []),
        author: item.author ?? null,
        image: rewrittenImage,
        metadata: JSON.stringify(item.metadata ?? {}),
        dataSource: "database",
        createdVia: item.createdVia ?? null,
        contentHash: document.contentHash,
        lastModified: Date.now(),
        source: "database",
        filePath: canonical,
      })
      .run();
  }

  if (options.apply && options.removeOrphans && report.orphans.length) {
    const ids = existingRows
      .filter(
        (row) => row.type !== "project" && report.orphans.includes(posix.normalize(row.filePath))
      )
      .map((row) => row.id);
    if (ids.length) {
      db.transaction((tx) => {
        tx.delete(contentRepoBaselines).where(inArray(contentRepoBaselines.contentId, ids)).run();
        tx.delete(posts).where(inArray(posts.id, ids)).run();
      });
      report.orphans = [];
    }
  }

  if (report.errors.length) {
    report.status = "blocked";
    return report;
  }
  if (!options.apply) {
    report.status = "dry-run";
    return report;
  }

  db.insert(contentAuthority)
    .values({
      id: cutoverMarker,
      authority: "database",
      sourceRoot: root,
      documentCount: report.documents.post + report.documents.memo,
      mediaCount: report.mediaCopied + report.mediaReused,
      completedAt: Date.now(),
    })
    .run();
  log(options, `cutover completed: ${report.created} created, ${report.updated} updated`);
  return report;
}

function buildRecord(
  item: ContentItem,
  row: typeof posts.$inferSelect | undefined,
  override: {
    type: ContentType;
    body: string;
    image: string | null;
    canonical: string;
  }
): ContentRecord {
  return {
    id: row?.id ?? override.canonical,
    type: row?.type ?? override.type,
    slug: item.slug,
    title: row?.title ?? item.title ?? item.slug,
    excerpt: row?.excerpt ?? item.excerpt ?? null,
    body: override.body,
    draft: item.draft,
    public: item.public,
    category: item.category ?? null,
    tags: JSON.stringify(item.tags ?? []),
    author: item.author ?? null,
    image: override.image,
    publishDate: item.publishDate,
    updateDate: item.updateDate ?? row?.updateDate ?? null,
    filePath: override.canonical,
    metadata: row?.metadata ?? JSON.stringify(item.metadata ?? {}),
  };
}
