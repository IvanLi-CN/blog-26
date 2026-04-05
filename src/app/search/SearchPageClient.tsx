"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchResultsList, { type SearchResultItem } from "@/components/search/SearchResultsList";
import Icon from "@/components/ui/Icon";
import { trpc } from "@/lib/trpc";

export default function SearchPageClient({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // focus input on mount to improve UX (avoid autoFocus attribute)
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  // sync local state when URL changes via back/forward
  useEffect(() => {
    const current = searchParams.get("q") || "";
    setQ(current);
  }, [searchParams]);

  const canSearch = q.trim().length > 0;
  const params = useMemo(() => ({ q: q.trim(), topK: 50 }), [q]);
  const { data, isFetching, isLoading, error, refetch } = trpc.search.ai.enhanced.useQuery(params, {
    enabled: canSearch,
    staleTime: 30_000,
  });

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const next = new URLSearchParams(searchParams.toString());
      if (q.trim()) next.set("q", q.trim());
      else next.delete("q");
      router.push(`${pathname}?${next.toString()}`);
      if (q.trim()) void refetch();
    },
    [q, pathname, router, searchParams, refetch]
  );

  return (
    <div className="w-full">
      <div className="nature-reading-container mb-4">
        <div className="nature-surface px-6 py-7 sm:px-8">
          <span className="nature-kicker mb-3 inline-flex">Search Stream</span>
          <h1 className="nature-title text-3xl font-semibold">搜索</h1>
          <p className="nature-muted mt-3 text-sm leading-7 sm:text-base">
            语义检索和全文检索都收拢到更柔和的表面里，减少工具感。
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="nature-reading-container mb-6">
        <label className="nature-input-shell w-full">
          <Icon name="tabler:search" className="w-5 h-5 text-[color:var(--nature-text-faint)]" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入关键词后回车…"
            className="nature-input"
            autoComplete="off"
          />
          {(isFetching || isLoading) && <span className="nature-spinner ml-1" />}
        </label>
      </form>

      <section className="nature-reading-container">
        {error && (
          <div role="alert" className="nature-alert nature-alert-error mb-4">
            <Icon name="tabler:alert-triangle" className="w-5 h-5" />
            <span>
              {(() => {
                if (!error) return "搜索失败，请稍后重试";
                return error instanceof Error && error.message
                  ? error.message
                  : "搜索失败，请稍后重试";
              })()}
            </span>
          </div>
        )}

        {!canSearch && (
          <div className="nature-empty">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Icon name="tabler:stars" className="w-5 h-5" />
              <span>输入关键词开始搜索</span>
            </div>
            <div className="text-sm">
              <kbd className="nature-kbd">⌘</kbd>
              <kbd className="nature-kbd ml-1">K</kbd>
              <span className="ml-2">可打开全局搜索</span>
            </div>
          </div>
        )}

        {(isLoading || isFetching) && canSearch && (
          <div className="space-y-4">
            {["k1", "k2", "k3", "k4", "k5", "k6"].map((k) => (
              <div key={k} className="flex items-start gap-4">
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

        {!isLoading && !isFetching && canSearch && (data?.length || 0) === 0 && (
          <div className="nature-empty">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Icon name="tabler:mood-empty" className="w-5 h-5" />
              <span>没有找到相关结果</span>
            </div>
            <div className="text-sm">试试更通用的关键词</div>
          </div>
        )}

        {!isLoading && !isFetching && (data?.length || 0) > 0 && (
          <SearchResultsList
            results={(data ?? []) as SearchResultItem[]}
            containerClassName="p-0"
          />
        )}
      </section>
    </div>
  );
}
