"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchResultsList from "@/components/search/SearchResultsList";
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
      {/* Heading */}
      <div className="mx-auto w-full max-w-3xl mb-4">
        <h1 className="text-2xl font-semibold">搜索</h1>
      </div>

      {/* Search bar */}
      <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl mb-6">
        <label className="input input-bordered flex items-center gap-2 w-full">
          <Icon name="tabler:search" className="w-5 h-5 opacity-60" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入关键词后回车…"
            className="grow"
            autoComplete="off"
          />
          {(isFetching || isLoading) && (
            <span className="loading loading-spinner loading-xs ml-1" />
          )}
        </label>
      </form>

      {/* Results */}
      <section className="mx-auto w-full max-w-3xl">
        {error && (
          <div role="alert" className="alert alert-error mb-4">
            <Icon name="tabler:alert-triangle" className="w-5 h-5" />
            <span>{String((error as any)?.message || "搜索失败，请稍后重试")}</span>
          </div>
        )}

        {!canSearch && (
          <div className="p-10 text-center text-base-content/60">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Icon name="tabler:stars" className="w-5 h-5" />
              <span>输入关键词开始搜索</span>
            </div>
            <div className="text-sm">
              <kbd className="kbd kbd-xxs">⌘</kbd>
              <kbd className="kbd kbd-xxs ml-1">K</kbd>
              <span className="ml-2">可打开全局搜索</span>
            </div>
          </div>
        )}

        {(isLoading || isFetching) && canSearch && (
          <div className="space-y-4">
            {["k1", "k2", "k3", "k4", "k5", "k6"].map((k) => (
              <div key={k} className="flex items-start gap-4">
                <div className="skeleton w-10 h-10 rounded" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-1/3" />
                  <div className="skeleton h-3 w-5/6" />
                  <div className="skeleton h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isFetching && canSearch && (data?.length || 0) === 0 && (
          <div className="p-10 text-center text-base-content/60">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Icon name="tabler:mood-empty" className="w-5 h-5" />
              <span>没有找到相关结果</span>
            </div>
            <div className="text-sm">试试更通用的关键词</div>
          </div>
        )}

        {!isLoading && !isFetching && (data?.length || 0) > 0 && (
          <SearchResultsList results={(data ?? []) as any} containerClassName="p-0" />
        )}
      </section>
    </div>
  );
}
