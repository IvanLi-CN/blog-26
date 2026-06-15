import { createHmac } from "node:crypto";
import { stat } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { getLocalPath, isLocalContentEnabled } from "@/config/paths";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import { db, initializeDB } from "@/lib/db";
import { resolveImagePath } from "@/lib/image-utils";
import { normalizePersistedLink } from "@/lib/persisted-paths";
import { getPostCoverCandidates, normalizeWikiImageTarget } from "@/lib/post-cover";
import {
  buildInternalAssetSourcePath,
  buildPublicAssetPath,
  buildPublicMediaHash,
  createEmptyPublicMediaCollection,
  detectPublicMediaKind,
  inferPublicMediaMimeType,
  isExternalMediaUrl,
  isPublicContentKind,
  isPublicMediaVariant,
  normalizePublicMediaExt,
  type PublicContentKind,
  type PublicMediaCollection,
  type PublicMediaContext,
  type PublicMediaItem,
  type PublicMediaKind,
  type PublicMediaRole,
  type PublicMediaSourceDescriptor,
  pickPublicMediaExt,
  resolveContentMediaPath,
} from "@/lib/public-media";
import { toPublicAssetUrl } from "@/lib/public-runtime-url";
import { posts } from "@/lib/schema";

type ContentRow = typeof posts.$inferSelect;

type MediaReference = {
  hash: string;
  kind: PublicMediaKind;
  role: PublicMediaRole;
  alt: string | null;
  sourcePath: string;
  mimeType: string;
};

type MediaVariantRecipe = {
  width: number;
  height: number;
};

const IMAGE_VARIANT_RECIPES: Record<
  "card" | "cover" | "content" | "full" | "social" | "poster",
  MediaVariantRecipe
> = {
  card: { width: 960, height: 640 },
  cover: { width: 1600, height: 900 },
  content: { width: 1440, height: 0 },
  full: { width: 1920, height: 0 },
  social: { width: 1200, height: 630 },
  poster: { width: 1280, height: 720 },
};

const VARIANT_RECIPES = {
  ...IMAGE_VARIANT_RECIPES,
  play: { width: 0, height: 0 },
} as const;

const IMAGE_DISPLAY_VARIANTS = ["card", "cover", "content", "full", "social"] as const;
const VIDEO_DISPLAY_VARIANTS = ["card", "cover", "content", "full", "social", "poster"] as const;

function shouldUsePublicMediaFacadeForRow(_row: Pick<ContentRow, "dataSource">) {
  return true;
}

function getCanonicalFilePath(row: ContentRow) {
  const filePath = row.filePath?.trim() || row.id.trim();
  if (!filePath) {
    throw new Error(`Content row ${row.slug || row.id} is missing a canonical file path`);
  }
  return filePath;
}

function parseMetadataObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseAttachments(
  row: ContentRow
): Array<{ filename?: string; path: string; isImage?: boolean; contentType?: string }> {
  const metadata = parseMetadataObject(row.metadata);
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
  const markdownFilePath = getCanonicalFilePath(row);

  return attachments
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.path !== "string" || !candidate.path.trim()) return null;
      const normalizedPath = normalizePersistedLink(candidate.path, markdownFilePath);
      return {
        filename: typeof candidate.filename === "string" ? candidate.filename : undefined,
        path: normalizedPath,
        isImage: candidate.isImage === true,
        contentType: typeof candidate.contentType === "string" ? candidate.contentType : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeMarkdownTarget(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("<")) {
    const match = /^<([^>]+)>/u.exec(trimmed);
    if (match) return match[1].trim();
  }
  return trimmed
    .replace(/\s+"[^"]*"\s*$/u, "")
    .replace(/\s+'[^']*'\s*$/u, "")
    .replace(/\s+\([^)]*\)\s*$/u, "")
    .trim();
}

function collectMarkdownImageRefs(content: string) {
  const refs: Array<{ path: string; alt: string | null }> = [];
  const markdownImage = /!\[([^\]]*)\]\(([^)]+)\)/gu;
  for (const match of content.matchAll(markdownImage)) {
    const path = normalizeMarkdownTarget(match[2] || "");
    if (!path) continue;
    refs.push({ path, alt: match[1]?.trim() || null });
  }

  const wikiImage = /!\[\[([^\]]+)\]\]/gu;
  for (const match of content.matchAll(wikiImage)) {
    const path = normalizeWikiImageTarget(match[1] || "");
    if (!path) continue;
    refs.push({ path, alt: null });
  }

  return refs;
}

