/**
 * Persisted (on-disk / in-DB) path semantics.
 *
 * Goal: persisted markdown + metadata must not contain `/api/files/...` URLs.
 * We only store normalized *relative* paths (e.g. `./assets/a.png`, `../shared/a.png`).
 *
 * Runtime rendering may map persisted relative paths back to `/api/files/local/...`.
 *
 * This module is intentionally environment-agnostic (no Node-only imports) so it can be
 * reused by both client and server code.
 */

export type ContentSource = "local";

export class PersistedPathError extends Error {
  code:
    | "ERR_INVALID_INPUT"
    | "ERR_UNSUPPORTED_URL"
    | "ERR_PATH_TRAVERSAL"
    | "ERR_ESCAPE_CONTENT_ROOT"
    | "ERR_UNKNOWN";

  constructor(code: PersistedPathError["code"], message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "PersistedPathError";
    this.code = code;
    if (options?.cause) {
      // TS 5.4+ supports ErrorOptions, but keep it runtime-compatible.
      (this as any).cause = options.cause;
    }
  }
}

const INLINE_MARKDOWN_LINK_RE =
  /(!?\[[^\]\n]*\]\()(\s*)(<[^>\n]+>|(?:[^\s()\\]+|\\.|\([^()\n]*\))+)([^)]*)(\))/g;

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("//");
}

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

function isFileApiUrl(value: string): boolean {
  return value.startsWith("/api/files/");
}

function splitSuffix(input: string): { path: string; suffix: string } {
  const q = input.indexOf("?");
  const h = input.indexOf("#");
  const cut = q === -1 ? h : h === -1 ? q : Math.min(q, h);

  if (cut === -1) {
    return { path: input, suffix: "" };
  }

  return { path: input.slice(0, cut), suffix: input.slice(cut) };
}

function normalizeSlashes(input: string): string {
  return input.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function stripLeadingSlashes(input: string): string {
  return input.replace(/^\/+/, "");
}

function stripLeadingDotSlash(input: string): string {
  return input.startsWith("./") ? input.slice(2) : input;
}

function getMarkdownDir(markdownFilePath: string): string {
  const clean = stripLeadingSlashes(normalizeSlashes(markdownFilePath.trim()));
  const idx = clean.lastIndexOf("/");
  return idx === -1 ? "" : clean.slice(0, idx);
}

function splitSegments(path: string): string[] {
  return normalizeSlashes(path)
    .split("/")
    .filter((seg) => seg.length > 0);
}

function joinSegments(segs: string[]): string {
  return segs.join("/");
}

function resolveRelativeToDir(opts: { relativePath: string; baseDir: string }): {
  resolvedPath: string;
  escaped: boolean;
} {
  const { relativePath, baseDir } = opts;

  const baseSegs = splitSegments(baseDir);
  const rel = normalizeSlashes(relativePath);
  const relSegs = splitSegments(rel);

  const out: string[] = [...baseSegs];
  let escaped = false;

  for (const seg of relSegs) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (out.length === 0) {
        escaped = true;
      } else {
        out.pop();
      }
      continue;
    }
    out.push(seg);
  }

  return { resolvedPath: joinSegments(out), escaped };
}

function relativeFromDirToPath(opts: { fromDir: string; toPath: string }): string {
  const fromSegs = splitSegments(opts.fromDir);
  const toSegs = splitSegments(opts.toPath);

  // Find common prefix between fromDir and toPath
  let common = 0;
  while (
    common < fromSegs.length &&
    common < toSegs.length &&
    fromSegs[common] === toSegs[common]
  ) {
    common++;
  }

  const upCount = fromSegs.length - common;
  const relSegs: string[] = [];
  for (let i = 0; i < upCount; i++) relSegs.push("..");
  relSegs.push(...toSegs.slice(common));

  const rel = joinSegments(relSegs);
  if (!rel) {
    // Same directory; callers should not request relative-to-dir for directories,
    // but keep behavior predictable.
    return ".";
  }

  if (rel.startsWith("..")) {
    return rel;
  }
  return rel.startsWith("./") ? rel : `./${rel}`;
}

