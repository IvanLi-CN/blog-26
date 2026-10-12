import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PublicSearchPage from "@/components/search/PublicSearchPage";
import {
  getSearchResultHref,
  groupSearchResults,
  type SearchFilter,
  type SearchResultGroup,
  type SearchResultItem,
} from "@/components/search/search-model";
import { buildSearchHref, shouldPushSearchHref } from "@/components/search/search-navigation";
import type { SearchSuggestionItem, SearchSuggestionReason } from "@/lib/ai/search-suggestions";
import {
  buildPlaybookIndex,
  type PlaybookSearchPage,
  queryPlaybookSearch,
} from "@/lib/playbook/search";
import type { PlaybookSearchPayload } from "@/lib/playbook/types";
import { type SearchMode, type SearchReason, searchModeSchema } from "@/lib/search/settings";
import { webDemoFetch } from "@/lib/web-demo-fetch";
import { getWebDemoEnvironment, isWebDemoBuildEnabled } from "@/lib/web-demo-runtime";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";

const SEARCH_RESULTS_CACHE_TTL_MS = 5 * 60 * 1000;

const SEARCH_SUGGESTIONS_CACHE_PREFIX = "blog25:public-search-suggestions:v4:";
const WEB_DEMO_AI_SUPPLEMENT_DELAY_MS = 5000;
const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type PlaybookSearchSource = {
  pages: PlaybookSearchPage[];
  edition: string;
  sourceReleaseId: string;
  sourceTag: string;
  url: string;
  sha256: string;
};
const playbookIndexes = new Map<string, Promise<ReturnType<typeof buildPlaybookIndex>>>();
async function searchPlaybook(query: string, source?: PlaybookSearchSource) {
  if (!source) return [];
  const key = `${source.url}:${source.edition}:${source.sourceReleaseId}:${source.sourceTag}`;
  let pending = playbookIndexes.get(key);
  if (!pending) {
    pending = webDemoFetch(source.url, { signal: AbortSignal.timeout(30_000) })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            response.status === 409 ? "执念版本已更新，请刷新页面" : "执念搜索暂不可用"
          );
        const raw = await response.text();
        const payload = JSON.parse(raw) as PlaybookSearchPayload & { edition?: string };
        if (payload.edition && payload.edition !== source.edition)
          throw new Error("执念搜索版本不一致");
        const responseSourceReleaseId = response.headers.get("x-playbook-source-release-id");
        const responseSourceTag = response.headers.get("x-playbook-source-tag");
        if (
          (responseSourceReleaseId || responseSourceTag) &&
          (responseSourceReleaseId !== source.sourceReleaseId ||
            responseSourceTag !== source.sourceTag)
        )
          throw new Error("执念搜索来源版本不一致");
        const data = { generated_at: payload.generated_at, documents: payload.documents };
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
        if (
          Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
            ""
          ) !== source.sha256
        )
          throw new Error("执念搜索数据校验失败");
        return buildPlaybookIndex(data, source.pages);
      })
      .catch((error) => {
        playbookIndexes.delete(key);
        throw error;
      });
    playbookIndexes.set(key, pending);
  }
  return queryPlaybookSearch(await pending, query);
}

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

async function search(query: string, mode: SearchMode, signal?: AbortSignal) {
  const response = await webDemoFetch(
    toPublicApiUrl(`/api/public/search?q=${encodeURIComponent(query)}&topK=50&mode=${mode}`),
    { signal }
  );
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string" ? payload.error : "搜索失败，请稍后重试";
    throw new Error(message);
  }
  const effective = searchModeSchema.safeParse(response.headers.get("Search-Effective-Mode"));
  return {
    results: (payload ?? []) as SearchResultItem[],
    effectiveMode: effective.success ? effective.data : mode,
    reason: response.headers.get("Search-Reason") as SearchReason | null,
  };
}

