export function normalizeTagPath(raw: string): string {
  const cleaned = String(raw ?? "")
    .trim()
    // tags may come with a leading "#", e.g. "#DevOps/Network"
    .replace(/^#+/, "");

  const segments = cleaned
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  return segments.join("/");
}