function parseFileApiUrl(apiUrl: string): { source: string; path: string } | null {
  if (!isFileApiUrl(apiUrl)) return null;
  const rest = apiUrl.slice("/api/files/".length);
  const [source, ...pathParts] = rest.split("/");
  if (!source || pathParts.length === 0) return null;
  return { source, path: pathParts.join("/") };
}

function splitMarkdownUrlClosingParens(input: string): { url: string; closing: string } {
  let balance = 0;
  let cut = input.length;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "(") {
      balance += 1;
      continue;
    }
    if (char !== ")") continue;
    if (balance > 0) {
      balance -= 1;
      continue;
    }
    cut = index;
    break;
  }

  return { url: input.slice(0, cut), closing: input.slice(cut) };
}

function assertSafePathInput(path: string) {
  if (!path || typeof path !== "string") {
    throw new PersistedPathError("ERR_INVALID_INPUT", "Path must be a non-empty string.");
  }
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    throw new PersistedPathError("ERR_INVALID_INPUT", "Path must be a non-empty string.");
  }
  if (trimmed.includes("~")) {
    throw new PersistedPathError("ERR_PATH_TRAVERSAL", "Path must not contain '~'.");
  }
}

/**
 * Normalize a persisted link target to a normalized relative path.
 *
 * - `/api/files/<source>/<resolvedPath>` -> relative to markdown directory
 * - `/assets/...` -> treated as content-root-relative, then converted to markdown-relative
 * - `assets/...` -> `./assets/...`
 * - `<filename>` -> `./<filename>`
 */
export function normalizePersistedLink(input: string, markdownFilePath: string): string {
  assertSafePathInput(input);
  assertSafePathInput(markdownFilePath);

  const trimmed = input.trim();

  // External/data urls are allowed as-is (not persisted assets).
  if (isExternalUrl(trimmed) || isDataUrl(trimmed)) {
    return trimmed;
  }

  const { path: rawPath, suffix } = splitSuffix(trimmed);
  let normalized = normalizeSlashes(rawPath.trim());

  // Convert file proxy urls to a content-root-relative path.
  if (isFileApiUrl(normalized)) {
    const parsed = parseFileApiUrl(normalized);
    if (!parsed) {
      throw new PersistedPathError("ERR_UNSUPPORTED_URL", `Unsupported Files API url: ${input}`);
    }
    normalized = `/${stripLeadingSlashes(parsed.path)}`;
  }

  // Treat absolute paths as content-root-relative.
  if (normalized.startsWith("/")) {
    const contentRootPath = stripLeadingSlashes(normalized);
    const fromDir = getMarkdownDir(markdownFilePath);
    const rel = relativeFromDirToPath({ fromDir, toPath: contentRootPath });
    return normalizeSlashes(rel) + suffix;
  }

  // Handle "assets/..." shorthand (same dir child).
  if (normalized.startsWith("assets/")) {
    return `./${normalizeSlashes(normalized)}${suffix}`;
  }

  // Keep explicit relative prefixes, but normalize to POSIX.
  if (normalized.startsWith("./") || normalized.startsWith("../")) {
    return normalizeSlashes(normalized) + suffix;
  }

  // Bare filename/path: treat as same-directory relative.
  return `./${normalizeSlashes(normalized)}${suffix}`;
}

/**
 * Convert a persisted relative link to a runtime `/api/files/<source>/...` url.
 *
 * Returns null when the path would escape the content root (e.g. too many `..`).
 */