function waitForWebDemoAiSupplement(signal?: AbortSignal) {
  const environment = getWebDemoEnvironment(window.location, "public");
  const delayMs =
    environment.delay === "slow"
      ? 6500
      : environment.delay === "custom"
        ? Math.max(600, environment.delayMs)
        : WEB_DEMO_AI_SUPPLEMENT_DELAY_MS;
  return new Promise<void>((resolve, reject) => {
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("The AI supplement was aborted.", "AbortError"));
    };
    timer = window.setTimeout(() => {
      cleanup();
      if (signal?.aborted) onAbort();
      else resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
  playbook,
  initialQuery = "",
  initialMode = "keyword",
}: {
  playbook?: PlaybookSearchSource;
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
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [recommendedSearchTerms, setRecommendedSearchTerms] = useState<SearchSuggestionItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aiSupplementLoading, setAiSupplementLoading] = useState(false);

  const syncFromLocation = useCallback(() => {
    abortRef.current?.abort();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const params = new URL(window.location.href).searchParams;
    const current = params.get("q") || "";
    const selected = searchModeSchema.safeParse(params.get("mode") ?? "keyword");
    setEffectiveMode(undefined);
    setReason(undefined);
    if (!selected.success) {
      setError("不支持的搜索模式，请重新选择。");
      setResults([]);
      setIsLoading(false);
      return;
    }
    setMode(selected.data);
    setQuery(current);
    setSearchedQuery(current);
    setFilter("all");
    setAiSupplementLoading(false);
    if (!current.trim()) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    void Promise.allSettled([
      search(current.trim(), selected.data, controller.signal),
      searchPlaybook(current.trim(), playbook),
    ])
      .then((sources) => {
        if (requestIdRef.current !== requestId || controller.signal.aborted) return;
        const blog = sources[0];
        const playbookSource = sources[1];
        const blogResults = blog.status === "fulfilled" ? blog.value.results : [];
        const playbookResults = playbookSource.status === "fulfilled" ? playbookSource.value : [];
        const keywordResults = blogResults.filter((result) => result.searchOrigin !== "ai");
        const aiResults = blogResults.filter((result) => result.searchOrigin === "ai");
        const canStageAiSupplement =
          isWebDemoBuildEnabled() &&
          selected.data !== "keyword" &&
          blog.status === "fulfilled" &&
          blog.value.effectiveMode === selected.data &&
          aiResults.length > 0;
        setResults(
          groupSearchResults(
            canStageAiSupplement
              ? [...keywordResults, ...playbookResults]
              : [...blogResults, ...playbookResults]
          )
        );
        if (blog.status === "fulfilled") {
          setEffectiveMode(blog.value.effectiveMode);
          setReason(blog.value.reason ?? undefined);
        }
        if (canStageAiSupplement) {
          setAiSupplementLoading(true);
          void waitForWebDemoAiSupplement(controller.signal)
            .then(() => {
              if (requestIdRef.current !== requestId || controller.signal.aborted) return;
              // The API has already ranked literal and AI candidates together.
              // Preserve that order when the delayed supplement becomes visible.
              setResults(groupSearchResults([...blogResults, ...playbookResults]));
              setAiSupplementLoading(false);
            })
            .catch(() => {
              if (requestIdRef.current !== requestId || controller.signal.aborted) return;
              setAiSupplementLoading(false);
            });
        }
        const failures = sources.filter((source) => source.status === "rejected");
        if (failures.length)
          setError(
            failures
              .map((source) =>
                source.reason instanceof Error ? source.reason.message : "搜索暂不可用"
              )
              .join("；")
          );
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
  }, [playbook]);

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
    (value: string, selectedMode = mode) => {
      const nextQuery = value.trim();
      setQuery(nextQuery);
      const currentHref = window.location.href;
      const nextHref = buildSearchHref(currentHref, nextQuery, selectedMode);
      if (!shouldPushSearchHref(currentHref, nextQuery, selectedMode)) {
        window.history.replaceState({ publicSearchQuery: nextQuery }, "", nextHref);
        syncFromLocation();
        return;
      }

      window.history.pushState({ publicSearchQuery: nextQuery }, "", nextHref);
      syncFromLocation();
    },
    [syncFromLocation, mode]
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
      error={error}
      filter={filter}
      onFilterChange={setFilter}
      onQueryChange={setQuery}
      onClear={clearSearch}
      onRetry={retrySearch}
      onRecommendedSearch={runSearchForQuery}
      onSubmit={onSubmit}
      recommendedSearchTerms={recommendedSearchTerms}
      isLoadingRecommendations={isLoadingRecommendations}
      aiSupplementLoading={aiSupplementLoading}
      inputRef={inputRef}
      resolveHref={(result) => toPublicSitePath(getSearchResultHref(result)) ?? "#"}
    />
  );
}
