import type { SearchResult, SemanticSearchInput } from "./search";

const DEFAULT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

type SearchCacheMode = "semantic" | "enhanced";
type SearchCacheInput = SemanticSearchInput & {
  rerankTopK?: number;
  rerank?: boolean;
  rerankerModel?: string;
};

type SearchCacheEntry = {
  expiresAt: number;
  results: SearchResult[];
};

const searchCache = new Map<string, SearchCacheEntry>();

function getSearchCacheTtlMs() {
  const configured = Number(process.env.SEARCH_CACHE_TTL_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SEARCH_CACHE_TTL_MS;
}

function normalizeQuery(query: string) {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function buildSearchCacheKey(mode: SearchCacheMode, input: SearchCacheInput) {
  return JSON.stringify({
    mode,
    q: normalizeQuery(input.q),
    topK: input.topK ?? null,
    type: input.type ?? "all",
    publishedOnly: input.publishedOnly ?? true,
    model: input.model ?? null,
    rerankTopK: input.rerankTopK ?? null,
    rerank: input.rerank ?? true,
    rerankerModel: input.rerankerModel ?? null,
  });
}

export async function getCachedSearchResults(
  mode: SearchCacheMode,
  input: SearchCacheInput,
  load: () => Promise<SearchResult[]>
) {
  const key = buildSearchCacheKey(mode, input);
  const now = Date.now();
  const cached = searchCache.get(key);

  if (cached && cached.expiresAt > now) {
    return cached.results.map((result) => ({ ...result }));
  }

  if (cached) {
    searchCache.delete(key);
  }

  const results = await load();
  searchCache.set(key, {
    expiresAt: now + getSearchCacheTtlMs(),
    results: results.map((result) => ({ ...result })),
  });
  return results;
}

export function clearSearchCache() {
  searchCache.clear();
}

export function getSearchCacheSize() {
  return searchCache.size;
}
