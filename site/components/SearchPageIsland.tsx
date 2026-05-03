import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PublicSearchPage from "@/components/search/PublicSearchPage";
import {
  filterSearchResults,
  type SearchFilter,
  type SearchResultItem,
} from "@/components/search/search-model";
import { buildSearchHref, shouldPushSearchHref } from "@/components/search/search-navigation";
import type { SearchSuggestionReason } from "@/lib/ai/search-suggestions";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";

const SEARCH_RESULTS_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_RESULTS_CACHE_PREFIX = "blog25:public-search:v3:";
const SEARCH_SUGGESTIONS_CACHE_PREFIX = "blog25:public-search-suggestions:v1:";

type CachedSearchResults = {
  expiresAt: number;
  results: SearchResultItem[];
};

type CachedSearchSuggestions = {
  expiresAt: number;
  suggestions: string[];
};

function getSearchResultsCacheKey(query: string) {
  return `${SEARCH_RESULTS_CACHE_PREFIX}${encodeURIComponent(query.trim().toLowerCase())}:50`;
}

function getSearchSuggestionsCacheKey(query: string, reason: SearchSuggestionReason) {
  return `${SEARCH_SUGGESTIONS_CACHE_PREFIX}${reason}:${encodeURIComponent(query.trim().toLowerCase())}:5`;
}

function readCachedSearchResults(query: string) {
  try {
    const raw = window.sessionStorage.getItem(getSearchResultsCacheKey(query));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSearchResults;
    if (!Array.isArray(cached.results) || cached.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(getSearchResultsCacheKey(query));
      return null;
    }
    return cached.results;
  } catch {
    return null;
  }
}

