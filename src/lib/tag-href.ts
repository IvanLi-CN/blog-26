import { normalizeTagPath } from "./tag-directory";
/**
 * Build tag hrefs using segment encoding.
 *
 * Why: Some WAF/CDN setups block encoded slashes (%2F) in paths. For hierarchical tags like "Geek/SMS",
 * we must encode each segment while keeping "/" as a path separator.
 *
 * Input examples:
 * - "Geek/SMS"
 * - "  Geek//SMS  "
 * - "#DevOps/Network"
 *
 * Output examples:
 * - "/tags/Geek/SMS"
 * - "/tags/Geek/SMS"
 * - "/tags/DevOps/Network"
 */
export function buildTagHref(tagPath: string): string {
  const segments = normalizeTagPath(tagPath ?? "")
    .split("/")
    .filter(Boolean);

  if (segments.length === 0) return "/tags";

  return `/tags/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

/** Read the raw URL once: Astro route params already decode some URI escapes. */
export function readTagRoutePath(pathname: string, tagsRoot = "/tags", feed = false): string {
  const prefix = `${tagsRoot.replace(/\/$/, "")}/`;
  if (!pathname.startsWith(prefix)) return "";
  let path = pathname.slice(prefix.length).replace(/\/$/, "");
  if (feed) path = path.replace(/\/feed\.xml$/, "");
  try {
    return normalizeTagPath(path.split("/").map(decodeURIComponent).join("/"));
  } catch {
    return "";
  }
}
