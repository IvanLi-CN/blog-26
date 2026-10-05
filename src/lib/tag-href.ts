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