export function toRuntimeFileApiUrl(
  persistedLink: string,
  source: ContentSource,
  markdownFilePath: string
): string | null {
  assertSafePathInput(persistedLink);
  assertSafePathInput(markdownFilePath);

  const trimmed = persistedLink.trim();

  if (isExternalUrl(trimmed) || isDataUrl(trimmed)) {
    return trimmed;
  }
  if (isFileApiUrl(trimmed)) {
    return trimmed;
  }

  const { path: rawPath, suffix } = splitSuffix(trimmed);
  const normalized = normalizeSlashes(rawPath.trim());

  if (normalized.startsWith("/")) {
    return trimmed;
  }

  const baseDir = getMarkdownDir(markdownFilePath);
  const rel = stripLeadingDotSlash(normalized);
  const { resolvedPath, escaped } = resolveRelativeToDir({ relativePath: rel, baseDir });

  if (escaped) return null;
  if (!resolvedPath || resolvedPath.includes("..") || resolvedPath.includes("~")) return null;

  return `/api/files/${source}/${resolvedPath}${suffix}`;
}

export function hasApiFilesReference(input: string): boolean {
  return typeof input === "string" && input.includes("/api/files/");
}

/**
 * Rewrite any `/api/files/<source>/...` urls inside a string to persisted relative paths.
 *
 * Note: This is intentionally a broad rewrite (not a full Markdown parser) and can match
 * occurrences inside code blocks as well. This is acceptable for migration and safety gates.
 */
export function rewriteApiFilesUrlsToRelative(
  input: string,
  markdownFilePath: string
): { content: string; changed: boolean } {
  if (typeof input !== "string" || input.length === 0) {
    return { content: input, changed: false };
  }
  if (!hasApiFilesReference(input)) {
    return { content: input, changed: false };
  }

  // Match /api/files/<source>/<path...> until markdown/html delimiters.
  const re = /\/api\/files\/[A-Za-z0-9_-]+\/[^\s"'<>]+/g;

  let changed = false;
  const content = input.replace(re, (match) => {
    try {
      const { url, closing } = splitMarkdownUrlClosingParens(match);
      const normalized = normalizePersistedLink(url, markdownFilePath);
      const next = `${normalized}${closing}`;
      changed = changed || next !== match;
      return next;
    } catch {
      // Keep the original when normalization fails to avoid destructive rewrites.
      return match;
    }
  });

  return { content, changed };
}

function hasScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function shouldRebaseLocalTarget(value: string): boolean {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    isExternalUrl(trimmed) ||
    isDataUrl(trimmed) ||
    hasScheme(trimmed)
  ) {
    return false;
  }

  return true;
}

function rebaseLocalTarget(
  value: string,
  oldMarkdownFilePath: string,
  newMarkdownFilePath: string
) {
  if (!shouldRebaseLocalTarget(value)) return value;

  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !isFileApiUrl(trimmed)) {
    const { path: rawPath, suffix } = splitSuffix(trimmed);
    const currentPath = stripLeadingSlashes(normalizeSlashes(rawPath.trim()));
    const oldMarkdownDir = getMarkdownDir(oldMarkdownFilePath);

    if (
      !oldMarkdownDir ||
      (currentPath !== oldMarkdownDir && !currentPath.startsWith(`${oldMarkdownDir}/`))
    ) {
      return value;
    }

    try {
      return normalizePersistedLink(
        `/api/files/local/${currentPath}${suffix}`,
        newMarkdownFilePath
      );
    } catch {
      return value;
    }
  }

  const runtimeUrl = toRuntimeFileApiUrl(value, "local", oldMarkdownFilePath);
  if (!runtimeUrl || !isFileApiUrl(runtimeUrl)) return value;

  try {
    return normalizePersistedLink(runtimeUrl, newMarkdownFilePath);
  } catch {
    return value;
  }
}

