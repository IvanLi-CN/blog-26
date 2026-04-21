import { resolveImagePath } from "@/lib/image-utils";
import type { PublicPostRecord } from "@/public-site/snapshot";

export interface PostCoverCandidate {
  raw: string;
  source: "frontmatter" | "metadata" | "markdown" | "wiki";
  markdownFilePath: string;
  contentSource: "local" | "webdav";
  isExternal: boolean;
  relativeAssetPath: string | null;
}

type PostCoverSource = PostCoverCandidate["source"];

function firstNonEmptyString(values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function isExternalCoverUrl(value: string) {
  return /^https?:\/\//.test(value.trim());
}

function isApiEndpoint(value: string) {
  return value.startsWith("/api/files/");
}

function isDataUrl(value: string) {
  return value.startsWith("data:");
}

export function normalizeWikiImageTarget(target: string) {
  return target
    .split("|")[0]
    .trim()
    .replace(/^。\//u, "./")
    .replace(/^\.。\//u, "./");
}

function getContentSource(record: PublicPostRecord) {
  return (record.dataSource?.includes("local") ? "local" : "webdav") as "local" | "webdav";
}

function getMarkdownFilePath(record: PublicPostRecord) {
  return record.filePath || `blog/${record.slug}.md`;
}

export function resolveRelativeAssetPath(imagePath: string, markdownFilePath: string) {
  const clean = imagePath.trim();
  if (!clean || isExternalCoverUrl(clean) || isApiEndpoint(clean) || isDataUrl(clean)) {
    return null;
  }

  if (clean.startsWith("/")) {
    return clean.replace(/^\/+/, "");
  }

  const normalizedFilePath = markdownFilePath.replace(/\\/g, "/");
  const markdownDir = normalizedFilePath.includes("/")
    ? normalizedFilePath.slice(0, normalizedFilePath.lastIndexOf("/"))
    : "";

  const baseSegments = markdownDir.split("/").filter(Boolean);
  const pathSegments = clean.replace(/\\/g, "/").split("/");

  if (!clean.startsWith("./") && !clean.startsWith("../")) {
    return [...baseSegments, ...pathSegments.filter(Boolean)].join("/");
  }

  for (const segment of pathSegments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      baseSegments.pop();
      continue;
    }
    baseSegments.push(segment);
  }

  return baseSegments.join("/");
}

function getMarkdownImage(body: string) {
  const markdownImage = body.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1]?.trim();
  if (!markdownImage) return null;

  if (markdownImage.startsWith("<")) {
    const endIndex = markdownImage.indexOf(">");
    if (endIndex > 1) {
      return markdownImage.slice(1, endIndex).trim() || null;
    }
  }

  const withOptionalTitle = markdownImage.match(/^(\S+)(?:\s+("[^"]*"|'[^']*'|\([^)]*\)))?\s*$/);

  return withOptionalTitle?.[1] || markdownImage;
}

function getWikiImage(body: string) {
  const wikiImage = body.match(/!\[\[([^\]]+)\]\]/)?.[1];
  if (!wikiImage?.trim()) return null;
  return normalizeWikiImageTarget(wikiImage);
}

export function extractPostCoverCandidates(record: PublicPostRecord): PostCoverCandidate[] {
  const metadata = record.metadata as Record<string, unknown>;
  const metadataImages = Array.isArray(metadata.images) ? metadata.images : [];
  const markdownFilePath = getMarkdownFilePath(record);
  const contentSource = getContentSource(record);

  const candidates: Array<{ value: string | null; source: PostCoverSource }> = [
    {
      value: firstNonEmptyString([record.image]),
      source: "frontmatter",
    },
    {
      value: firstNonEmptyString(metadataImages),
      source: "metadata",
    },
    {
      value: getMarkdownImage(record.body),
      source: "markdown",
    },
    {
      value: getWikiImage(record.body),
      source: "wiki",
    },
  ];

  const resolvedCandidates: PostCoverCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    resolvedCandidates.push({
      raw: candidate.value,
      source: candidate.source,
      markdownFilePath,
      contentSource,
      isExternal: isExternalCoverUrl(candidate.value),
      relativeAssetPath: resolveRelativeAssetPath(candidate.value, markdownFilePath),
    });
  }

  return resolvedCandidates;
}

export function extractPostCoverCandidate(record: PublicPostRecord): PostCoverCandidate | null {
  return extractPostCoverCandidates(record)[0] ?? null;
}

export function extractRelatedPostCoverCandidate(
  record: PublicPostRecord
): PostCoverCandidate | null {
  return (
    extractPostCoverCandidates(record).find(
      (candidate) => !(candidate.source === "markdown" && candidate.isExternal)
    ) ?? null
  );
}

export function resolvePostCoverCandidateSrc(candidate: PostCoverCandidate) {
  return resolveImagePath(candidate.raw, candidate.contentSource, candidate.markdownFilePath);
}

export function resolvePostCoverImageSrc(
  record: PublicPostRecord,
  options: { allowExternal?: boolean } = {}
) {
  const { allowExternal = false } = options;
  const candidate = extractPostCoverCandidate(record);
  if (!candidate) return null;
  if (candidate.isExternal && !allowExternal) return null;
  return resolvePostCoverCandidateSrc(candidate);
}
