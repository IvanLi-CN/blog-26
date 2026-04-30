"use client";

import type { FormEvent, RefObject } from "react";
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
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
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

export default function PublicSearchPage({
  query,
  searchedQuery,
  results,
  isLoading = false,
  error,
  filter,
  onFilterChange,
  onQueryChange,
  onSubmit,
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
                搜索旧文章和闪念
              </h1>
              <p className="mt-4 max-w-[68ch] text-sm leading-7 text-[color:var(--nature-text-soft)] sm:text-base">
                输入一个技术词、项目名或片段，快速回到相关记录。
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

      <section className="nature-container pb-10 sm:pb-14">
        {errorMessage && (
          <div role="alert" className="nature-alert nature-alert-error mb-5">
            <Icon name="tabler:alert-triangle" className="h-5 w-5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {!activeQuery && !isLoading && (
          <div className="nature-empty">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(var(--nature-accent-rgb),0.12)] text-[color:var(--nature-accent-strong)]">
              <Icon name="tabler:sparkles" className="h-6 w-6" />
            </div>
            <h2 className="font-heading text-xl font-semibold text-[color:var(--nature-text)]">
              从一个关键词开始
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-[color:var(--nature-text-soft)]">
              搜索会同时覆盖公开文章与 Memos。更短的关键词适合探索，更具体的短语适合找回旧记录。
            </p>
          </div>
        )}

        {isLoading && activeQuery && (
          <div className="space-y-4" role="status" aria-label="搜索结果加载中">
            {["search-loading-1", "search-loading-2", "search-loading-3", "search-loading-4"].map(
              (key) => (
                <div key={key} className="nature-panel-soft px-5 py-5">
                  <div className="flex items-start gap-4">
                    <div className="nature-skeleton h-11 w-11 shrink-0 rounded-[1rem]" />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="nature-skeleton h-4 w-2/5 rounded-full" />
                      <div className="nature-skeleton h-3 w-full rounded-full" />
                      <div className="nature-skeleton h-3 w-3/4 rounded-full" />
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {!isLoading &&
          activeQuery &&
          !errorMessage &&
          hasResults &&
          filteredResults.length === 0 && (
            <div className="nature-empty">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(var(--nature-accent-2-rgb),0.16)] text-[color:var(--nature-accent-strong)]">
                <Icon name="tabler:filter-search" className="h-6 w-6" />
              </div>
              <h2 className="font-heading text-xl font-semibold text-[color:var(--nature-text)]">
                这个类型里没有结果
              </h2>
              <p className="mt-2 text-sm text-[color:var(--nature-text-soft)]">
                切回“全部”可以查看其它内容类型。
              </p>
            </div>
          )}

        {!isLoading && activeQuery && !errorMessage && !hasResults && (
          <div className="nature-empty">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[rgba(var(--nature-highlight-rgb),0.32)] text-[color:var(--nature-text-soft)]">
              <Icon name="tabler:leaf-off" className="h-6 w-6" />
            </div>
            <h2 className="font-heading text-xl font-semibold text-[color:var(--nature-text)]">
              没有找到相关内容
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-[color:var(--nature-text-soft)]">
              试试更短的词，或者换成文章标题、标签、工具名。
            </p>
          </div>
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