function rebaseMovedReferenceTarget(
  value: string,
  markdownFilePath: string,
  oldTargetPath: string,
  newTargetPath: string
) {
  if (!shouldRebaseLocalTarget(value)) return value;

  const trimmed = value.trim();
  const normalizedOldTarget = stripLeadingSlashes(normalizeSlashes(oldTargetPath));
  const normalizedNewTarget = stripLeadingSlashes(normalizeSlashes(newTargetPath));

  if (trimmed.startsWith("/") && !isFileApiUrl(trimmed)) {
    const { path: rawPath, suffix } = splitSuffix(trimmed);
    const currentPath = stripLeadingSlashes(normalizeSlashes(rawPath.trim()));
    const rebased = rebaseMovedContentPath(currentPath, normalizedOldTarget, normalizedNewTarget);

    if (!rebased) {
      return value;
    }

    try {
      return normalizePersistedLink(`/api/files/local/${rebased}${suffix}`, markdownFilePath);
    } catch {
      return value;
    }
  }

  const runtimeUrl = toRuntimeFileApiUrl(value, "local", markdownFilePath);
  if (!runtimeUrl || !isFileApiUrl(runtimeUrl)) return value;

  const parsed = parseFileApiUrl(runtimeUrl);
  if (!parsed || parsed.source !== "local") return value;

  const currentPath = stripLeadingSlashes(normalizeSlashes(parsed.path));
  const rebased = rebaseMovedContentPath(currentPath, normalizedOldTarget, normalizedNewTarget);

  if (!rebased) {
    return value;
  }

  try {
    return normalizePersistedLink(`/api/files/local/${rebased}`, markdownFilePath);
  } catch {
    return value;
  }
}

function rebaseMovedContentPath(
  currentPath: string,
  normalizedOldTarget: string,
  normalizedNewTarget: string
) {
  if (currentPath !== normalizedOldTarget && !currentPath.startsWith(`${normalizedOldTarget}/`)) {
    return null;
  }

  return currentPath === normalizedOldTarget
    ? normalizedNewTarget
    : `${normalizedNewTarget}${currentPath.slice(normalizedOldTarget.length)}`;
}

function rebaseInlineMarkdownLinks(
  input: string,
  oldMarkdownFilePath: string,
  newMarkdownFilePath: string
) {
  return input.replace(
    INLINE_MARKDOWN_LINK_RE,
    (
      match,
      prefix: string,
      spacing: string,
      rawTarget: string,
      suffix: string,
      closing: string
    ) => {
      const angled = rawTarget.startsWith("<") && rawTarget.endsWith(">");
      const target = angled ? rawTarget.slice(1, -1) : rawTarget;
      const rebased = rebaseLocalTarget(target, oldMarkdownFilePath, newMarkdownFilePath);
      const nextTarget = angled ? `<${rebased}>` : rebased;
      const next = `${prefix}${spacing}${nextTarget}${suffix}${closing}`;
      return next === match ? match : next;
    }
  );
}

function rebaseInlineMarkdownReferences(
  input: string,
  markdownFilePath: string,
  oldTargetPath: string,
  newTargetPath: string
) {
  return input.replace(
    INLINE_MARKDOWN_LINK_RE,
    (
      match,
      prefix: string,
      spacing: string,
      rawTarget: string,
      suffix: string,
      closing: string
    ) => {
      const angled = rawTarget.startsWith("<") && rawTarget.endsWith(">");
      const target = angled ? rawTarget.slice(1, -1) : rawTarget;
      const rebased = rebaseMovedReferenceTarget(
        target,
        markdownFilePath,
        oldTargetPath,
        newTargetPath
      );
      const nextTarget = angled ? `<${rebased}>` : rebased;
      const next = `${prefix}${spacing}${nextTarget}${suffix}${closing}`;
      return next === match ? match : next;
    }
  );
}

