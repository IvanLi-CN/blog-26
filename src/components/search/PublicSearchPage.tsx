"use client";

import type { FormEvent, ReactNode, RefObject } from "react";
import type { SearchSuggestionItem, SearchSuggestionStrategy } from "@/lib/ai/search-suggestions";
import { cn } from "@/lib/utils";
import SearchHydrationSafeIcon from "./SearchHydrationSafeIcon";
import SearchResultsList from "./SearchResultsList";
import {
  countSearchResultsByType,
  filterSearchResults,
  type SearchFilter,
  type SearchResultItem,
  searchFilters,
} from "./search-model";

export type PublicSearchPageProps = {
  query: string;
  searchedQuery?: string;
  results: SearchResultItem[];
  isLoading?: boolean;
  error?: unknown;
  filter: SearchFilter;
  onFilterChange: (filter: SearchFilter) => void;
  onQueryChange: (query: string) => void;
  onClear?: () => void;
  onRetry?: () => void;
  onRecommendedSearch?: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  recommendedSearchTerms?: Array<string | SearchSuggestionItem>;
  isLoadingRecommendations?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  inputId?: string;
  isBootstrap?: boolean;
  resolveHref?: (result: SearchResultItem) => string;
  className?: string;
};

function formatError(error: PublicSearchPageProps["error"]) {
  if (!error) return null;
  if (error instanceof Error) return error.message || "搜索失败，请稍后重试";
  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof error !== "string") return "搜索失败，请稍后重试";
  return error;
}

function SearchPromptPanel({
  tone = "neutral",
  icon,
  eyebrow,
  title,
  description,
  children,
  role,
  ariaLabel,
  watermark,
}: {
  tone?: "neutral" | "accent" | "warning" | "error";
  icon: string;
  eyebrow: string;
  title: ReactNode;
  description: string;
  children?: ReactNode;
  role?: "status" | "alert";
  ariaLabel?: string;
  watermark: string;
}) {
  const toneClass = {
    neutral: "bg-[rgba(var(--nature-highlight-rgb),0.28)] text-[color:var(--nature-text-soft)]",
    accent: "bg-[rgba(var(--nature-accent-rgb),0.14)] text-[color:var(--nature-accent-strong)]",
    warning: "bg-[rgba(var(--nature-accent-2-rgb),0.18)] text-[color:var(--nature-accent-strong)]",
    error: "bg-[rgba(179,92,98,0.14)] text-[color:var(--nature-danger)]",
  }[tone];

  return (
    <article
      role={role}
      aria-label={ariaLabel}
      className="nature-panel nature-panel-soft relative overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-6 top-5 hidden text-[7rem] font-black leading-none text-[rgba(var(--nature-accent-rgb),0.055)] sm:block"
      >
        {watermark}
      </div>
      <div className="relative grid gap-5 sm:grid-cols-[4.25rem_minmax(0,1fr)] sm:items-start">
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-[1.45rem] border border-[color:var(--nature-line)] shadow-[inset_0_1px_0_rgba(var(--nature-highlight-rgb),0.25)]",
            toneClass
          )}
        >
          <SearchHydrationSafeIcon
            name={icon}
            className={cn("h-8 w-8", icon === "tabler:loader-2" && "animate-spin")}
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="nature-kicker px-3 py-1 text-xs">{eyebrow}</span>
          </div>
          <h2 className="mt-3 font-heading text-2xl font-semibold leading-tight text-[color:var(--nature-text)] sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 max-w-[64ch] text-sm leading-7 text-[color:var(--nature-text-soft)] sm:text-base">
            {description}
          </p>
          {children && <div className="mt-5 flex flex-wrap items-center gap-2">{children}</div>}
        </div>
      </div>
    </article>
  );
}

function SearchTermButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex min-h-10 items-center gap-2 rounded-full border border-[rgba(var(--nature-accent-rgb),0.2)] bg-[rgba(var(--nature-surface-rgb),0.58)] px-3.5 text-sm font-medium text-[color:var(--nature-text)] shadow-[0_10px_28px_rgba(var(--nature-shadow-rgb),0.07)] transition hover:-translate-y-0.5 hover:border-[rgba(var(--nature-accent-rgb),0.42)] hover:bg-[rgba(var(--nature-accent-rgb),0.12)] hover:text-[color:var(--nature-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(var(--nature-accent-rgb),0.42)]"
    >
      <SearchHydrationSafeIcon
        name="tabler:search"
        className="h-4 w-4 text-[color:var(--nature-text-faint)] transition group-hover:text-[color:var(--nature-accent-strong)]"
      />
      {children}
    </button>
  );
}

