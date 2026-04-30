import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PublicSearchPage from "@/components/search/PublicSearchPage";
import type { SearchFilter, SearchResultItem } from "@/components/search/search-model";
import { toPublicApiUrl, toPublicSitePath } from "../lib/runtime-urls";

async function search(query: string) {
  const response = await fetch(
    toPublicApiUrl(`/api/public/search?q=${encodeURIComponent(query)}&topK=50`)
  );
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string" ? payload.error : "搜索失败，请稍后重试";
    throw new Error(message);
  }
  return (payload ?? []) as SearchResultItem[];
}

export default function SearchPageIsland({ initialQuery = "" }: { initialQuery?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [searchedQuery, setSearchedQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(initialQuery.trim().length > 0);
  const [error, setError] = useState<string | null>(null);

  const syncFromLocation = useCallback(() => {
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
    setIsLoading(true);
    setError(null);
    void search(current.trim())
      .then(setResults)
      .catch((err: unknown) => {
        setResults([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    syncFromLocation();
    const handlePopstate = () => syncFromLocation();
    window.addEventListener("popstate", handlePopstate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", handlePopstate);
    };
  }, [syncFromLocation]);

  const canSearch = useMemo(() => query.trim().length > 0, [query]);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextQuery = query.trim();
      const nextUrl = new URL(window.location.href);
      if (nextQuery) nextUrl.searchParams.set("q", nextQuery);
      else nextUrl.searchParams.delete("q");
      window.history.pushState({}, "", nextUrl);
      syncFromLocation();
    },
    [query, syncFromLocation]
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
      onSubmit={onSubmit}
      inputRef={inputRef}
      resolveHref={(result) =>
        toPublicSitePath(
          result.type === "memo" ? `/memos/${result.slug}` : `/posts/${result.slug}`
        ) ?? "#"
      }
    />
  );
}
