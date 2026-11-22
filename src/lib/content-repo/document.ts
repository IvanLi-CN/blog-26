import matter from "gray-matter";
import { normalizeContentBody } from "./canonical";

const FRONTMATTER_ORDER = [
  "title",
  "slug",
  "date",
  "updateDate",
  "draft",
  "public",
  "category",
  "tags",
  "author",
  "image",
  "clipping",
] as const;

export interface ParsedRemoteDocument {
  frontmatter: Record<string, unknown>;
  body: string;
}

export interface RemoteDocumentUpdate {
  slug: string;
  title: string;
  body: string;
  draft: boolean;
  public: boolean;
  category: string | null;
  tags: string[];
  author: string | null;
  image: string | null;
  publishDate: number;
  updateDate: number | null;
}

/** Serialize a merged document back into the canonical form, in canonical key order. */
export function serializeCanonicalDocument(
  frontmatter: Record<string, unknown>,
  body: string
): Uint8Array {
  const ordered: Record<string, unknown> = {};
  for (const key of FRONTMATTER_ORDER)
    if (frontmatter[key] !== undefined) ordered[key] = frontmatter[key];
  for (const [key, value] of Object.entries(frontmatter))
    if (!(key in ordered) && value !== undefined) ordered[key] = value;
  const text = matter.stringify(`${normalizeContentBody(body)}\n`, ordered).replace(/\n*$/u, "\n");
  return new TextEncoder().encode(text);
}

export class RemoteDocumentInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteDocumentInvalidError";
  }
}

function readString(frontmatter: Record<string, unknown>, key: string): string | null {
  const value = frontmatter[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string")
    throw new RemoteDocumentInvalidError(`frontmatter ${key} is not a string`);
  return value.trim() || null;
}

function readDate(frontmatter: Record<string, unknown>, key: string): number | null {
  const value = frontmatter[key];
  if (value === undefined || value === null) return null;
  const text = value instanceof Date ? value.toISOString() : String(value);
  const parsed = Date.parse(text);
  if (Number.isNaN(parsed))
    throw new RemoteDocumentInvalidError(`frontmatter ${key} is not a date`);
  return parsed;
}

function readTags(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.tags;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new RemoteDocumentInvalidError("frontmatter tags is not a list");
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parseRemoteDocument(bytes: Uint8Array): ParsedRemoteDocument {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!/^\uFEFF?---\r?\n/u.test(text))
    throw new RemoteDocumentInvalidError("remote document has no frontmatter");
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(text);
  } catch (error) {
    throw new RemoteDocumentInvalidError(
      `remote document frontmatter is malformed: ${error instanceof Error ? error.message : ""}`
    );
  }
  if (!parsed.data || typeof parsed.data !== "object")
    throw new RemoteDocumentInvalidError("remote document frontmatter is not a mapping");
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    body: normalizeContentBody(parsed.content.replace(/^\n+/u, "")),
  };
}

export function toDocumentUpdate(parsed: ParsedRemoteDocument): RemoteDocumentUpdate {
  const slug = readString(parsed.frontmatter, "slug");
  const title = readString(parsed.frontmatter, "title");
  if (!slug) throw new RemoteDocumentInvalidError("remote document is missing slug");
  if (!title) throw new RemoteDocumentInvalidError("remote document is missing title");
  const draft = parsed.frontmatter.draft;
  const isPublic = parsed.frontmatter.public;
  if (typeof draft !== "boolean")
    throw new RemoteDocumentInvalidError("remote document draft is not a boolean");
  if (typeof isPublic !== "boolean")
    throw new RemoteDocumentInvalidError("remote document public is not a boolean");
  const publishDate = readDate(parsed.frontmatter, "date");
  if (publishDate === null) throw new RemoteDocumentInvalidError("remote document is missing date");
  return {
    slug,
    title,
    body: parsed.body,
    draft,
    public: isPublic,
    category: readString(parsed.frontmatter, "category"),
    tags: readTags(parsed.frontmatter),
    author: readString(parsed.frontmatter, "author"),
    image: readString(parsed.frontmatter, "image"),
    publishDate,
    updateDate: readDate(parsed.frontmatter, "updateDate"),
  };
}