const suggestionStrategyMeta: Record<
  SearchSuggestionStrategy,
  { label: string; fallbackRationale: string }
> = {
  broader_by_domain: {
    label: "泛化",
    fallbackRationale: "把关键词放到更大的主题里重试。",
  },
  related: {
    label: "相关",
    fallbackRationale: "换成经常一起出现的概念。",
  },
  sibling: {
    label: "兄弟",
    fallbackRationale: "试试同一类别里的相近对象。",
  },
  alternative_label: {
    label: "替代",
    fallbackRationale: "使用同一概念的另一个叫法。",
  },
};

const suggestionStrategyOrder: SearchSuggestionStrategy[] = [
  "broader_by_domain",
  "related",
  "sibling",
  "alternative_label",
];

function toSuggestionItems(terms: Array<string | SearchSuggestionItem>) {
  return terms
    .map((item, index): SearchSuggestionItem | null => {
      if (typeof item === "string") {
        const term = item.trim();
        if (!term) return null;
        return {
          term,
          strategy: suggestionStrategyOrder[index % suggestionStrategyOrder.length],
        };
      }
      if (!item.term?.trim()) return null;
      return {
        ...item,
        term: item.term.trim(),
        strategy: item.strategy ?? "related",
      };
    })
    .filter((item): item is SearchSuggestionItem => item !== null);
}

