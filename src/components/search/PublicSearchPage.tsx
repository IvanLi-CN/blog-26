"use client";

import type { FormEvent, ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";
import Icon from "../ui/Icon";
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
  onRecommendedSearch?: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  recommendedSearchTerms?: string[];
  isLoadingRecommendations?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
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
  title: string;
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
          <Icon
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
      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[rgba(var(--nature-accent-rgb),0.22)] bg-[rgba(var(--nature-surface-rgb),0.62)] px-4 text-sm font-medium text-[color:var(--nature-text-soft)] shadow-[0_10px_28px_rgba(var(--nature-shadow-rgb),0.08)] transition hover:-translate-y-0.5 hover:border-[rgba(var(--nature-accent-rgb),0.42)] hover:bg-[rgba(var(--nature-accent-rgb),0.12)] hover:text-[color:var(--nature-accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(var(--nature-accent-rgb),0.42)]"
    >
      <Icon name="tabler:search" className="h-4 w-4" />
      {children}
    </button>
  );
}

function RecommendedSearchTerms({
  terms,
  isLoading,
  onSearch,
}: {
  terms: string[];
  isLoading?: boolean;
  onSearch?: (query: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="w-full rounded-[1.25rem] border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.2)] p-3">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--nature-text-faint)]">
          <Icon name="tabler:sparkles" className="h-4 w-4" />
          正在生成推荐搜索词
        </div>
        <div className="flex flex-wrap gap-2">
          {["suggestion-loading-1", "suggestion-loading-2", "suggestion-loading-3"].map((key) => (
            <span key={key} className="nature-skeleton h-10 w-24 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (terms.length === 0) return null;

  return (
    <div className="w-full rounded-[1.25rem] border border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.2)] p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--nature-text-faint)]">
        <Icon name="tabler:sparkles" className="h-4 w-4" />
        推荐搜索词
      </div>
      <div className="flex flex-wrap gap-2">
        {terms.map((term) => (
          <SearchTermButton key={term} onClick={() => onSearch?.(term)}>
            {term}
          </SearchTermButton>
        ))}
      </div>
    </div>
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
  onRecommendedSearch,
  onSubmit,
  recommendedSearchTerms = [],
  isLoadingRecommendations = false,
  inputRef,
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
    <div className={cn("w-full", className)}>
      <section className="nature-container py-6 sm:py-8 lg:py-10">
        <div className="nature-surface overflow-hidden">
          <div className="grid gap-6 px-5 py-6 sm:px-7 sm:py-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(22rem,0.72fr)] lg:items-end lg:gap-8 lg:px-8">
            <div className="min-w-0">
              <span className="nature-kicker inline-flex gap-2">
                <Icon name="tabler:search" className="h-4 w-4" />
                内容检索
              </span>
              <h1 className="nature-title mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
                搜索文章和闪念
              </h1>
              <p className="mt-4 max-w-[68ch] text-sm leading-7 text-[color:var(--nature-text-soft)] sm:text-base">
                输入关键词、项目名或片段，定位相关记录。
              </p>
              {activeQuery && (
                <p className="mt-4 text-sm text-[color:var(--nature-text-soft)]">
                  当前关键词：
                  <span className="ml-1 font-medium text-[color:var(--nature-text)]">
                    {activeQuery}
                  </span>
                </p>
              )}
            </div>

            <form onSubmit={onSubmit} className="min-w-0">
              <label
                htmlFor="public-search-input"
                className="mb-2 block text-sm font-medium text-[color:var(--nature-text-soft)]"
              >
                搜索关键词
              </label>
              <div className="nature-input-shell min-h-[3.75rem] bg-[rgba(var(--nature-highlight-rgb),0.42)]">
                <Icon
                  name="tabler:search"
                  className="h-5 w-5 shrink-0 text-[color:var(--nature-text-faint)]"
                />
                <input
                  ref={inputRef}
                  id="public-search-input"
                  type="text"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="例如 Arch、React、WebDAV"
                  className="nature-input"
                  autoComplete="off"
                  aria-label="搜索关键词"
                />
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
                    <Icon name="tabler:arrow-right" className="h-4 w-4" />
                    <span className="hidden sm:inline">搜索</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="border-t border-[color:var(--nature-line)] bg-[rgba(var(--nature-highlight-rgb),0.18)] px-5 py-4 sm:px-7 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-[color:var(--nature-text-soft)]">
                {isLoading && activeQuery
                  ? `正在搜索「${activeQuery}」`
                  : hasResults
                    ? `找到 ${results.length} 条内容`
                    : activeQuery
                      ? `还没有找到「${activeQuery}」`
                      : "等待输入关键词"}
              </div>
              <fieldset className="flex flex-wrap items-center gap-2">
                <legend className="sr-only">结果类型筛选</legend>
                {searchFilters.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onFilterChange(item.key)}
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

      <section className="nature-container pb-10 pt-3 sm:pb-14 sm:pt-4">
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
            <RecommendedSearchTerms
              terms={recommendedSearchTerms}
              isLoading={isLoadingRecommendations}
              onSearch={runRecommendedSearch}
            />
          </SearchPromptPanel>
        )}

        {!activeQuery && !isLoading && (
          <SearchPromptPanel
            tone="accent"
            icon="tabler:sparkles"
            eyebrow="开始探索"
            title="从一个关键词进入内容"
            description="搜索会同时覆盖公开文章与 Memos。可以从技术名词、项目名、标签或短句开始。"
            watermark="GO"
          >
            <RecommendedSearchTerms
              terms={
                recommendedSearchTerms.length > 0
                  ? recommendedSearchTerms
                  : ["Arch", "React", "WebDAV"]
              }
              onSearch={runRecommendedSearch}
            />
          </SearchPromptPanel>
        )}

        {isLoading && activeQuery && (
          <div className="space-y-4">
            <SearchPromptPanel
              role="status"
              ariaLabel="搜索结果加载中"
              tone="accent"
              icon="tabler:loader-2"
              eyebrow="正在搜索"
              title={`正在检索「${activeQuery}」`}
              description="正在从文章与 Memos 中提取匹配片段，结果会按相关程度排列。"
              watermark="..."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {["search-loading-1", "search-loading-2"].map((key) => (
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
            >
              <RecommendedSearchTerms
                terms={recommendedSearchTerms}
                isLoading={isLoadingRecommendations}
                onSearch={runRecommendedSearch}
              />
            </SearchPromptPanel>
          )}

        {!isLoading && activeQuery && !errorMessage && !hasResults && (
          <SearchPromptPanel
            tone="neutral"
            icon="tabler:leaf-off"
            eyebrow="没有结果"
            title="没有找到相关内容"
            description="试试更短的词，或者换成文章标题、标签、工具名。搜索更适合用清晰的名词进入内容。"
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
