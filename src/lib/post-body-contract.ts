import yaml from "js-yaml";
import { parseFrontmatterDocument, stringifyFrontmatterDocument } from "@/lib/frontmatter-document";

export type PostContractStructuredFields = {
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  draft?: boolean | null;
  public?: boolean | null;
  category?: string | null;
  author?: string | null;
  image?: string | null;
  publishDate?: number | string | null;
  updateDate?: number | string | null;
  tags?: string[] | string | null;
};

export type NormalizedPostBody = {
  body: string;
  frontmatter: Record<string, unknown>;
  wasContaminated: boolean;
};

export type PostAuthoringDocument = {
  content: string;
  body: string;
  frontmatter: Record<string, unknown>;
  wasContaminated: boolean;
};

export type ExtractedPostDraftFields = {
  title: string;
  slug: string;
  excerpt: string;
  draft: boolean;
  public: boolean;
  category: string | null;
  author: string | null;
  image: string | null;
  publishDate: number | null;
  updateDate: number | null;
  tags: string[];
  body: string;
  frontmatter: Record<string, unknown>;
};

function trimString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeOptionalText(value: unknown): string | null {
  const trimmed = trimString(value);
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeDateValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeStructuredTags(value: PostContractStructuredFields["tags"]): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
      }
    } catch {
      return normalizeTags(value);
    }
  }
  return [];
}

function buildFrontmatterFromStructuredFields(
  fields: PostContractStructuredFields,
  fallback: Record<string, unknown> = {},
  options: { preferFallback?: boolean } = {}
) {
  const next: Record<string, unknown> = {};
  const preferFallback = options.preferFallback ?? false;
  const pickText = (primary: unknown, secondary: unknown) =>
    preferFallback
      ? (normalizeOptionalText(secondary) ?? normalizeOptionalText(primary))
      : (normalizeOptionalText(primary) ?? normalizeOptionalText(secondary));
  const pickDate = (primary: unknown, secondary: unknown) =>
    preferFallback
      ? (normalizeDateValue(secondary) ?? normalizeDateValue(primary))
      : (normalizeDateValue(primary) ?? normalizeDateValue(secondary));

  const title = pickText(fields.title, fallback.title);
  if (title) next.title = title;

  const slug = pickText(fields.slug, fallback.slug);
  if (slug) next.slug = slug;

  const excerpt = pickText(fields.excerpt, fallback.excerpt);
  if (excerpt) next.excerpt = excerpt;

  if (typeof fields.draft === "boolean") {
    next.draft = fields.draft;
  } else if (typeof fallback.draft === "boolean" && preferFallback) {
    next.draft = fallback.draft;
  }
  if (typeof fields.public === "boolean") {
    next.public = fields.public;
  } else if (typeof fallback.public === "boolean" && preferFallback) {
    next.public = fallback.public;
  }

  const category = pickText(fields.category, fallback.category);
  if (category) next.category = category;

  const author = pickText(fields.author, fallback.author);
  if (author) next.author = author;

  const image = pickText(fields.image, fallback.image);
  if (image) next.image = image;

  const tags = preferFallback ? normalizeTags(fallback.tags) : normalizeStructuredTags(fields.tags);
  const fallbackTags = preferFallback
    ? normalizeStructuredTags(fields.tags)
    : normalizeTags(fallback.tags);
  if (tags.length > 0) next.tags = tags;
  else if (fallbackTags.length > 0) next.tags = fallbackTags;

  const publishDate = pickDate(fields.publishDate, fallback.publishDate);
  if (publishDate) {
    next.publishDate = new Date(publishDate).toISOString().slice(0, 10);
  }

  const updateDate = pickDate(fields.updateDate, fallback.updateDate);
  if (updateDate) {
    next.updateDate = new Date(updateDate).toISOString().slice(0, 10);
  }

  return next;
}