function RecommendedSearchTerms({
  terms,
  isLoading,
  onSearch,
}: {
  terms: Array<string | SearchSuggestionItem>;
  isLoading?: boolean;
  onSearch?: (query: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="w-full rounded-[1.35rem] border border-[rgba(var(--nature-accent-rgb),0.16)] bg-[rgba(var(--nature-highlight-rgb),0.24)] px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-[color:var(--nature-text-faint)]">
            <SearchHydrationSafeIcon name="tabler:sparkles" className="h-4 w-4" />
            正在准备可重试的方向
          </div>
          <div className="flex flex-wrap gap-2">
            {["suggestion-loading-1", "suggestion-loading-2", "suggestion-loading-3"].map((key) => (
              <span key={key} className="nature-skeleton h-10 w-24 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const suggestionItems = toSuggestionItems(terms);
  if (suggestionItems.length === 0) return null;

  return (
    <div className="w-full rounded-[1.35rem] border border-[rgba(var(--nature-accent-rgb),0.16)] bg-[rgba(var(--nature-highlight-rgb),0.24)] px-4 py-3 shadow-[inset_0_1px_0_rgba(var(--nature-highlight-rgb),0.22)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-[color:var(--nature-text-faint)]">
          <SearchHydrationSafeIcon name="tabler:sparkles" className="h-4 w-4" />
          换个方向搜
        </div>
        <div className="flex flex-wrap gap-2">
          {suggestionItems.map((item) => {
            const meta = suggestionStrategyMeta[item.strategy];
            return (
              <SearchTermButton
                key={`${item.strategy}-${item.term}`}
                onClick={() => onSearch?.(item.term)}
              >
                <span className="rounded-full bg-[rgba(var(--nature-accent-rgb),0.12)] px-2 py-0.5 text-[0.72rem] font-semibold text-[color:var(--nature-accent-strong)]">
                  {meta.label}
                </span>
                <span>{item.term}</span>
                <span className="sr-only">{item.rationale ?? meta.fallbackRationale}</span>
              </SearchTermButton>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SearchSecondaryButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[rgba(var(--nature-accent-rgb),0.28)] bg-[rgba(var(--nature-accent-rgb),0.1)] px-4 text-sm font-medium text-[color:var(--nature-accent-strong)] transition hover:-translate-y-0.5 hover:border-[rgba(var(--nature-accent-rgb),0.46)] hover:bg-[rgba(var(--nature-accent-rgb),0.16)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(var(--nature-accent-rgb),0.42)]"
    >
      {children}
    </button>
  );
}

export default function PublicSearchPage({
  query,
  searchedQuery,
  results,
  isLoading = false,
  error,
  filter,
  onFilterChange,
  onQueryChange,
  onClear,
  onRetry,
  onRecommendedSearch,
  onSubmit,
  recommendedSearchTerms = [],
  isLoadingRecommendations = false,
  inputRef,
  inputId = "public-search-input",
  isBootstrap = false,
  resolveHref,
  className,
}: PublicSearchPageProps) {
  const trimmedQuery = query.trim();
  const activeQuery = (searchedQuery ?? trimmedQuery).trim();
  const canSearch = trimmedQuery.length > 0;
  const errorMessage = formatError(error);
  const counts = countSearchResultsByType(results);
  const filteredResults = filterSearchResults(results, filter);
  const hasResults = results.length > 0;
  const runRecommendedSearch = onRecommendedSearch ?? onQueryChange;

  return (
    <div className={cn("w-full", className)} aria-busy={isLoading || undefined}>
      <section className="nature-container pb-2 pt-2 sm:py-6 lg:py-8">
        <div className="nature-surface overflow-hidden" data-search-query-panel>
          <div className="grid gap-3 px-5 py-4 sm:gap-5 sm:px-7 sm:py-6 lg:grid-cols-[minmax(0,0.68fr)_minmax(26rem,1fr)] lg:items-center lg:gap-8 lg:px-8">
            <div className="min-w-0">
              <span className="nature-kicker hidden gap-2 px-3 py-1 text-xs sm:inline-flex">
                <SearchHydrationSafeIcon name="tabler:search" className="h-4 w-4" />
                内容检索
              </span>
              <h1 className="nature-title text-xl font-semibold leading-tight sm:mt-3 sm:text-3xl">
                搜索内容
              </h1>
              <p className="mt-2 hidden max-w-[58ch] text-sm leading-6 text-[color:var(--nature-text-soft)] sm:mt-3 sm:block sm:text-base sm:leading-7">
                输入技术名词、项目名、标签或片段，快速定位相关记录。
              </p>
            </div>

            <form onSubmit={onSubmit} className="min-w-0">
              <label
                htmlFor={inputId}
                className="sr-only sm:mb-2 sm:block sm:not-sr-only sm:text-sm sm:font-semibold sm:text-[color:var(--nature-text)]"
              >
                搜索关键词
              </label>
              <div className="nature-input-shell min-h-[3.5rem] bg-[rgba(var(--nature-highlight-rgb),0.48)] shadow-[0_18px_44px_rgba(var(--nature-shadow-rgb),0.12)] sm:min-h-[4rem]">
                <label
                  htmlFor={inputId}
                  className="flex min-w-0 flex-1 cursor-text items-center gap-3 self-stretch"
                >
                  <SearchHydrationSafeIcon
                    name="tabler:search"
                    className="h-5 w-5 shrink-0 text-[color:var(--nature-text-faint)]"
                  />
                  <input
                    ref={inputRef}
                    id={inputId}
                    type="text"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    readOnly={isBootstrap}
                    placeholder="例如 Arch、React、SQLite"
                    className="nature-input self-stretch"
                    autoComplete="off"
                    aria-label="搜索关键词"
                    data-search-query-input
                  />
                </label>
                {trimmedQuery && !isLoading && onClear && (
                  <button
                    type="button"
                    onClick={onClear}
                    aria-label="清除搜索关键词"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[color:var(--nature-text-faint)] transition hover:bg-[rgba(var(--nature-accent-rgb),0.1)] hover:text-[color:var(--nature-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(var(--nature-accent-rgb),0.42)]"
                  >
                    <SearchHydrationSafeIcon name="tabler:x" className="h-4 w-4" />
                  </button>
                )}
                {isLoading ? (
                  <span
                    className="nature-spinner ml-1 shrink-0"
                    role="status"
                    aria-label="正在搜索"
                  />
                ) : (
                  <button
                    type="submit"
                    disabled={!canSearch}
                    aria-label="搜索"
                    className="nature-search-submit inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[color:var(--nature-accent-strong)] px-4 text-sm font-medium transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <SearchHydrationSafeIcon name="tabler:arrow-right" className="h-4 w-4" />
                    <span className="hidden sm:inline">搜索</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="border-t border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.18)] px-5 py-1.5 sm:px-7 sm:py-4 lg:px-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="text-sm text-[color:var(--nature-text-soft)]">
                {isLoading && activeQuery ? (
                  <>
                    正在搜索「<span data-search-query-text>{activeQuery}</span>」
                  </>
                ) : hasResults ? (
                  `关键词「${activeQuery}」 · 找到 ${results.length} 条内容`
                ) : activeQuery ? (
                  `还没有找到「${activeQuery}」`
                ) : (
                  "等待输入关键词"
                )}
              </div>
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="sr-only">结果类型筛选</legend>
                {searchFilters.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onFilterChange(item.key)}
                    disabled={isBootstrap}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition",
                      filter === item.key
                        ? "border-[rgba(var(--nature-accent-rgb),0.42)] bg-[rgba(var(--nature-accent-rgb),0.14)] text-[color:var(--nature-accent-strong)]"
                        : "border-[color:var(--nature-line)] bg-[rgba(var(--nature-surface-rgb),0.48)] text-[color:var(--nature-text-soft)] hover:border-[color:var(--nature-line-strong)] hover:text-[color:var(--nature-text)]"
                    )}
                    aria-pressed={filter === item.key}
                  >
                    <span>{item.label}</span>
                    <span className="text-xs opacity-70">{counts[item.key]}</span>
                  </button>
                ))}
              </fieldset>
            </div>
          </div>
        </div>
      </section>

      <section className="nature-container pb-10 pt-1 sm:pb-14 sm:pt-4" data-search-results-region>
        {errorMessage && (
          <SearchPromptPanel
            role="alert"
            tone="error"
            icon="tabler:alert-triangle"
            eyebrow="搜索中断"
            title="搜索暂时没有完成"
            description={errorMessage}
            watermark="!"
          >
            {activeQuery && onRetry && (
              <SearchSecondaryButton onClick={onRetry}>
                <SearchHydrationSafeIcon name="tabler:refresh" className="h-4 w-4" />
                重试当前搜索
              </SearchSecondaryButton>
            )}
          </SearchPromptPanel>
        )}

        {!activeQuery && !isLoading && (
          <SearchPromptPanel
            tone="accent"
            icon="tabler:sparkles"
            eyebrow="开始探索"
            title="输入关键词开始搜索"
            description="可搜索公开文章、Memos、标签和工具名。用清晰名词进入最快。"
            watermark="GO"
          />
        )}

        {isLoading && activeQuery && (
          <div className="space-y-4">
            <SearchPromptPanel
              role="status"
              ariaLabel="搜索结果加载中"
              tone="accent"
              icon="tabler:loader-2"
              eyebrow="正在搜索"
              title={
                <>
                  正在检索「<span data-search-query-text>{activeQuery}</span>」
                </>
              }
              description="正在提取匹配片段并排序，命中后可直接打开结果。"
              watermark="..."
            />
            <div className="grid gap-3">
              {["search-loading-1", "search-loading-2", "search-loading-3"].map((key) => (
                <div key={key} className="nature-panel-soft px-5 py-5">
                  <div className="space-y-3">
                    <div className="nature-skeleton h-4 w-2/5 rounded-full" />
                    <div className="nature-skeleton h-3 w-full rounded-full" />
                    <div className="nature-skeleton h-3 w-3/4 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading &&
          activeQuery &&
          !errorMessage &&
          hasResults &&
          filteredResults.length === 0 && (
            <SearchPromptPanel
              tone="warning"
              icon="tabler:filter-search"
              eyebrow="筛选后为空"
              title="这个类型里没有匹配项"
              description="当前关键词有结果，但不在这个内容类型里。切回全部可以继续查看其它结果。"
              watermark="ALL"
            />
          )}

        {!isLoading && activeQuery && !errorMessage && !hasResults && (
          <SearchPromptPanel
            tone="neutral"
            icon="tabler:leaf-off"
            eyebrow="没有结果"
            title="没有找到相关内容"
            description="没有命中当前关键词。下面是更可能找到内容的搜索方向，点一下即可重试。"
            watermark="0"
          >
            <RecommendedSearchTerms
              terms={recommendedSearchTerms}
              isLoading={isLoadingRecommendations}
              onSearch={runRecommendedSearch}
            />
          </SearchPromptPanel>
        )}

        {!isLoading && filteredResults.length > 0 && (
          <SearchResultsList
            results={filteredResults}
            query={activeQuery}
            resolveHref={resolveHref}
          />
        )}
      </section>
    </div>
  );
}