function collectHtmlMediaRefs(content: string) {
  const refs: Array<{ path: string; alt: string | null; role: PublicMediaRole }> = [];

  const imgTag = /<img\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>/giu;
  for (const match of content.matchAll(imgTag)) {
    const path = match[2]?.trim();
    if (!path) continue;
    const altMatch = /\balt=(["'])([^"']*)\1/iu.exec(match[0] || "");
    refs.push({ path, alt: altMatch?.[2]?.trim() || null, role: "content" });
  }

  const videoTag = /<video\b[^>]*>/giu;
  for (const match of content.matchAll(videoTag)) {
    const srcMatch = /\bsrc=(["'])([^"']+)\1/iu.exec(match[0] || "");
    if (srcMatch?.[2]?.trim()) {
      refs.push({ path: srcMatch[2].trim(), alt: null, role: "playback" });
    }
    const posterMatch = /\bposter=(["'])([^"']+)\1/iu.exec(match[0] || "");
    if (posterMatch?.[2]?.trim()) {
      refs.push({ path: posterMatch[2].trim(), alt: null, role: "content" });
    }
  }

  const sourceTag = /<source\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>/giu;
  for (const match of content.matchAll(sourceTag)) {
    const path = match[2]?.trim();
    if (!path) continue;
    refs.push({ path, alt: null, role: "playback" });
  }

  return refs;
}

function buildMediaReference(params: {
  mediaPath: string;
  markdownFilePath: string;
  role: PublicMediaRole;
  alt?: string | null;
}): MediaReference | null {
  const sourcePath = resolveContentMediaPath(params.mediaPath, params.markdownFilePath);
  if (!sourcePath) return null;

  const kind = detectPublicMediaKind(sourcePath);
  if (!kind) return null;

  return {
    hash: buildPublicMediaHash(sourcePath, params.role),
    kind,
    role: params.role,
    alt: params.alt?.trim() || null,
    sourcePath,
    mimeType: inferPublicMediaMimeType(sourcePath),
  };
}

function dedupeMediaReferences(refs: MediaReference[]) {
  const seen = new Set<string>();
  const result: MediaReference[] = [];
  for (const ref of refs) {
    if (seen.has(ref.hash)) continue;
    seen.add(ref.hash);
    result.push(ref);
  }
  return result;
}

function buildContentMediaReferences(kind: PublicContentKind, row: ContentRow) {
  const markdownFilePath = getCanonicalFilePath(row);
  const refs: MediaReference[] = [];

  if (kind === "post") {
    const coverCandidates = getPostCoverCandidates({
      image: row.image,
      metadata: parseMetadataObject(row.metadata),
      body: row.body,
    });
    for (const candidate of coverCandidates) {
      if (!candidate || isExternalMediaUrl(candidate)) continue;
      const ref = buildMediaReference({
        mediaPath: candidate,
        markdownFilePath,
        role: "cover",
        alt: row.title,
      });
      if (ref) refs.push(ref);
    }
  } else if (row.image && !isExternalMediaUrl(row.image)) {
    const coverRef = buildMediaReference({
      mediaPath: row.image,
      markdownFilePath,
      role: "cover",
      alt: row.title,
    });
    if (coverRef) refs.push(coverRef);
  }

  for (const item of collectMarkdownImageRefs(row.body || "")) {
    if (isExternalMediaUrl(item.path)) continue;
    const role = detectPublicMediaKind(item.path) === "video" ? "playback" : "content";
    const ref = buildMediaReference({
      mediaPath: item.path,
      markdownFilePath,
      role,
      alt: item.alt,
    });
    if (ref) refs.push(ref);
  }

  for (const item of collectHtmlMediaRefs(row.body || "")) {
    if (isExternalMediaUrl(item.path)) continue;
    const ref = buildMediaReference({
      mediaPath: item.path,
      markdownFilePath,
      role: item.role,
      alt: item.alt,
    });
    if (ref) refs.push(ref);
  }

  if (kind === "memo") {
    for (const attachment of parseAttachments(row)) {
      if (isExternalMediaUrl(attachment.path)) continue;
      const role: PublicMediaRole =
        detectPublicMediaKind(attachment.path) === "video" ? "playback" : "attachment";
      const ref = buildMediaReference({
        mediaPath: attachment.path,
        markdownFilePath,
        role,
        alt: attachment.filename ?? row.title,
      });
      if (ref) refs.push(ref);
    }
  }

  return dedupeMediaReferences(refs);
}

function pickRasterFallbackExt(ref: MediaReference) {
  const sourceExt = normalizePublicMediaExt(ref.sourcePath);
  if (ref.kind === "gif") {
    return "gif";
  }
  if (sourceExt === "png" || sourceExt === "svg") {
    return "png";
  }
  return "jpg";
}

function buildSourceDescriptors(context: PublicMediaContext, ref: MediaReference) {
  const descriptors: PublicMediaSourceDescriptor[] = [];

  if (ref.kind === "video") {
    for (const variant of VIDEO_DISPLAY_VARIANTS) {
      for (const format of ["avif", "webp", "jpg"]) {
        const url = buildPublicAssetPath({
          kind: context.kind,
          slug: context.slug,
          mediaHash: ref.hash,
          variant,
          ext: format,
        });
        descriptors.push({
          variant,
          format,
          url,
          mimeType: inferPublicMediaMimeType(format),
        });
      }
    }
    return descriptors;
  }

  const rasterFormats =
    ref.kind === "gif"
      ? (["webp", "gif"] as const)
      : (["avif", "webp", pickRasterFallbackExt(ref)] as const);

  for (const variant of IMAGE_DISPLAY_VARIANTS) {
    for (const format of rasterFormats) {
      const url = buildPublicAssetPath({
        kind: context.kind,
        slug: context.slug,
        mediaHash: ref.hash,
        variant,
        ext: format,
      });
      descriptors.push({
        variant,
        format,
        url,
        mimeType: inferPublicMediaMimeType(format),
      });
    }
  }

  return descriptors;
}

function buildPublicMediaItem(context: PublicMediaContext, ref: MediaReference): PublicMediaItem {
  const variants: Partial<
    Record<"card" | "cover" | "content" | "full" | "social" | "poster", string>
  > = {};
  if (ref.kind === "video") {
    for (const variant of VIDEO_DISPLAY_VARIANTS) {
      variants[variant] = buildPublicAssetPath({
        kind: context.kind,
        slug: context.slug,
        mediaHash: ref.hash,
        variant,
        ext: variant === "social" ? "jpg" : pickPublicMediaExt("video", ref.sourcePath, variant),
      });
    }
  } else {
    for (const variant of IMAGE_DISPLAY_VARIANTS) {
      variants[variant] = buildPublicAssetPath({
        kind: context.kind,
        slug: context.slug,
        mediaHash: ref.hash,
        variant,
        ext: pickPublicMediaExt(ref.kind, ref.sourcePath, variant),
      });
    }
  }

  const playback =
    ref.kind === "video"
      ? buildPublicAssetPath({
          kind: context.kind,
          slug: context.slug,
          mediaHash: ref.hash,
          variant: "play",
          ext: normalizePublicMediaExt(ref.sourcePath) || "mp4",
        })
      : null;

  const poster =
    ref.kind === "video"
      ? buildPublicAssetPath({
          kind: context.kind,
          slug: context.slug,
          mediaHash: ref.hash,
          variant: "poster",
          ext: "jpg",
        })
      : null;

  return {
    hash: ref.hash,
    kind: ref.kind,
    role: ref.role,
    alt: ref.alt,
    sourcePath: ref.sourcePath,
    variants,
    poster,
    playback,
    sources: buildSourceDescriptors(context, ref),
  };
}

export function buildPublicMediaCollection(
  kind: PublicContentKind,
  row: ContentRow
): PublicMediaCollection {
  if (!shouldUsePublicMediaFacadeForRow(row)) {
    return createEmptyPublicMediaCollection();
  }
  const context: PublicMediaContext = {
    kind,
    slug: row.slug,
    filePath: getCanonicalFilePath(row),
  };
  const refs = buildContentMediaReferences(kind, row);
  const items = refs.map((ref) => buildPublicMediaItem(context, ref));
  const cover = items.find((item) => item.role === "cover") ?? null;
  const primary =
    cover ??
    items.find((item) => item.kind === "image" || item.kind === "gif") ??
    items.find((item) => item.kind === "video") ??
    null;

  return {
    primary,
    cover,
    content: items.filter((item) => item.role === "content" || item.role === "playback"),
    attachments: items.filter((item) => item.role === "attachment"),
  };
}

export function rewritePublicMemoAttachments(row: ContentRow, media: PublicMediaCollection) {
  if (!shouldUsePublicMediaFacadeForRow(row)) {
    return parseAttachments(row).map((attachment) => ({
      ...attachment,
      path:
        toPublicAssetUrl(
          resolveImagePath(attachment.path, "local", getCanonicalFilePath(row)) ?? attachment.path
        ) ?? attachment.path,
    }));
  }

  const attachmentMap = new Map(
    media.attachments.map((item) => [
      item.sourcePath,
      item.playback ?? item.variants.content ?? item.variants.cover ?? item.poster,
    ])
  );
  const playbackMap = new Map(
    media.content
      .filter((item) => item.kind === "video" && item.playback)
      .map((item) => [item.sourcePath, item.playback as string])
  );

  return parseAttachments(row).map((attachment) => {
    const sourcePath = resolveContentMediaPath(attachment.path, getCanonicalFilePath(row));
    if (!sourcePath) return attachment;
    const resolvedPath =
      attachmentMap.get(sourcePath) ?? playbackMap.get(sourcePath) ?? attachment.path;
    return {
      ...attachment,
      path: resolvedPath,
    };
  });
}

export function pickLegacyPublicImage(
  media: PublicMediaCollection,
  preferredVariant: "card" | "cover" | "content" = "cover"
) {
  return (
    media.cover?.variants[preferredVariant] ??
    media.primary?.variants[preferredVariant] ??
    media.primary?.poster ??
    media.primary?.playback ??
    null
  );
}

async function readImageDimensions(sourcePath: string) {
  try {
    const metadata = await sharp(getLocalPath(sourcePath), { animated: true }).metadata();
    return {
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
    };
  } catch {
    return null;
  }
}

async function shouldApplyWatermark(
  ref: MediaReference,
  variant: keyof typeof IMAGE_VARIANT_RECIPES
) {
  if (ref.kind === "video") {
    const recipe = IMAGE_VARIANT_RECIPES[variant];
    return (
      recipe.width >= 240 &&
      recipe.height >= 160 &&
      recipe.width * Math.max(recipe.height, 1) >= 80000
    );
  }

  const dimensions = await readImageDimensions(ref.sourcePath);
  if (!dimensions) return true;
  const width = dimensions.width || IMAGE_VARIANT_RECIPES[variant].width;
  const height =
    dimensions.height || IMAGE_VARIANT_RECIPES[variant].height || Math.floor(width * 0.75);
  return width >= 240 && height >= 160 && width * height >= 80000;
}

function getImagorBaseUrl() {
  return (process.env.PUBLIC_MEDIA_IMAGOR_BASE_URL || "http://imagorvideo:8000").replace(
    /\/+$/u,
    ""
  );
}

function getInternalSourceBaseUrl(request: Request) {
  const configured = process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/u, "");
  }
  return new URL(request.url).origin.replace(/\/+$/u, "");
}

function getConfiguredInternalSourceHost() {
  const configured = process.env.PUBLIC_MEDIA_INTERNAL_SOURCE_BASE_URL?.trim();
  if (!configured) return null;
  try {
    return new URL(configured).host.toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedInternalSourceRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const configuredHost = getConfiguredInternalSourceHost();
  if (!configuredHost) {
    return false;
  }
  return requestUrl.host.toLowerCase() === configuredHost;
}

function getImagorSignerType() {
  const raw = (
    process.env.PUBLIC_MEDIA_IMAGOR_SIGNER_TYPE ||
    process.env.IMAGOR_SIGNER_TYPE ||
    "sha1"
  )
    .trim()
    .toLowerCase();
  return raw === "sha256" || raw === "sha512" ? raw : "sha1";
}

function getImagorSignerTruncate() {
  const raw = Number(
    process.env.PUBLIC_MEDIA_IMAGOR_SIGNER_TRUNCATE || process.env.IMAGOR_SIGNER_TRUNCATE || ""
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
}

function signImagorPath(path: string) {
  const secret =
    process.env.PUBLIC_MEDIA_IMAGOR_SECRET?.trim() || process.env.IMAGOR_SECRET?.trim();
  if (!secret) {
    return `unsafe/${path}`;
  }

  const algorithm = getImagorSignerType();
  let digest = createHmac(algorithm, secret)
    .update(path)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const truncate = getImagorSignerTruncate();
  if (truncate) {
    digest = digest.slice(0, truncate);
  }
  return `${digest}/${path}`;
}

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function getWatermarkFilter() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 48">',
    '<text x="120" y="33" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" fill="rgba(255,255,255,0.82)">ivanli.cc</text>',
    "</svg>",
  ].join("");
  const dataUri = `data:image/svg+xml;utf8,${svg}`;
  return `watermark(b64:${toBase64Url(dataUri)},-24,-24,18,22,22)`;
}

async function buildImagorPath(params: {
  request: Request;
  context: PublicMediaContext;
  ref: MediaReference;
  variant: Exclude<keyof typeof VARIANT_RECIPES, "play">;
  ext: string;
}) {
  const recipe = IMAGE_VARIANT_RECIPES[params.variant];
  const format =
    normalizePublicMediaExt(params.ext) ||
    pickPublicMediaExt(params.ref.kind, params.ref.sourcePath, params.variant);
  const sourceUrl = `${getInternalSourceBaseUrl(params.request)}${buildInternalAssetSourcePath({
    kind: params.context.kind,
    slug: params.context.slug,
    mediaHash: params.ref.hash,
  })}`;

  const filters: string[] = [];
  if (params.ref.kind === "video") {
    filters.push("frame(0)");
  } else if (
    params.ref.kind === "gif" &&
    params.variant !== "content" &&
    params.variant !== "full"
  ) {
    filters.push("frame(0)");
  }
  filters.push(`format(${format})`);
  if (await shouldApplyWatermark(params.ref, params.variant)) {
    filters.push(getWatermarkFilter());
  }

  const resizeSegment = `fit-in/${recipe.width}x${recipe.height}`;
  const filterSegment = filters.length > 0 ? `/filters:${filters.join(":")}` : "";
  return `${resizeSegment}${filterSegment}/${sourceUrl}`;
}

function forwardProxyHeaders(upstream: Response) {
  const headers = new Headers();
  const allow = [
    "cache-control",
    "content-type",
    "content-length",
    "etag",
    "last-modified",
    "accept-ranges",
    "content-range",
  ];
  for (const key of allow) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }
  return headers;
}

function createRangeResponseHeaders(params: {
  mimeType: string;
  size: number;
  lastModified: Date;
  start?: number;
  end?: number;
  partial: boolean;
}) {
  const headers = new Headers({
    "content-type": params.mimeType,
    "accept-ranges": "bytes",
    "last-modified": params.lastModified.toUTCString(),
    "cache-control": "public, max-age=31536000, immutable",
  });

  const contentLength =
    params.partial && params.start !== undefined && params.end !== undefined
      ? params.end - params.start + 1
      : params.size;
  headers.set("content-length", String(contentLength));
  if (params.partial && params.start !== undefined && params.end !== undefined) {
    headers.set("content-range", `bytes ${params.start}-${params.end}/${params.size}`);
  }
  return headers;
}

function parseRangeHeader(rangeHeader: string | null, size: number) {
  if (!rangeHeader?.startsWith("bytes=")) return null;
  const [startRaw, endRaw] = rangeHeader.replace(/^bytes=/u, "").split("-", 2);
  const start = startRaw ? Number(startRaw) : 0;
  const end = endRaw ? Number(endRaw) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= size) {
    return null;
  }
  return { start, end };
}

async function streamLocalMediaFile(request: Request, ref: MediaReference) {
  if (!isLocalContentEnabled()) {
    return Response.json({ error: "Local content source is disabled" }, { status: 503 });
  }

  const absolutePath = getLocalPath(ref.sourcePath);
  const info = await stat(absolutePath);
  const file = Bun.file(absolutePath);
  const range = parseRangeHeader(request.headers.get("range"), info.size);

  if (request.method === "HEAD") {
    return new Response(null, {
      status: range ? 206 : 200,
      headers: createRangeResponseHeaders({
        mimeType: ref.mimeType,
        size: info.size,
        lastModified: info.mtime,
        start: range?.start,
        end: range?.end,
        partial: Boolean(range),
      }),
    });
  }

  const body =
    range && range.start !== undefined && range.end !== undefined
      ? file.slice(range.start, range.end + 1)
      : file;

  return new Response(body, {
    status: range ? 206 : 200,
    headers: createRangeResponseHeaders({
      mimeType: ref.mimeType,
      size: info.size,
      lastModified: info.mtime,
      start: range?.start,
      end: range?.end,
      partial: Boolean(range),
    }),
  });
}

function shouldUseDevSourceFallback() {
  const raw = process.env.PUBLIC_MEDIA_DEV_SOURCE_FALLBACK?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

function shouldPreferDevSourceFallback() {
  const raw = process.env.PUBLIC_MEDIA_PREFER_DEV_SOURCE_FALLBACK?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  return false;
}

function createMediaProcessorUnavailableResponse(request: Request) {
  const headers = new Headers({
    "cache-control": "no-store",
  });
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 502,
      statusText: "Bad Gateway",
      headers,
    });
  }
  return Response.json(
    { error: "Public media processor unavailable" },
    {
      status: 502,
      headers,
    }
  );
}

