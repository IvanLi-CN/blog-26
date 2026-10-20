const CLIPPING_RESOURCE_REFERENCE_RE = /^(?:\.\/)?assets\/([a-f0-9]{64}\.[a-z0-9]+)([?#].*)?$/iu;
export const CLIPPING_RESOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const CLIPPING_RESOURCE_MAX_TOTAL_BYTES = 128 * 1024 * 1024;
export const CLIPPING_RESOURCE_MAX_COUNT = 64;
const SAFE_CLIPPING_RESOURCE_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "image/avif",
  "image/apng",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/mpeg",
  "video/ogg",
  "video/quicktime",
  "video/webm",
]);
const CLIPPING_MARKDOWN_MEDIA_RE =
  /!\[([^\]]*)\]\(\s*(?:https?:\/\/[^\s)]+|\.\/assets\/[a-f0-9]{64}\.[a-z0-9]+)(?:\s+"[^"]*")?\s*\)/giu;
const CLIPPING_HTML_MEDIA_RE =
  /<(?<tag>img|source|video|audio|track)\b[^>]*>[\s\S]*?<\/\k<tag>\s*>|<(?<single>img|source|video|audio|track)\b[^>]*\/?>(?![\s\S]*<\/\k<single>\s*>)/giu;

/** Keep legacy clipping prose readable without publishing uncaptured media URLs. */
export function stripUncapturedClippingMedia(markdown: string) {
  return markdown
    .replace(
      CLIPPING_MARKDOWN_MEDIA_RE,
      (_match, alt: string) => alt.trim() || "资源抓取失败：图片"
    )
    .replace(CLIPPING_HTML_MEDIA_RE, (match) => {
      const tag = /<\s*(img|source|video|audio|track)\b/iu.exec(match)?.[1]?.toLowerCase();
      return `资源抓取失败：${tag === "video" ? "视频" : tag === "audio" ? "音频" : "媒体"}`;
    });
}

export function isSafeClippingResourceMimeType(value: string | null) {
  return value !== null && SAFE_CLIPPING_RESOURCE_MIME_TYPES.has(value);
}

/** Build the live/public facade prefix for one immutable clipping version. */
export function buildClippingResourceBaseUrl(slug: string, versionId: string) {
  return `/api/public/memos/${encodeURIComponent(slug)}/clipping/assets/${encodeURIComponent(versionId)}/`;
}

/** Map a version-relative clipping resource reference to its authorized facade. */
export function mapClippingResourceUrl(value: string, resourceBaseUrl: string | null | undefined) {
  if (!resourceBaseUrl) return value;
  const match = CLIPPING_RESOURCE_REFERENCE_RE.exec(value.trim());
  if (!match) return value;
  const base = resourceBaseUrl.endsWith("/") ? resourceBaseUrl : `${resourceBaseUrl}/`;
  return `${base}${encodeURIComponent(match[1])}${match[2] ?? ""}`;
}

export function clippingResourceFilename(value: string) {
  const match = /^([a-f0-9]{64}\.[a-z0-9]+)$/iu.exec(value);
  return match?.[1] ?? null;
}
