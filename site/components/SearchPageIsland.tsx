import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PublicSearchPage from "@/components/search/PublicSearchPage";
import {
  getSearchResultHref,
  groupSearchResults,
  type SearchFilter,
  type SearchResultGroup,
  type SearchResultItem,
} from "@/components/search/search-model";
import {
  buildSearchHref,
  shouldPushSearchHref,
  stripLegacySearchPlaybookIdentity,
} from "@/components/search/search-navigation";
import type { SearchSuggestionItem, SearchSuggestionReason } from "@/lib/ai/search-suggestions";
import { type SearchMode, type SearchReason, searchModeSchema } from "@/lib/search/settings";
import { webDemoFetch } from "@/lib/web-demo-fetch";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";

const SEARCH_RESULTS_CACHE_TTL_MS = 5 * 60 * 1000;

const SEARCH_SUGGESTIONS_CACHE_PREFIX = "blog25:public-search-suggestions:v4:";
const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type CachedSearchSuggestions = {
  expiresAt: number;
  suggestions: SearchSuggestionItem[];
};

function getSearchSuggestionsCacheKey(
  query: string,
  reason: SearchSuggestionReason,
  strategy: "auto" | "deterministic"
) {
  return `${SEARCH_SUGGESTIONS_CACHE_PREFIX}${strategy}:${reason}:${encodeURIComponent(query.trim().toLowerCase())}:5`;
}

function readCachedSearchSuggestions(
  query: string,
  reason: SearchSuggestionReason,
  strategy: "auto" | "deterministic"
) {
  try {
    const cacheKey = getSearchSuggestionsCacheKey(query, reason, strategy);
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSearchSuggestions;
    if (!Array.isArray(cached.suggestions) || cached.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }
    return cached.suggestions.filter(
      (item): item is SearchSuggestionItem =>
        item !== null &&
        typeof item === "object" &&
        typeof item.term === "string" &&
        item.term.trim() !== ""
    );
  } catch {
    return null;
  }
}

function writeCachedSearchSuggestions(
  query: string,
  reason: SearchSuggestionReason,
  suggestions: SearchSuggestionItem[],
  strategy: "auto" | "deterministic"
) {
  try {
    window.sessionStorage.setItem(
      getSearchSuggestionsCacheKey(query, reason, strategy),
      JSON.stringify({
        expiresAt: Date.now() + SEARCH_RESULTS_CACHE_TTL_MS,
        suggestions,
      } satisfies CachedSearchSuggestions)
    );
  } catch {
    // Storage can be unavailable in private contexts; suggestion chips are optional.
  }
}

function requestScope(filter: SearchFilter) {
  if (filter === "post" || filter === "memo" || filter === "clipping")
    return { source: "blog", type: filter } as const;
  if (filter === "topic" || filter === "experience" || filter === "policy")
    return { source: "playbook", type: filter } as const;
  return { source: "all", type: "all" } as const;
}

type SearchStreamEnvelope = {
  results: SearchResultItem[];
  effectiveMode: SearchMode;
  reason?: SearchReason;
  incompleteSources?: string[];
  ragIncompleteSources?: string[];
};

type SearchStreamKeywordHandler = (envelope: SearchStreamEnvelope) => void;

async function readSearchStream(
  response: Response,
  onKeywordResults?: SearchStreamKeywordHandler
): Promise<SearchStreamEnvelope> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("搜索流不可用，请稍后重试");
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      buffer += decoder.decode(part.value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = block.match(/^event:\s*([^\n]+)$/mu)?.[1]?.trim();
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!event || !data) continue;
        if (event === "error") {
          const payload = JSON.parse(data) as { error?: string };
          throw new Error(payload.error || "搜索失败，请稍后重试");
        }
        if (event === "keyword") {
          onKeywordResults?.(JSON.parse(data) as SearchStreamEnvelope);
          continue;
        }
        if (event === "result") return JSON.parse(data) as SearchStreamEnvelope;
      }
    }
    const finalBlock = `${buffer}\n\n`;
    const finalEvent = finalBlock.match(/^event:\s*([^\n]+)$/mu)?.[1]?.trim();
    const data = finalBlock
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (finalEvent === "result" && data) return JSON.parse(data) as SearchStreamEnvelope;
  } finally {
    reader.releaseLock();
  }
  throw new Error("搜索流未返回结果，请稍后重试");
}

function parseFilter(value: string | null): SearchFilter {
  return value === "post" ||
    value === "memo" ||
    value === "clipping" ||
    value === "topic" ||
    value === "experience" ||
    value === "policy"
    ? value
    : "all";
}

