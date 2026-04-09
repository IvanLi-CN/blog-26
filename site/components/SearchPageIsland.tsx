import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

type ResultType = "post" | "memo";

type SearchResultItem = {
  slug: string;
  title?: string | null;
  excerpt?: string | null;
  type?: ResultType;
  final?: number;
};

async function search(query: string) {
  const response = await fetch(`/api/public/search?q=${encodeURIComponent(query)}&topK=50`);
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const message =
      payload && typeof payload.error === "string" ? payload.error : "搜索失败，请稍后重试";
    throw new Error(message);
  }
  return (payload ?? []) as SearchResultItem[];
}

export default function SearchPageIsland() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const syncFromLocation = useCallback(() => {
    const current = new URL(window.location.href).searchParams.get("q") || "";
    setQuery(current);
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
    <div className="w-full">
      <div className="nature-container mb-4">
        <div className="nature-surface px-6 py-7 sm:px-8">
          <span className="nature-kicker mb-3 inline-flex">Search Stream</span>
          <h1 className="nature-title text-3xl font-semibold">搜索</h1>
          <p className="nature-muted mt-3 text-sm leading-7 sm:text-base">
            语义检索和全文检索都收拢到更柔和的表面里，减少工具感。
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="nature-container mb-6">
        <label className="nature-input-shell w-full">
          <Icon name="tabler:search" className="h-5 w-5 text-[color:var(--nature-text-faint)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入关键词后回车…"
            className="nature-input"
            autoComplete="off"
          />
          {isLoading && <span className="nature-spinner ml-1" />}
        </label>
      </form>

      <section className="nature-container">
        {error && (
          <div role="alert" className="nature-alert nature-alert-error mb-4">
            <Icon name="tabler:alert-triangle" className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {!canSearch && (
          <div className="nature-empty">
            <div className="mb-2 flex items-center justify-center gap-2">
              <Icon name="tabler:stars" className="h-5 w-5" />
              <span>输入关键词开始搜索</span>
            </div>
            <div className="text-sm">支持文章与 Memos 的统一检索。</div>
          </div>
        )}

        {isLoading && canSearch && (
          <div className="space-y-4">
            {["k1", "k2", "k3", "k4"].map((key) => (
              <div key={key} className="flex items-start gap-4">
                <div className="nature-skeleton h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="nature-skeleton h-4 w-1/3 rounded-full" />
                  <div className="nature-skeleton h-3 w-5/6 rounded-full" />
                  <div className="nature-skeleton h-3 w-2/3 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && canSearch && results.length === 0 && !error && (
          <div className="nature-empty">
            <div className="mb-2 flex items-center justify-center gap-2">
              <Icon name="tabler:mood-empty" className="h-5 w-5" />
              <span>没有找到相关结果</span>
            </div>
            <div className="text-sm">试试更通用的关键词</div>
          </div>
        )}

        {!isLoading && results.length > 0 && (
          <ul className="flex w-full flex-col gap-3">
            {results.map((result) => {
              const type = result.type || "post";
              const href = type === "memo" ? `/memos/${result.slug}` : `/posts/${result.slug}`;
              return (
                <li key={`${type}-${result.slug}`} className="list-none">
                  <a href={href} className="nature-panel nature-panel-soft block px-4 py-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.22)] text-[color:var(--nature-text-soft)]">
                        <span>{type === "memo" ? "M" : "P"}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="max-w-[75%] truncate font-medium">
                            {result.title || result.slug}
                          </span>
                          <span className="nature-chip capitalize">{type}</span>
                          {typeof result.final === "number" && (
                            <span className="nature-chip nature-chip-accent">
                              {(result.final * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        {result.excerpt && (
                          <p className="nature-muted line-clamp-2 text-sm">{result.excerpt}</p>
                        )}
                        <div className="text-xs text-[color:var(--nature-text-faint)]">{href}</div>
                      </div>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
