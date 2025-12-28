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
  const cleaned = (tagPath ?? "")
    .trim()
    // tags may come with a leading "#", e.g. "#DevOps/Network"
    .replace(/^#+/, "");

  const segments = cleaned
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) return "/tags";

  return `/tags/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}