async function search(
  query: string,
  mode: SearchMode,
  filter: SearchFilter,
  signal?: AbortSignal,
  onKeywordResults?: SearchStreamKeywordHandler
) {
  const scope = requestScope(filter);
  const params = new URLSearchParams({
    q: query,
    topK: "50",
    mode,
    source: scope.source,
    type: scope.type,
  });
  const endpoint = mode === "keyword" ? "/api/public/search" : "/api/public/search/stream";
  const response = await webDemoFetch(toPublicApiUrl(`${endpoint}?${params.toString()}`), {
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message =
      payload && typeof payload.error === "string" ? payload.error : "搜索失败，请稍后重试";
    throw new Error(message);
  }
  if (mode !== "keyword") {
    const envelope = await readSearchStream(response, onKeywordResults);
    return {
      results: envelope.results,
      effectiveMode: envelope.effectiveMode,
      reason: envelope.reason ?? null,
      incompleteSources: envelope.incompleteSources ?? [],
      ragIncompleteSources: envelope.ragIncompleteSources ?? [],
    };
  }
  const payload = await response.json().catch(() => []);
  const effective = searchModeSchema.safeParse(response.headers.get("Search-Effective-Mode"));
  return {
    results: (payload ?? []) as SearchResultItem[],
    effectiveMode: effective.success ? effective.data : mode,
    reason: response.headers.get("Search-Reason") as SearchReason | null,
    incompleteSources: response.headers.get("Search-Incomplete-Sources")?.split(",") ?? [],
    ragIncompleteSources: response.headers.get("Search-RAG-Incomplete-Sources")?.split(",") ?? [],
  };
}

async function loadSearchSuggestions(
  query: string,
  reason: SearchSuggestionReason,
  strategy: "auto" | "deterministic",
  signal?: AbortSignal
) {
  const response = await webDemoFetch(
    toPublicApiUrl(
      `/api/public/search/suggestions?q=${encodeURIComponent(query)}&reason=${encodeURIComponent(
        reason
      )}&limit=5&strategy=${strategy}`
    ),
    { signal }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return [];
  const items = (payload as { items?: unknown; suggestions?: unknown }).items;
  if (Array.isArray(items)) {
    return items.filter(
      (item): item is SearchSuggestionItem =>
        item !== null &&
        typeof item === "object" &&
        typeof (item as SearchSuggestionItem).term === "string" &&
        (item as SearchSuggestionItem).term.trim() !== ""
    );
  }
  const suggestions = (payload as { suggestions?: unknown }).suggestions;
  return Array.isArray(suggestions)
    ? suggestions
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .map((term) => ({ term, strategy: "related" }) satisfies SearchSuggestionItem)
    : [];
}

export default function SearchPageIsland({
  initialQuery = "",
  initialMode = "keyword",
}: {
  initialQuery?: string;
  initialMode?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const suggestionsAbortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const suggestionsRequestIdRef = useRef(0);
  const [query, setQuery] = useState(initialQuery);
  const [searchedQuery, setSearchedQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>(
    () => searchModeSchema.safeParse(initialMode).data ?? "keyword"
  );
  const [effectiveMode, setEffectiveMode] = useState<SearchMode | undefined>();
  const [reason, setReason] = useState<SearchReason | undefined>();
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(initialQuery.trim()));
  const [aiSupplementLoading, setAiSupplementLoading] = useState(false);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendedSearchTerms, setRecommendedSearchTerms] = useState<SearchSuggestionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const syncFromLocation = useCallback(() => {
    abortRef.current?.abort();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const location = new URL(window.location.href);
    if (stripLegacySearchPlaybookIdentity(location)) {
      window.history.replaceState(window.history.state, "", location.toString());
    }
    const params = location.searchParams;
    const current = params.get("q") || "";
    const selected = searchModeSchema.safeParse(params.get("mode") ?? "keyword");
    setEffectiveMode(undefined);
    setReason(undefined);
    if (!selected.success) {
      setError("不支持的搜索模式，请重新选择。");
      setResults([]);
      setIsLoading(false);
      setAiSupplementLoading(false);
      return;
    }
    setMode(selected.data);
    setQuery(current);
    setSearchedQuery(current);
    const selectedFilter = parseFilter(params.get("filter"));
    setFilter(selectedFilter);
    if (!current.trim()) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      setAiSupplementLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setAiSupplementLoading(false);
    setError(null);
    let receivedKeywordResults = false;
    void search(current.trim(), selected.data, selectedFilter, controller.signal, (partial) => {
      if (requestIdRef.current !== requestId || controller.signal.aborted) return;
      receivedKeywordResults = true;
      setResults(groupSearchResults(partial.results));
      setEffectiveMode(selected.data);
      setReason(undefined);
      setIsLoading(false);
      setAiSupplementLoading(true);
    })
      .then((response) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        setResults(groupSearchResults(response.results));
        setEffectiveMode(response.effectiveMode);
        setReason(response.reason ?? undefined);
        setAiSupplementLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (requestIdRef.current !== requestId) return;
        if (!receivedKeywordResults) setResults([]);
        setAiSupplementLoading(false);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setIsLoading(false);
      });
  }, []);

  useSafeLayoutEffect(() => {
    syncFromLocation();
  }, [syncFromLocation]);

  useSafeLayoutEffect(() => {
    const current = new URL(window.location.href).searchParams.get("q") || "";
    if (query !== current || searchedQuery !== current) return;

    const island = inputRef.current?.closest("astro-island");
    if (!(island instanceof HTMLElement)) return;
    island.dataset.searchReady = "true";
    island.dispatchEvent(new Event("public-search:ready"));
  }, [query, searchedQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
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
  const suggestionReason = useMemo<SearchSuggestionReason | null>(() => {
    const current = searchedQuery.trim();
    if (!current || isLoading) return null;
    if (error || results.length === 0) return "empty";
    return null;
  }, [isLoading, results.length, searchedQuery, error]);
  const suggestionStrategy =
    effectiveMode === "keyword" || mode === "keyword" || error ? "deterministic" : "auto";

  useEffect(() => {
    suggestionsAbortRef.current?.abort();
    const requestId = ++suggestionsRequestIdRef.current;
    const currentQuery = searchedQuery.trim();
    if (!suggestionReason || !currentQuery) {
      setRecommendedSearchTerms([]);
      setIsLoadingRecommendations(false);
      return;
    }

    const cachedSuggestions = readCachedSearchSuggestions(
      currentQuery,
      suggestionReason,
      suggestionStrategy
    );
    if (cachedSuggestions) {
      setRecommendedSearchTerms(cachedSuggestions);
      setIsLoadingRecommendations(false);
      return;
    }

    const controller = new AbortController();
    suggestionsAbortRef.current = controller;
    setIsLoadingRecommendations(true);
    setRecommendedSearchTerms([]);
    void loadSearchSuggestions(
      currentQuery,
      suggestionReason,
      suggestionStrategy,
      controller.signal
    )
      .then((suggestions) => {
        if (suggestionsRequestIdRef.current !== requestId) return;
        setRecommendedSearchTerms(suggestions);
        writeCachedSearchSuggestions(
          currentQuery,
          suggestionReason,
          suggestions,
          suggestionStrategy
        );
      })
      .catch(() => {
        if (controller.signal.aborted || suggestionsRequestIdRef.current !== requestId) return;
        setRecommendedSearchTerms([]);
      })
      .finally(() => {
        if (suggestionsRequestIdRef.current === requestId) setIsLoadingRecommendations(false);
      });

    return () => controller.abort();
  }, [searchedQuery, suggestionReason, suggestionStrategy]);

  const runSearchForQuery = useCallback(
    (value: string, selectedMode = mode, selectedFilter = filter) => {
      const nextQuery = value.trim();
      setQuery(nextQuery);
      const currentHref = window.location.href;
      const nextHref = buildSearchHref(currentHref, nextQuery, selectedMode, selectedFilter);
      if (!shouldPushSearchHref(currentHref, nextQuery, selectedMode, selectedFilter)) {
        window.history.replaceState({ publicSearchQuery: nextQuery }, "", nextHref);
        syncFromLocation();
        return;
      }

      window.history.pushState({ publicSearchQuery: nextQuery }, "", nextHref);
      syncFromLocation();
    },
    [filter, mode, syncFromLocation]
  );

  const clearSearch = useCallback(() => {
    runSearchForQuery("");
    inputRef.current?.focus();
  }, [runSearchForQuery]);

  const retrySearch = useCallback(() => {
    const nextQuery = searchedQuery.trim() || query.trim();
    if (nextQuery) runSearchForQuery(nextQuery);
  }, [query, runSearchForQuery, searchedQuery]);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      runSearchForQuery(query);
    },
    [query, runSearchForQuery]
  );

  return (
    <PublicSearchPage
      mode={mode}
      effectiveMode={effectiveMode}
      reason={reason}
      onModeChange={(nextMode) => runSearchForQuery(searchedQuery || query, nextMode)}
      query={query}
      searchedQuery={searchedQuery}
      results={results}
      isLoading={isLoading && canSearch}
      aiSupplementLoading={aiSupplementLoading}
      error={error}
      filter={filter}
      onFilterChange={(nextFilter) => runSearchForQuery(searchedQuery || query, mode, nextFilter)}
      onQueryChange={setQuery}
      onClear={clearSearch}
      onRetry={retrySearch}
      onRecommendedSearch={runSearchForQuery}
      onSubmit={onSubmit}
      recommendedSearchTerms={recommendedSearchTerms}
      isLoadingRecommendations={isLoadingRecommendations}
      inputRef={inputRef}
      resolveHref={(result) => toPublicSitePath(getSearchResultHref(result)) ?? "#"}
    />
  );
}