function rebaseReferenceDefinitionLinks(
  input: string,
  oldMarkdownFilePath: string,
  newMarkdownFilePath: string
) {
  return input.replace(
    /^(\s{0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]+>|[^\s<>\n]+)([^\n]*)$/gm,
    (match, prefix: string, rawTarget: string, suffix: string) => {
      const angled = rawTarget.startsWith("<") && rawTarget.endsWith(">");
      const target = angled ? rawTarget.slice(1, -1) : rawTarget;
      const rebased = rebaseLocalTarget(target, oldMarkdownFilePath, newMarkdownFilePath);
      const nextTarget = angled ? `<${rebased}>` : rebased;
      const next = `${prefix}${nextTarget}${suffix}`;
      return next === match ? match : next;
    }
  );
}

function rebaseReferenceDefinitionReferences(
  input: string,
  markdownFilePath: string,
  oldTargetPath: string,
  newTargetPath: string
) {
  return input.replace(
    /^(\s{0,3}\[[^\]\n]+\]:[ \t]*)(<[^>\n]+>|[^\s<>\n]+)([^\n]*)$/gm,
    (match, prefix: string, rawTarget: string, suffix: string) => {
      const angled = rawTarget.startsWith("<") && rawTarget.endsWith(">");
      const target = angled ? rawTarget.slice(1, -1) : rawTarget;
      const rebased = rebaseMovedReferenceTarget(
        target,
        markdownFilePath,
        oldTargetPath,
        newTargetPath
      );
      const nextTarget = angled ? `<${rebased}>` : rebased;
      const next = `${prefix}${nextTarget}${suffix}`;
      return next === match ? match : next;
    }
  );
}

function rebaseSrcsetValue(value: string, rebaseTarget: (target: string) => string) {
  return value
    .split(",")
    .map((candidate) => {
      const leading = candidate.match(/^\s*/)?.[0] ?? "";
      const trailing = candidate.match(/\s*$/)?.[0] ?? "";
      const trimmed = candidate.trim();
      if (!trimmed) return candidate;

      const [target, ...descriptor] = trimmed.split(/\s+/);
      const rebased = rebaseTarget(target);
      return `${leading}${[rebased, ...descriptor].join(" ")}${trailing}`;
    })
    .join(",");
}

function rebaseHtmlAssetAttributes(input: string, rebaseTarget: (target: string) => string) {
  let content = input.replace(
    /(\b(?:src|href|poster)\s*=\s*)(["'])([^"'\n]*)(\2)/gi,
    (match, prefix: string, quote: string, value: string, closing: string) => {
      const rebased = rebaseTarget(value);
      const next = `${prefix}${quote}${rebased}${closing}`;
      return next === match ? match : next;
    }
  );

  content = content.replace(
    /(\bsrcset\s*=\s*)(["'])([^"'\n]*)(\2)/gi,
    (match, prefix: string, quote: string, value: string, closing: string) => {
      const rebased = rebaseSrcsetValue(value, rebaseTarget);
      const next = `${prefix}${quote}${rebased}${closing}`;
      return next === match ? match : next;
    }
  );

  return content;
}

function rebaseWikiEmbedLinks(
  input: string,
  oldMarkdownFilePath: string,
  newMarkdownFilePath: string
) {
  return input.replace(/(!\[\[)([^\]\n|]+)([^\]\n]*\]\])/g, (match, prefix, target, suffix) => {
    const rebased = rebaseLocalTarget(target, oldMarkdownFilePath, newMarkdownFilePath);
    const next = `${prefix}${rebased}${suffix}`;
    return next === match ? match : next;
  });
}

function rebaseWikiEmbedReferences(
  input: string,
  markdownFilePath: string,
  oldTargetPath: string,
  newTargetPath: string
) {
  return input.replace(/(!\[\[)([^\]\n|]+)([^\]\n]*\]\])/g, (match, prefix, target, suffix) => {
    const rebased = rebaseMovedReferenceTarget(
      target,
      markdownFilePath,
      oldTargetPath,
      newTargetPath
    );
    const next = `${prefix}${rebased}${suffix}`;
    return next === match ? match : next;
  });
}

