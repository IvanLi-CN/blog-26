import { resolveImagePath } from "@/lib/image-utils";
import { toPublicAssetUrl } from "@/lib/public-runtime-url";

export const PUBLIC_CONTENT_KINDS = ["post", "memo"] as const;
export const PUBLIC_MEDIA_ASSET_SCOPES = ["public", "admin-preview"] as const;
export const PUBLIC_MEDIA_VARIANTS = [
  "card",
  "cover",
  "content",
  "full",
  "social",
  "poster",
  "play",
] as const;
export const PUBLIC_MEDIA_ROLES = ["cover", "content", "attachment", "playback"] as const;

export type PublicContentKind = (typeof PUBLIC_CONTENT_KINDS)[number];
export type PublicMediaAssetScope = (typeof PUBLIC_MEDIA_ASSET_SCOPES)[number];
export type PublicMediaVariant = (typeof PUBLIC_MEDIA_VARIANTS)[number];
export type PublicMediaRole = (typeof PUBLIC_MEDIA_ROLES)[number];
export type PublicMediaKind = "image" | "gif" | "video";

export interface PublicMediaContext {
  kind: PublicContentKind;
  slug: string;
  filePath: string;
  assetScope?: PublicMediaAssetScope;
}

export interface PublicMediaSourceDescriptor {
  variant: PublicMediaVariant;
  format: string;
  url: string;
  mimeType: string;
}

export interface PublicMediaItem {
  hash: string;
  kind: PublicMediaKind;
  role: PublicMediaRole;
  alt: string | null;
  sourcePath: string;
  variants: Partial<Record<PublicMediaVariant, string>>;
  poster: string | null;
  playback: string | null;
  sources: PublicMediaSourceDescriptor[];
}

export interface PublicMediaCollection {
  primary: PublicMediaItem | null;
  cover: PublicMediaItem | null;
  content: PublicMediaItem[];
  attachments: PublicMediaItem[];
}

export function createEmptyPublicMediaCollection(): PublicMediaCollection {
  return {
    primary: null,
    cover: null,
    content: [],
    attachments: [],
  };
}

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "ogv"]);
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "avif", "bmp", "svg", "ico"]);
const GIF_EXTENSIONS = new Set(["gif"]);
const FILES_API_PREFIX = "/api/files/";
const PUBLIC_ASSETS_PREFIX = "/api/public/assets/";
const ADMIN_PREVIEW_ASSETS_PREFIX = "/api/admin/preview/assets/";
const INLINE_MARKDOWN_LINK_RE =
  /(!?\[[^\]\n]*\]\()(\s*)(<[^>\n]+>|(?:[^\s()\\]+|\\.|\([^()\n]*\))+)([^)]*)(\))/g;

