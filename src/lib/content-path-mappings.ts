import type { ContentType } from "@/lib/content-sources/types";

export type ContentPathMappings = {
  posts?: readonly string[];
  projects?: readonly string[];
  memos?: readonly string[];
};

function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, "/").replace(/\/+/g, "/");
}

export function normalizeContentRootPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = normalizeSlashes(withLeadingSlash);
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function normalizeRelativeContentPath(input: string): string {
  const normalized = normalizeSlashes(input.trim()).replace(/^\/+/, "");
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function pathMatchesRoot(filePath: string, root: string): boolean {
  const normalizedFilePath = normalizeRelativeContentPath(filePath).toLowerCase();
  const normalizedRoot = normalizeRelativeContentPath(root).toLowerCase();

  if (!normalizedFilePath || !normalizedRoot) {
    return false;
  }

  return (
    normalizedFilePath === normalizedRoot || normalizedFilePath.startsWith(`${normalizedRoot}/`)
  );
}

export function inferContentTypeFromConfiguredPaths(
  filePath: string,
  mappings: ContentPathMappings
): ContentType | null {
  if ((mappings.memos || []).some((root) => pathMatchesRoot(filePath, root))) {
    return "memo";
  }

  if ((mappings.projects || []).some((root) => pathMatchesRoot(filePath, root))) {
    return "project";
  }

  if ((mappings.posts || []).some((root) => pathMatchesRoot(filePath, root))) {
    return "post";
  }

  return null;
}

export function isPathWithinConfiguredRoots(
  filePath: string,
  mappings: ContentPathMappings
): boolean {
  const roots = [
    ...(mappings.posts || []),
    ...(mappings.projects || []),
    ...(mappings.memos || []),
  ];
  return roots.some((root) => pathMatchesRoot(filePath, root));
}

export function getConfiguredContentRootDirs(mappings: ContentPathMappings): string[] {
  const seen = new Set<string>();
  const roots: string[] = [];

  for (const root of [
    ...(mappings.posts || []),
    ...(mappings.projects || []),
    ...(mappings.memos || []),
  ]) {
    const relativeRoot = normalizeRelativeContentPath(normalizeContentRootPath(root));
    if (!relativeRoot || seen.has(relativeRoot)) {
      continue;
    }
    seen.add(relativeRoot);
    roots.push(relativeRoot);
  }

  return roots;
}
