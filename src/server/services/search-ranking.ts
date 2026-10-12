import { positiveSearchTerms, searchHighlightSpans } from "@/lib/search/highlights";
import { planNativeQuery } from "@/lib/search/native-query";

export const SEARCH_RETRIEVAL_VERSION = "rank-fusion-context-v2";

/** Only ordinal ranks are comparable across distinct retrieval queries. */
export function reciprocalRanks<T>(lists: T[][], id: (item: T) => string) {
  const ranks = new Map<string, number>();
  for (const list of lists) {
    const seen = new Set<string>();
    for (const [index, item] of list.entries()) {
      const key = id(item);
      if (seen.has(key)) continue;
      seen.add(key);
      ranks.set(key, (ranks.get(key) ?? 0) + 1 / (60 + index + 1));
    }
  }
  return ranks;
}

/** Keep original text around a real hit, otherwise sample beyond the introduction. */
export function searchContext(
  query: string,
  source: { excerpt?: string | null; body?: string | null },
  limit: number
) {
  const text = `${source.excerpt ?? ""}\n${source.body ?? ""}`;
  const points = Array.from(text);
  if (points.length <= limit) return text;
  const terms = positiveSearchTerms(planNativeQuery(query).ast);
  const hit = searchHighlightSpans(text, terms)[0];
  if (hit) {
    const position = Array.from(text.slice(0, hit.start)).length;
    const start = Math.max(0, Math.min(position - Math.floor(limit / 3), points.length - limit));
    return points.slice(start, start + limit).join("");
  }
  const separator = "\n[…]\n";
  const size = Math.floor((limit - 2 * Array.from(separator).length) / 3);
  return [0, Math.floor((points.length - size) / 2), points.length - size]
    .map((start) => points.slice(start, start + size).join(""))
    .join(separator);
}
