import type { PublicPostRecord } from "@/public-site/snapshot";

type PostCoverRecord = Pick<PublicPostRecord, "image" | "metadata" | "body">;

interface ExtractPostCoverCandidateOptions {
  allowExternal?: boolean;
}

function asMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function normalizeCandidate(value: string): string {
  return value.trim().replace(/^<([^>]+)>$/u, "$1");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isExternalImageUrl(value: string): boolean {
  return /^https?:\/\//.test(value.trim());
}

export function normalizeWikiImageTarget(target: string): string {
  return normalizeCandidate(target)
    .split("|")[0]
    .trim()
    .replace(/^。\//u, "./")
    .replace(/^\.。\//u, "./");
}

export function getPostCoverCandidates(record: PostCoverRecord): string[] {
  const metadata = asMetadataRecord(record.metadata);
  const metadataImages = Array.isArray(metadata.images) ? metadata.images : [];

  const candidates: string[] = [];

  if (isNonEmptyString(record.image)) {
    candidates.push(normalizeCandidate(record.image));
  }

  for (const image of metadataImages) {
    if (isNonEmptyString(image)) {
      candidates.push(normalizeCandidate(image));
    }
  }

  const markdownImage = record.body.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
  if (isNonEmptyString(markdownImage)) {
    candidates.push(normalizeCandidate(markdownImage));
  }

  const wikiImage = record.body.match(/!\[\[([^\]]+)\]\]/)?.[1];
  if (isNonEmptyString(wikiImage)) {
    candidates.push(normalizeWikiImageTarget(wikiImage));
  }

  return candidates;
}

export function extractPostCoverCandidate(
  record: PostCoverRecord,
  options: ExtractPostCoverCandidateOptions = {}
): string | null {
  const { allowExternal = true } = options;

  for (const candidate of getPostCoverCandidates(record)) {
    if (!allowExternal && isExternalImageUrl(candidate)) {
      continue;
    }
    return candidate;
  }

  return null;
}