function normalizePathSeparators(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function trimAngleBrackets(value: string) {
  return value.trim().replace(/^<([^>]+)>$/u, "$1");
}

function stripQueryAndHash(value: string) {
  return value.replace(/[?#].*$/u, "");
}

function unwrapFilesApiPath(value: string) {
  if (!value.startsWith(FILES_API_PREFIX)) return value;
  const rest = value.slice(FILES_API_PREFIX.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex === -1) return null;
  return `/${rest.slice(slashIndex + 1)}`;
}

function decodePathSegments(value: string) {
  const decodedSegments: string[] = [];
  for (const segment of value.split("/")) {
    if (/%2f|%5c/i.test(segment)) {
      return null;
    }
    let decodedSegment = segment;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      decodedSegment = segment;
    }
    if (
      (decodedSegment === "." || decodedSegment === "..") &&
      segment !== "." &&
      segment !== ".."
    ) {
      return null;
    }
    decodedSegments.push(decodedSegment);
  }
  return decodedSegments.join("/");
}

function resolvePathSegments(baseSegments: string[], pathSegments: string[]) {
  const resolved = [...baseSegments];
  for (const segment of pathSegments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

function splitExtension(value: string) {
  const normalized = stripQueryAndHash(value).toLowerCase();
  const lastSegment = normalized.split("/").pop() || "";
  const dot = lastSegment.lastIndexOf(".");
  return dot >= 0 ? lastSegment.slice(dot + 1) : "";
}

export function isExternalMediaUrl(value: string) {
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("//");
}

export function isDataMediaUrl(value: string) {
  return value.trim().startsWith("data:");
}

export function isPublicAssetFacadeUrl(value: string) {
  const normalized = value.trim();
  return (
    normalized.startsWith(PUBLIC_ASSETS_PREFIX) ||
    normalized.startsWith(ADMIN_PREVIEW_ASSETS_PREFIX)
  );
}

export function isPublicContentKind(value: string): value is PublicContentKind {
  return (PUBLIC_CONTENT_KINDS as readonly string[]).includes(value);
}

export function isPublicMediaVariant(value: string): value is PublicMediaVariant {
  return (PUBLIC_MEDIA_VARIANTS as readonly string[]).includes(value);
}

export function normalizePublicMediaExt(value: string) {
  return splitExtension(value) || value.trim().toLowerCase();
}

export function detectPublicMediaKind(value: string): PublicMediaKind | null {
  const ext = normalizePublicMediaExt(value);
  if (GIF_EXTENSIONS.has(ext)) return "gif";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

export function isLocalPublicMediaDataSource(dataSource: string | null | undefined) {
  return !dataSource || dataSource.includes("local");
}

export function inferPublicMediaMimeType(value: string) {
  const ext = normalizePublicMediaExt(value);
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "m4v":
      return "video/x-m4v";
    case "webm":
      return "video/webm";
    case "ogv":
      return "video/ogg";
    default:
      return "application/octet-stream";
  }
}

export function resolveContentMediaPath(
  mediaPath: string,
  markdownFilePath: string
): string | null {
  const raw = trimAngleBrackets(mediaPath);
  if (!raw || isExternalMediaUrl(raw) || isDataMediaUrl(raw) || isPublicAssetFacadeUrl(raw)) {
    return null;
  }

  const fileApiNormalized = unwrapFilesApiPath(raw);
  if (fileApiNormalized == null) return null;

  const decoded = decodePathSegments(stripQueryAndHash(fileApiNormalized));
  if (decoded == null) return null;

  const clean = normalizePathSeparators(decoded);
  if (!clean) return null;

  const normalizedFilePath = normalizePathSeparators(markdownFilePath).replace(/^\/+/u, "");
  const markdownDirSegments = normalizedFilePath
    .split("/")
    .filter(Boolean)
    .slice(0, normalizedFilePath.includes("/") ? -1 : 0);
  const pathSegments = clean.split("/").filter(Boolean);
  const baseSegments = clean.startsWith("/") ? [] : markdownDirSegments;
  const resolved = resolvePathSegments(baseSegments, pathSegments);
  return resolved || null;
}

export function buildLegacyPublicMediaUrl(params: {
  mediaPath: string | null | undefined;
  dataSource: string | null | undefined;
  filePath?: string | null | undefined;
}) {
  if (!params.mediaPath) return params.mediaPath ?? null;
  const resolved =
    resolveImagePath(params.mediaPath, "local", params.filePath ?? undefined) ?? params.mediaPath;
  return toPublicAssetUrl(resolved) ?? resolved;
}

export function buildPublicMediaHash(normalizedPath: string, role: PublicMediaRole) {
  const input = `${role}:${normalizePathSeparators(normalizedPath).replace(/^\/+/u, "")}`;
  let h = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    h ^= input.charCodeAt(index);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function pickPublicMediaExt(
  kind: PublicMediaKind,
  sourcePath: string,
  variant: PublicMediaVariant
) {
  if (variant === "play" && kind === "video") {
    return normalizePublicMediaExt(sourcePath) || "mp4";
  }

  if (variant === "social" || variant === "poster") {
    return "jpg";
  }

  if (kind === "image") {
    return "webp";
  }

  if (kind === "gif") {
    return variant === "content" || variant === "full" ? "webp" : "jpg";
  }

  return "jpg";
}

export function buildPublicAssetPath(params: {
  scope?: PublicMediaAssetScope;
  kind: PublicContentKind;
  slug: string;
  mediaHash: string;
  variant: PublicMediaVariant;
  ext: string;
}) {
  const slug = encodeURIComponent(params.slug);
  const ext = normalizePublicMediaExt(params.ext) || "bin";
  const prefix =
    params.scope === "admin-preview" ? ADMIN_PREVIEW_ASSETS_PREFIX : PUBLIC_ASSETS_PREFIX;
  return `${prefix}${params.kind}/${slug}/${params.mediaHash}/${params.variant}.${ext}`;
}

export function buildInternalAssetSourcePath(params: {
  kind: PublicContentKind;
  slug: string;
  mediaHash: string;
}) {
  return `/_internal/assets/source/${params.kind}/${encodeURIComponent(params.slug)}/${params.mediaHash}`;
}

export function buildPublicMediaAssetUrl(params: {
  context: PublicMediaContext;
  mediaPath: string;
  role: PublicMediaRole;
  variant: PublicMediaVariant;
}) {
  const sourcePath = resolveContentMediaPath(params.mediaPath, params.context.filePath);
  if (!sourcePath) return null;

  const mediaKind = detectPublicMediaKind(sourcePath);
  if (!mediaKind) return null;

  const mediaHash = buildPublicMediaHash(sourcePath, params.role);
  const ext = pickPublicMediaExt(mediaKind, sourcePath, params.variant);
  return buildPublicAssetPath({
    scope: params.context.assetScope,
    kind: params.context.kind,
    slug: params.context.slug,
    mediaHash,
    variant: params.variant,
    ext,
  });
}

function restoreAngleBrackets(original: string, rewritten: string) {
  const trimmed = original.trim();
  return trimmed.startsWith("<") && trimmed.endsWith(">") ? `<${rewritten}>` : rewritten;
}

function rewritePublicContentTarget(
  target: string,
  context: PublicMediaContext,
  role: PublicMediaRole,
  variant: PublicMediaVariant
) {
  if (isPublicAssetFacadeUrl(target)) {
    return target;
  }
  const rewritten = buildPublicMediaAssetUrl({
    context,
    mediaPath: target,
    role,
    variant,
  });
  if (!rewritten) return null;
  return restoreAngleBrackets(target, rewritten);
}

function rewriteHtmlAttribute(
  tag: string,
  attribute: "href" | "poster" | "src",
  context: PublicMediaContext,
  role: PublicMediaRole,
  variant: PublicMediaVariant,
  shouldRewrite?: (value: string) => boolean
) {
  const pattern = new RegExp(`(\\b${attribute}=)(["'])([^"']+)(\\2)`, "iu");
  return tag.replace(
    pattern,
    (match, prefix: string, quote: string, value: string, suffix: string) => {
      if (shouldRewrite && !shouldRewrite(value)) {
        return match;
      }
      const rewritten = rewritePublicContentTarget(value, context, role, variant);
      if (!rewritten) return match;
      return `${prefix}${quote}${rewritten}${suffix}`;
    }
  );
}

export function rewritePublicContentMediaUrls(content: string, context: PublicMediaContext) {
  if (typeof content !== "string" || content.length === 0) {
    return content;
  }

  let rewritten = content.replace(
    INLINE_MARKDOWN_LINK_RE,
    (
      match: string,
      prefix: string,
      spacing: string,
      target: string,
      suffix: string,
      closing: string
    ) => {
      const mediaKind = detectPublicMediaKind(target);
      const isImage = prefix.startsWith("![");
      const role: PublicMediaRole = isImage || mediaKind !== "video" ? "content" : "playback";
      const variant: PublicMediaVariant = mediaKind === "video" && !isImage ? "play" : "content";
      const nextTarget = rewritePublicContentTarget(target, context, role, variant);
      if (!nextTarget) return match;
      return `${prefix}${spacing}${nextTarget}${suffix}${closing}`;
    }
  );

  rewritten = rewritten.replace(/<img\b[^>]*>/giu, (tag) =>
    rewriteHtmlAttribute(tag, "src", context, "content", "content")
  );

  rewritten = rewritten.replace(/<a\b[^>]*>/giu, (tag) =>
    rewriteHtmlAttribute(tag, "href", context, "content", "content", (value) => {
      const mediaKind = detectPublicMediaKind(value);
      return mediaKind === "image" || mediaKind === "gif";
    })
  );

  rewritten = rewritten.replace(/<a\b[^>]*>/giu, (tag) =>
    rewriteHtmlAttribute(tag, "href", context, "playback", "play", (value) => {
      return detectPublicMediaKind(value) === "video";
    })
  );

  rewritten = rewritten.replace(/<video\b[^>]*>/giu, (tag) => {
    const withSrc = rewriteHtmlAttribute(tag, "src", context, "playback", "play");
    return rewriteHtmlAttribute(withSrc, "poster", context, "content", "content");
  });

  rewritten = rewritten.replace(/<source\b[^>]*>/giu, (tag) =>
    rewriteHtmlAttribute(tag, "src", context, "playback", "play")
  );

  return rewritten;
}

export function pickPrimaryPublicMediaUrl(
  media: PublicMediaCollection | null | undefined,
  variant: PublicMediaVariant = "cover"
) {
  if (!media) return null;
  const preferred = media.cover ?? media.primary;
  return preferred?.variants[variant] ?? preferred?.poster ?? preferred?.playback ?? null;
}
