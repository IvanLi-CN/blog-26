"use client";

import { type FormEvent, type ReactNode, type RefObject, useMemo, useState } from "react";
import type { SearchSuggestionItem, SearchSuggestionStrategy } from "@/lib/ai/search-suggestions";
import { cn } from "@/lib/utils";
import SearchHydrationSafeIcon from "./SearchHydrationSafeIcon";
import SearchResultsList from "./SearchResultsList";
import {
  countSearchResultsByType,
  filterSearchResults,
  groupSearchResults,
  type SearchFilter,
  type SearchResultGroup,
  type SearchResultItem,
  searchFilters,
} from "./search-model";

export type PublicSearchPageProps = {
  query: string;
  searchedQuery?: string;
  results: Array<SearchResultItem | SearchResultGroup>;
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
    warning: "bg-[rgba(var(--nature-secondary-rgb),0.18)] text-[color:var(--nature-accent-strong)]",
    error: "bg-[rgba(179,92,98,0.14)] text-[color:var(--nature-danger)]",
  }[tone];

  return (
    <article
      role={role}
      aria-label={ariaLabel}
      className="nature-panel nature-panel-soft relative overflow-hidden px-4 py-4 sm:px-6 sm:py-6"
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
            "flex h-12 w-12 items-center justify-center rounded-[var(--nature-radius-sm)] border border-[color:var(--nature-line)] shadow-[inset_0_1px_0_rgba(var(--nature-highlight-rgb),0.25)] sm:h-16 sm:w-16 sm:rounded-[1.45rem]",
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
      className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(var(--nature-accent-rgb),0.2)] bg-[rgba(var(--nature-surface-rgb),0.58)] px-3.5 text-sm font-medium text-[color:var(--nature-text)] shadow-[0_10px_28px_rgba(var(--nature-shadow-rgb),0.07)] transition hover:-translate-y-0.5 hover:border-[rgba(var(--nature-accent-rgb),0.42)] hover:bg-[rgba(var(--nature-accent-rgb),0.12)] hover:text-[color:var(--nature-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(var(--nature-accent-rgb),0.42)]"
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
  compact = false,
}: {
  terms: Array<string | SearchSuggestionItem>;
  isLoading?: boolean;
  onSearch?: (query: string) => void;
  compact?: boolean;
}) {
  if (compact) {
    return isLoading ? (
      <p className="text-sm leading-6 text-[color:var(--nature-text-soft)]">正在准备可重试的方向</p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {toSuggestionItems(terms).map((item) => (
          <SearchTermButton
            key={`${item.strategy}-${item.term}`}
            onClick={() => onSearch?.(item.term)}
          >
            {item.term}
          </SearchTermButton>
        ))}
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="w-full rounded-[var(--nature-radius-sm)] border border-[rgba(var(--nature-accent-rgb),0.16)] bg-[rgba(var(--nature-surface-rgb),0.68)] px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-[color:var(--nature-text-faint)]">
            <SearchHydrationSafeIcon name="tabler:sparkles" className="h-4 w-4" />
            正在准备可重试的方向
          </div>
          <div className="flex flex-wrap gap-2">
            {["suggestion-loading-1", "suggestion-loading-2", "suggestion-loading-3"].map((key) => (
              <span key={key} className="nature-skeleton h-11 w-24 rounded-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const suggestionItems = toSuggestionItems(terms);
  if (suggestionItems.length === 0) return null;

  return (
    <div className="w-full rounded-[var(--nature-radius-sm)] border border-[rgba(var(--nature-accent-rgb),0.16)] bg-[rgba(var(--nature-surface-rgb),0.68)] px-4 py-3 shadow-[inset_0_1px_0_rgba(var(--nature-highlight-rgb),0.12)]">
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
  const groupedResults = useMemo(() => groupSearchResults(results), [results]);
  const [expansion, setExpansion] = useState({ query: activeQuery, keys: new Set<string>() });
  if (expansion.query !== activeQuery)
    setExpansion({ query: activeQuery, keys: new Set<string>() });
  const toggleContent = (key: string) =>
    setExpansion((previous) => {
      const keys = new Set(previous.query === activeQuery ? previous.keys : []);
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      return { query: activeQuery, keys };
    });
  const counts = countSearchResultsByType(groupedResults);
  const filteredResults = filterSearchResults(groupedResults, filter);
  const hasResults = groupedResults.length > 0;
  const runRecommendedSearch = onRecommendedSearch ?? onQueryChange;
  const hideNoResultsSummaryOnMobile = activeQuery.length > 0 && !isLoading && !hasResults;

  return (
    <div
      className={cn(
        "public-search-layout w-full lg:mx-auto lg:grid lg:w-[var(--nature-content-width)] lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start lg:gap-8 lg:py-8",
        className
      )}
      aria-busy={isLoading || undefined}
    >
      <section
        aria-label="搜索操作"
        className="nature-container pb-2 pt-2 sm:py-6 lg:m-0 lg:w-full lg:min-w-0 lg:p-0"
      >
        <div className="nature-surface overflow-hidden" data-search-query-panel>
          <div className="grid gap-3 px-4 py-4 sm:gap-5 sm:px-7 sm:py-6 lg:px-5 lg:py-5">
            <div className="min-w-0">
              <h1 className="nature-title text-xl font-semibold leading-tight sm:text-3xl lg:text-2xl">
                搜索内容
              </h1>
              <p className="mt-2 hidden max-w-[58ch] text-sm leading-6 text-[color:var(--nature-text-soft)] sm:mt-3 sm:block sm:text-base sm:leading-7 lg:text-sm lg:leading-6">
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
              <div className="nature-input-shell nature-search-input-shell">
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
                    className="nature-search-submit inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:px-4 lg:w-11 lg:px-0"
                  >
                    <SearchHydrationSafeIcon name="tabler:arrow-right" className="h-4 w-4" />
                    <span className="hidden sm:inline lg:hidden">搜索</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="border-t border-[color:var(--nature-line)] bg-[rgba(var(--nature-surface-rgb),0.52)] px-4 py-1.5 sm:px-7 sm:py-4 lg:px-5 lg:py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 lg:flex-col lg:items-stretch lg:gap-5">
              <div
                className={cn(
                  "text-sm text-[color:var(--nature-text-soft)]",
                  hideNoResultsSummaryOnMobile && "hidden sm:block"
                )}
              >
                {isLoading && activeQuery ? (
                  <>
                    正在搜索「<span data-search-query-text>{activeQuery}</span>」
                  </>
                ) : hasResults ? (
                  `关键词「${activeQuery}」 · 找到 ${groupedResults.length} 条内容`
                ) : activeQuery ? (
                  `还没有找到「${activeQuery}」`
                ) : (
                  "等待输入关键词"
                )}
              </div>
              <fieldset className="flex flex-wrap items-center gap-2 lg:grid lg:grid-cols-2 lg:gap-1">
                <legend className="sr-only lg:mb-3 lg:block lg:not-sr-only lg:text-sm lg:font-semibold">
                  结果类型筛选
                </legend>
                {searchFilters.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onFilterChange(item.key)}
                    disabled={isBootstrap}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition lg:w-full lg:justify-between lg:rounded-lg lg:border-0",
                      filter === item.key
                        ? "border-[rgba(var(--nature-accent-rgb),0.42)] bg-[rgba(var(--nature-accent-rgb),0.14)] text-[color:var(--nature-accent-strong)]"
                        : "border-[color:var(--nature-line)] bg-[rgba(var(--nature-surface-rgb),0.48)] text-[color:var(--nature-text-soft)] hover:border-[color:var(--nature-line-strong)] hover:text-[color:var(--nature-text)] lg:bg-transparent"
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
          <section
            aria-label="建议搜索词"
            className="hidden border-t border-[color:var(--nature-line)] px-5 py-5 lg:block"
          >
            <h2 className="mb-3 text-sm font-semibold">建议搜索词</h2>
            <RecommendedSearchTerms
              compact
              terms={
                recommendedSearchTerms.length ? recommendedSearchTerms : ["Arch", "React", "SQLite"]
              }
              isLoading={isLoadingRecommendations}
              onSearch={runRecommendedSearch}
            />
          </section>
        </div>
      </section>

      <section
        aria-label="搜索结果"
        className="nature-container pb-10 pt-1 sm:pb-14 sm:pt-4 lg:m-0 lg:w-full lg:min-w-0 lg:pt-0"
        data-search-results-region
      >
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
            description="可搜索文章、公开闪念，以及执念中的 Topic、项目实践和 Policy Skill。"
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
                <div key={key} className="nature-panel-soft px-4 py-4 sm:px-5 sm:py-5">
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
            <div className="w-full lg:hidden">
              <RecommendedSearchTerms
                terms={recommendedSearchTerms}
                isLoading={isLoadingRecommendations}
                onSearch={runRecommendedSearch}
              />
            </div>
          </SearchPromptPanel>
        )}

        {!isLoading && filteredResults.length > 0 && (
          <SearchResultsList
            results={filteredResults}
            expandedContentKeys={expansion.keys}
            onToggleContent={toggleContent}
            query={activeQuery}
            resolveHref={resolveHref}
          />
        )}
      </section>
    </div>
  );
}
