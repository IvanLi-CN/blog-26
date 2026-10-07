import { groupSearchResults, isSearchResultGroup, type SearchResultGroup } from "./search-model";

const PREFIX = "blog25:public-search:v5:";
const TTL_MS = 5 * 60 * 1000;

export function getSearchResultsCacheKey(query: string, edition = "none") {
  return `${PREFIX}${edition}:${encodeURIComponent(query.trim().toLowerCase())}:50`;
}

export function readCachedSearchResults(query: string, edition?: string) {
  try {
    const key = getSearchResultsCacheKey(query, edition);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const cached: { expiresAt?: unknown; results?: unknown } = JSON.parse(raw);
    if (
      typeof cached.expiresAt !== "number" ||
      !Number.isFinite(cached.expiresAt) ||
      cached.expiresAt <= Date.now() ||
      !Array.isArray(cached.results) ||
      !cached.results.every(isSearchResultGroup)
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return groupSearchResults(cached.results);
  } catch {
    return null;
  }
}

export function writeCachedSearchResults(
  query: string,
  results: SearchResultGroup[],
  edition?: string
) {
  try {
    window.sessionStorage.setItem(
      getSearchResultsCacheKey(query, edition),
      JSON.stringify({
        expiresAt: Date.now() + TTL_MS,
        results,
      })
    );
  } catch {
    // Search works when browser storage is unavailable.
  }
}