function readCachedSearchSuggestions(query: string, reason: SearchSuggestionReason) {
  try {
    const cacheKey = getSearchSuggestionsCacheKey(query, reason);
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSearchSuggestions;
    if (!Array.isArray(cached.suggestions) || cached.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }
    return cached.suggestions.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function writeCachedSearchResults(query: string, results: SearchResultItem[]) {
  try {
    window.sessionStorage.setItem(
      getSearchResultsCacheKey(query),
      JSON.stringify({
        expiresAt: Date.now() + SEARCH_RESULTS_CACHE_TTL_MS,
        results,
      } satisfies CachedSearchResults)
    );
  } catch {
    // Storage can be unavailable in private contexts; search still works without it.
  }
}

function writeCachedSearchSuggestions(
  query: string,
  reason: SearchSuggestionReason,
  suggestions: string[]
) {
  try {
    window.sessionStorage.setItem(
      getSearchSuggestionsCacheKey(query, reason),
      JSON.stringify({
        expiresAt: Date.now() + SEARCH_RESULTS_CACHE_TTL_MS,
        suggestions,
      } satisfies CachedSearchSuggestions)
    );
  } catch {
    // Storage can be unavailable in private contexts; suggestion chips are optional.
  }
}

async function search(query: string, signal?: AbortSignal) {
  const response = await fetch(
    toPublicApiUrl(`/api/public/search?q=${encodeURIComponent(query)}&topK=50`),
    { signal }
  );
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string" ? payload.error : "搜索失败，请稍后重试";
    throw new Error(message);
  }
  return (payload ?? []) as SearchResultItem[];
}

async function loadSearchSuggestions(
  query: string,
  reason: SearchSuggestionReason,
  signal?: AbortSignal
) {
  const response = await fetch(
    toPublicApiUrl(
      `/api/public/search/suggestions?q=${encodeURIComponent(query)}&reason=${encodeURIComponent(
        reason
      )}&limit=5`
    ),
    { signal }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  const suggestions = (payload as { suggestions?: unknown }).suggestions;
  return Array.isArray(suggestions)
    ? suggestions.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

export default function SearchPageIsland({ initialQuery = "" }: { initialQuery?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const suggestionsRequestIdRef = useRef(0);
  const [query, setQuery] = useState(initialQuery);
  const [searchedQuery, setSearchedQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(initialQuery.trim().length > 0);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendedSearchTerms, setRecommendedSearchTerms] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const syncFromLocation = useCallback(() => {
    abortRef.current?.abort();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const current = new URL(window.location.href).searchParams.get("q") || "";
    setQuery(current);
    setSearchedQuery(current);
    setFilter("all");
    if (!current.trim()) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    const cachedResults = readCachedSearchResults(current.trim());
    if (cachedResults) {
      setResults(cachedResults);
      setError(null);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    void search(current.trim(), controller.signal)
      .then((nextResults) => {
        if (requestIdRef.current === requestId) {
          setResults(nextResults);
          writeCachedSearchResults(current.trim(), nextResults);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (requestIdRef.current !== requestId) return;
        setResults([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    syncFromLocation();
    const handlePopstate = () => syncFromLocation();
    window.addEventListener("popstate", handlePopstate);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
      suggestionsAbortRef.current?.abort();
      window.removeEventListener("popstate", handlePopstate);
    };
  }, [syncFromLocation]);

  const canSearch = useMemo(() => query.trim().length > 0, [query]);
  const filteredResults = useMemo(() => filterSearchResults(results, filter), [filter, results]);
  const suggestionReason = useMemo<SearchSuggestionReason | null>(() => {
    const current = searchedQuery.trim();
    if (!current || isLoading) return null;
    if (error) return "error";
    if (results.length === 0) return "empty";
    if (filteredResults.length === 0) return "filtered_empty";
    return null;
  }, [error, filteredResults.length, isLoading, results.length, searchedQuery]);

  useEffect(() => {
    suggestionsAbortRef.current?.abort();
    const currentQuery = searchedQuery.trim();
    if (!suggestionReason || !currentQuery) {
      setRecommendedSearchTerms([]);
      setIsLoadingRecommendations(false);
      return;
    }

    const cachedSuggestions = readCachedSearchSuggestions(currentQuery, suggestionReason);
    if (cachedSuggestions) {
      setRecommendedSearchTerms(cachedSuggestions);
      setIsLoadingRecommendations(false);
      return;
    }

    const requestId = suggestionsRequestIdRef.current + 1;
    suggestionsRequestIdRef.current = requestId;
    const controller = new AbortController();
    suggestionsAbortRef.current = controller;
    setIsLoadingRecommendations(true);
    setRecommendedSearchTerms([]);
    void loadSearchSuggestions(currentQuery, suggestionReason, controller.signal)
      .then((suggestions) => {
        if (suggestionsRequestIdRef.current !== requestId) return;
        setRecommendedSearchTerms(suggestions);
        writeCachedSearchSuggestions(currentQuery, suggestionReason, suggestions);
      })
      .catch(() => {
        if (controller.signal.aborted || suggestionsRequestIdRef.current !== requestId) return;
        setRecommendedSearchTerms([]);
      })
      .finally(() => {
        if (suggestionsRequestIdRef.current === requestId) setIsLoadingRecommendations(false);
      });

    return () => controller.abort();
  }, [searchedQuery, suggestionReason]);

  const runSearchForQuery = useCallback(
    (value: string) => {
      const nextQuery = value.trim();
      setQuery(nextQuery);
      const currentHref = window.location.href;
      const nextHref = buildSearchHref(currentHref, nextQuery);
      if (!shouldPushSearchHref(currentHref, nextQuery)) {
        window.history.replaceState({ publicSearchQuery: nextQuery }, "", nextHref);
        syncFromLocation();
        return;
      }

      window.history.pushState({ publicSearchQuery: nextQuery }, "", nextHref);
      syncFromLocation();
    },
    [syncFromLocation]
  );

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      runSearchForQuery(query);
    },
    [query, runSearchForQuery]
  );

  return (
    <PublicSearchPage
      query={query}
      searchedQuery={searchedQuery}
      results={results}
      isLoading={isLoading && canSearch}
      error={error}
      filter={filter}
      onFilterChange={setFilter}
      onQueryChange={setQuery}
      onRecommendedSearch={runSearchForQuery}
      onSubmit={onSubmit}
      recommendedSearchTerms={recommendedSearchTerms}
      isLoadingRecommendations={isLoadingRecommendations}
      inputRef={inputRef}
      resolveHref={(result) =>
        toPublicSitePath(
          result.type === "memo" ? `/memos/${result.slug}` : `/posts/${result.slug}`
        ) ?? "#"
      }
    />
  );
}