async function streamDevSourceFallback(request: Request, ref: MediaReference) {
  const upstream = await streamLocalMediaFile(request, ref);
  const headers = new Headers(upstream.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-public-media-fallback", "source");
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function loadContentRow(
  kind: PublicContentKind,
  slug: string,
  request: Request,
  internalOnly = false
) {
  await initializeDB();
  const row = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.type, kind)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) return null;
  if (internalOnly) return row;
  if (row.public && (kind !== "post" || !row.draft)) {
    return row;
  }

  const auth = await extractAuthFromRequest(request);
  return auth.isAdmin ? row : null;
}

async function resolveMediaReferenceFromRequest(
  request: Request,
  params: { kind: PublicContentKind; slug: string; mediaHash: string },
  internalOnly = false
) {
  const row = await loadContentRow(params.kind, params.slug, request, internalOnly);
  if (!row) return null;
  const refs = buildContentMediaReferences(params.kind, row);
  const ref = refs.find((item) => item.hash === params.mediaHash) ?? null;
  if (!ref) return null;
  return {
    row,
    ref,
    context: {
      kind: params.kind,
      slug: row.slug,
      filePath: getCanonicalFilePath(row),
    } satisfies PublicMediaContext,
  };
}

export async function handlePublicAssetFacadeRequest(
  request: Request,
  params: { kind: string; slug: string; mediaHash: string; variant: string; ext: string }
) {
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    !isPublicContentKind(params.kind)
  ) {
    return new Response("Not Found", { status: 404 });
  }
  if (!isPublicMediaVariant(params.variant)) {
    return new Response("Not Found", { status: 404 });
  }

  const resolved = await resolveMediaReferenceFromRequest(request, {
    kind: params.kind,
    slug: params.slug,
    mediaHash: params.mediaHash,
  });
  if (!resolved) {
    return new Response("Not Found", { status: 404 });
  }

  if (params.variant === "play") {
    if (resolved.ref.kind !== "video") {
      return new Response("Not Found", { status: 404 });
    }
    return streamLocalMediaFile(request, resolved.ref);
  }

  if (
    shouldPreferDevSourceFallback() &&
    shouldUseDevSourceFallback() &&
    resolved.ref.kind !== "video"
  ) {
    return streamDevSourceFallback(request, resolved.ref);
  }

  const imagorPath = await buildImagorPath({
    request,
    context: resolved.context,
    ref: resolved.ref,
    variant: params.variant,
    ext: params.ext,
  });
  const imagorUrl = `${getImagorBaseUrl()}/${signImagorPath(imagorPath)}`;
  let upstream: Response;
  try {
    upstream = await fetch(imagorUrl, {
      method: request.method,
      headers: new Headers({
        accept: request.headers.get("accept") || "*/*",
        ...(request.headers.get("if-none-match")
          ? { "if-none-match": request.headers.get("if-none-match") as string }
          : {}),
        ...(request.headers.get("if-modified-since")
          ? { "if-modified-since": request.headers.get("if-modified-since") as string }
          : {}),
      }),
      redirect: "manual",
    });
  } catch (error) {
    console.error("[public-media] imagor fetch failed:", {
      imagorUrl,
      error,
    });
    if (shouldUseDevSourceFallback() && resolved.ref.kind !== "video") {
      return streamDevSourceFallback(request, resolved.ref);
    }
    return createMediaProcessorUnavailableResponse(request);
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: forwardProxyHeaders(upstream),
  });
}

export async function handleInternalAssetSourceRequest(
  request: Request,
  params: { kind: string; slug: string; mediaHash: string }
) {
  if (
    (request.method !== "GET" && request.method !== "HEAD") ||
    !isPublicContentKind(params.kind) ||
    !isAllowedInternalSourceRequest(request)
  ) {
    return new Response("Not Found", { status: 404 });
  }

  const resolved = await resolveMediaReferenceFromRequest(
    request,
    {
      kind: params.kind,
      slug: params.slug,
      mediaHash: params.mediaHash,
    },
    true
  );
  if (!resolved) {
    return new Response("Not Found", { status: 404 });
  }

  return streamLocalMediaFile(request, resolved.ref);
}
