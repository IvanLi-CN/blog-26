import type { SearchResult, SemanticSearchInput } from "./search";

const DEFAULT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

type SearchCacheMode = "semantic" | "enhanced";
export type SearchExecutionSource = "semantic" | "fts" | "enhanced";
type SearchCacheInput = SemanticSearchInput & {
  rerankTopK?: number;
  rerank?: boolean;
  rerankerModel?: string;
  providerFingerprint?: string;
};

type SearchCacheEntry = {
  expiresAt: number;
  results: SearchResult[];
  source: SearchExecutionSource;
};

export type SearchCacheLoadResult = {
  results: SearchResult[];
  source?: SearchExecutionSource;
  cacheable?: boolean;
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
    providerFingerprint: input.providerFingerprint ?? null,
  });
}

export async function getCachedSearchExecution(
  mode: SearchCacheMode,
  input: SearchCacheInput,
  load: () => Promise<SearchResult[] | SearchCacheLoadResult>
) {
  const key = buildSearchCacheKey(mode, input);
  const now = Date.now();
  const cached = searchCache.get(key);

  if (cached && cached.expiresAt > now) {
    return {
      results: cached.results.map((result) => ({ ...result })),
      source: cached.source,
    };
  }

  if (cached) {
    searchCache.delete(key);
  }

  const loaded = await load();
  const normalized = Array.isArray(loaded)
    ? {
        results: loaded,
        source: mode === "semantic" ? ("semantic" as const) : ("enhanced" as const),
        cacheable: true,
      }
    : {
        results: loaded.results,
        source:
          loaded.source ?? (mode === "semantic" ? ("semantic" as const) : ("enhanced" as const)),
        cacheable: loaded.cacheable !== false,
      };

  if (normalized.cacheable) {
    searchCache.set(key, {
      expiresAt: now + getSearchCacheTtlMs(),
      results: normalized.results.map((result) => ({ ...result })),
      source: normalized.source,
    });
  }

  return {
    results: normalized.results,
    source: normalized.source,
  };
}

export async function getCachedSearchResults(
  mode: SearchCacheMode,
  input: SearchCacheInput,
  load: () => Promise<SearchResult[]>
) {
  return (await getCachedSearchExecution(mode, input, load)).results;
}

export function clearSearchCache() {
  searchCache.clear();
}

export function getSearchCacheSize() {
  return searchCache.size;
}