function rebaseFrontmatterAssetFields(
  input: string,
  oldMarkdownFilePath: string,
  newMarkdownFilePath: string
) {
  if (!input.startsWith("---\n")) return input;
  const closingIndex = input.indexOf("\n---", 4);
  if (closingIndex === -1) return input;

  const frontmatter = input.slice(0, closingIndex);
  const rest = input.slice(closingIndex);
  const rebasedFrontmatter = frontmatter.replace(
    /^(\s*(?:image|cover|thumbnail|banner)\s*:\s*)(["']?)([^"'\n]+)(\2\s*)$/gim,
    (match, prefix: string, quote: string, value: string, suffix: string) => {
      const rebased = rebaseLocalTarget(value.trim(), oldMarkdownFilePath, newMarkdownFilePath);
      const next = `${prefix}${quote}${rebased}${suffix}`;
      return next === match ? match : next;
    }
  );

  return `${rebasedFrontmatter}${rest}`;
}

function rebaseFrontmatterAssetReferences(
  input: string,
  markdownFilePath: string,
  oldTargetPath: string,
  newTargetPath: string
) {
  if (!input.startsWith("---\n")) return input;
  const closingIndex = input.indexOf("\n---", 4);
  if (closingIndex === -1) return input;

  const frontmatter = input.slice(0, closingIndex);
  const rest = input.slice(closingIndex);
  const rebasedFrontmatter = frontmatter.replace(
    /^(\s*(?:image|cover|thumbnail|banner)\s*:\s*)(["']?)([^"'\n]+)(\2\s*)$/gim,
    (match, prefix: string, quote: string, value: string, suffix: string) => {
      const rebased = rebaseMovedReferenceTarget(
        value.trim(),
        markdownFilePath,
        oldTargetPath,
        newTargetPath
      );
      const next = `${prefix}${quote}${rebased}${suffix}`;
      return next === match ? match : next;
    }
  );

  return `${rebasedFrontmatter}${rest}`;
}

export function rebasePersistedLocalLinks(
  input: string,
  oldMarkdownFilePath: string,
  newMarkdownFilePath: string
): { content: string; changed: boolean } {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    oldMarkdownFilePath === newMarkdownFilePath
  ) {
    return { content: input, changed: false };
  }

  let content = input;
  content = rebaseFrontmatterAssetFields(content, oldMarkdownFilePath, newMarkdownFilePath);
  content = rebaseInlineMarkdownLinks(content, oldMarkdownFilePath, newMarkdownFilePath);
  content = rebaseReferenceDefinitionLinks(content, oldMarkdownFilePath, newMarkdownFilePath);
  content = rebaseHtmlAssetAttributes(content, (target) =>
    rebaseLocalTarget(target, oldMarkdownFilePath, newMarkdownFilePath)
  );
  content = rebaseWikiEmbedLinks(content, oldMarkdownFilePath, newMarkdownFilePath);

  return {
    content,
    changed: content !== input,
  };
}

export function rebasePersistedLocalReferences(
  input: string,
  markdownFilePath: string,
  oldTargetPath: string,
  newTargetPath: string
): { content: string; changed: boolean } {
  if (typeof input !== "string" || input.length === 0 || oldTargetPath === newTargetPath) {
    return { content: input, changed: false };
  }

  let content = input;
  content = rebaseFrontmatterAssetReferences(
    content,
    markdownFilePath,
    oldTargetPath,
    newTargetPath
  );
  content = rebaseInlineMarkdownReferences(content, markdownFilePath, oldTargetPath, newTargetPath);
  content = rebaseReferenceDefinitionReferences(
    content,
    markdownFilePath,
    oldTargetPath,
    newTargetPath
  );
  content = rebaseHtmlAssetAttributes(content, (target) =>
    rebaseMovedReferenceTarget(target, markdownFilePath, oldTargetPath, newTargetPath)
  );
  content = rebaseWikiEmbedReferences(content, markdownFilePath, oldTargetPath, newTargetPath);

  return {
    content,
    changed: content !== input,
  };
}
