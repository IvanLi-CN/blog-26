import { createHash } from "node:crypto";
import { posix } from "node:path";
import matter from "gray-matter";
import { resolveContentMediaPath } from "@/lib/public-media";

export type ContentRepoKind = "post" | "memo";

export interface ContentRecord {
  id: string;
  type: string;
  slug: string;
  title: string | null;
  excerpt: string | null;
  body: string;
  draft: boolean;
  public: boolean;
  category: string | null;
  tags: string | null;
  author: string | null;
  image: string | null;
  publishDate: number;
  updateDate: number | null;
  filePath: string;
  metadata: string | null;
}

export interface ContentClippingFrontmatter {
  targetUrl: string;
  capturedAt?: string;
}

export interface CanonicalDocument {
  path: string;
  bytes: Uint8Array;
  contentHash: string;
  kind: ContentRepoKind;
  media: string[];
}

const MARKDOWN_TARGET_PATTERN = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu;
const EXTERNAL_TARGET_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/iu;

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeRelativePath(value: string): string {
  const clean = value
    .replace(/\\/gu, "/")
    .replace(/\/+/gu, "/")
    .replace(/^\.?\//u, "")
    .replace(/^\/+/u, "");
  const segments = clean.split("/").filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === ".." || segment === "."))
    throw new Error(`Unsafe content repository path: ${value}`);
  return segments.join("/");
}

/**
 * Repository layout is fixed by the contract: `blog/<slug>.md` for posts and
 * `Memos/<file>.md` for memos. A memo keeps its file name (dates live there);
 * a post's legacy notes path never decides its repository location.
 */
function assertSafeName(name: string, label: string) {
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\"))
    throw new Error(`Unsafe content repository ${label}: ${name}`);
}

export function canonicalContentPath(record: Pick<ContentRecord, "type" | "slug" | "filePath">) {
  if (record.type === "memo") {
    const raw = record.filePath?.trim();
    const source = raw ? posix.basename(raw.replace(/\\/gu, "/")) : `${record.slug}.md`;
    const name = /\.md$/iu.test(source) ? source : `${source}.md`;
    assertSafeName(name, "memo file name");
    return normalizeRelativePath(`Memos/${name}`);
  }
  const slug = record.slug.trim() || "untitled";
  assertSafeName(slug, "post slug");
  const name = /\.md$/iu.test(slug) ? slug : `${slug}.md`;
  return normalizeRelativePath(`blog/${name}`);
}

export function normalizeContentBody(body: string): string {
  const lines = body
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function isoDate(timestamp: number | null | undefined) {
  if (!timestamp || !Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function relativeTarget(fromPath: string, resolvedPath: string): string {
  const directory = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const relative = posix.relative(directory, resolvedPath) || posix.basename(resolvedPath);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function rewriteMediaTarget(target: string, documentPath: string, media: Set<string>) {
  if (!target || EXTERNAL_TARGET_PATTERN.test(target)) return target;
  const resolved = resolveContentMediaPath(target, documentPath);
  if (!resolved) return target;
  const normalized = normalizeRelativePath(resolved);
  media.add(normalized);
  return relativeTarget(documentPath, normalized);
}

export function buildCanonicalDocument(
  record: ContentRecord,
  options: { clipping?: ContentClippingFrontmatter | null } = {}
): CanonicalDocument {
  if (record.type !== "post" && record.type !== "memo")
    throw new Error(`Unsupported content type for repository sync: ${record.type}`);
  const kind: ContentRepoKind = record.type;
  const path = canonicalContentPath(record);
  const media = new Set<string>();

  const body = normalizeContentBody(record.body).replace(
    MARKDOWN_TARGET_PATTERN,
    (match, target: string) => {
      const rewritten = rewriteMediaTarget(target, path, media);
      return rewritten === target ? match : match.replace(target, rewritten);
    }
  );

  const frontmatter: Record<string, unknown> = {
    title: record.title?.trim() || record.slug,
    slug: record.slug,
    date: isoDate(record.publishDate),
    updateDate: isoDate(record.updateDate),
    draft: record.draft,
    public: record.public,
    category: record.category?.trim() || null,
    tags: parseTags(record.tags),
    author: record.author?.trim() || null,
    image: record.image?.trim() || null,
  };

  if (frontmatter.image) {
    const cover = String(frontmatter.image);
    if (!EXTERNAL_TARGET_PATTERN.test(cover)) {
      const resolved = resolveContentMediaPath(cover, path);
      if (resolved) {
        const normalized = normalizeRelativePath(resolved);
        media.add(normalized);
        frontmatter.image = relativeTarget(path, normalized);
      }
    }
  }

  if (options.clipping) frontmatter.clipping = options.clipping;

  for (const [key, value] of Object.entries(frontmatter)) {
    if (value === null || value === undefined) delete frontmatter[key];
    if (Array.isArray(value) && value.length === 0) delete frontmatter[key];
  }

  const serialized = matter.stringify(`${body}\n`, frontmatter).replace(/\n*$/u, "\n");
  const bytes = new TextEncoder().encode(serialized);

  return { path, bytes, contentHash: sha256Hex(bytes), kind, media: [...media].sort() };
}