function deriveTitleFromBody(body: string) {
  const heading = body.match(/^\s*#\s+(.+?)\s*$/m)?.[1]?.trim();
  if (heading) return heading;

  const firstLine = body
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "";
  return firstLine.replace(/^#+\s*/, "").slice(0, 80);
}

function deriveSlugValue(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `untitled-${Date.now()}`
  );
}

function deriveExcerptFromBody(body: string) {
  return body
    .replace(/[#*`_~[\]()!-]/g, "")
    .trim()
    .slice(0, 150);
}

export function normalizePostBody(body: string): NormalizedPostBody {
  const parsed = parseFrontmatterDocument(body);
  if (!parsed.hasFrontmatter) {
    return {
      body,
      frontmatter: {},
      wasContaminated: false,
    };
  }

  return {
    body: parsed.body,
    frontmatter: parsed.frontmatter,
    wasContaminated: true,
  };
}

export function buildPostAuthoringDocument(
  fields: PostContractStructuredFields & { body?: string | null },
  options: { preferEmbeddedFrontmatter?: boolean } = {}
): PostAuthoringDocument {
  const normalized = normalizePostBody(fields.body ?? "");
  const frontmatter = buildFrontmatterFromStructuredFields(fields, normalized.frontmatter, {
    preferFallback: options.preferEmbeddedFrontmatter,
  });
  const frontmatterText =
    Object.keys(frontmatter).length > 0
      ? yaml.dump(frontmatter, { lineWidth: -1, noRefs: true }).trimEnd()
      : "";
  return {
    content: stringifyFrontmatterDocument(normalized.body, frontmatterText),
    body: normalized.body,
    frontmatter,
    wasContaminated: normalized.wasContaminated,
  };
}

export function extractPostDraftFields(
  content: string,
  persisted: PostContractStructuredFields
): ExtractedPostDraftFields {
  const parsed = parseFrontmatterDocument(content);
  const body = parsed.body;
  const frontmatter = parsed.frontmatter;

  const frontmatterTitle = normalizeOptionalText(frontmatter.title);
  const headingTitle = deriveTitleFromBody(body);
  const persistedTitle = normalizeOptionalText(persisted.title);
  const title = frontmatterTitle ?? headingTitle ?? persistedTitle ?? "未命名文章";

  const frontmatterSlug = normalizeOptionalText(frontmatter.slug);
  const persistedSlug = normalizeOptionalText(persisted.slug);
  const slug = frontmatterSlug ?? persistedSlug ?? deriveSlugValue(title);

  const frontmatterExcerpt = normalizeOptionalText(frontmatter.excerpt);
  const persistedExcerpt = normalizeOptionalText(persisted.excerpt);
  const excerpt = frontmatterExcerpt ?? persistedExcerpt ?? deriveExcerptFromBody(body);

  const tags = (() => {
    const fromFrontmatter = normalizeTags(frontmatter.tags);
    if (fromFrontmatter.length > 0) return fromFrontmatter;
    return normalizeStructuredTags(persisted.tags);
  })();

  const category =
    normalizeOptionalText(frontmatter.category) ?? normalizeOptionalText(persisted.category);
  const author =
    normalizeOptionalText(frontmatter.author) ?? normalizeOptionalText(persisted.author);
  const image = normalizeOptionalText(frontmatter.image) ?? normalizeOptionalText(persisted.image);
  const publishDate =
    normalizeDateValue(frontmatter.publishDate) ?? normalizeDateValue(persisted.publishDate);
  const updateDate =
    normalizeDateValue(frontmatter.updateDate) ?? normalizeDateValue(persisted.updateDate);

  return {
    title,
    slug,
    excerpt,
    draft: normalizeBoolean(frontmatter.draft, persisted.draft ?? true),
    public: normalizeBoolean(frontmatter.public, persisted.public ?? false),
    category,
    author,
    image,
    publishDate,
    updateDate,
    tags,
    body,
    frontmatter,
  };
}
