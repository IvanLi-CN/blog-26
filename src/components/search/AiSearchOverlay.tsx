"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchResultsList, { type SearchResultItem } from "@/components/search/SearchResultsList";
import { trpc } from "@/lib/trpc";
import Icon from "../ui/Icon";

type ResultType = "post" | "memo";

export interface AiSearchOverlayProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}

type ApiResult = SearchResultItem & { final?: number };

const modes = [
  { key: "enhanced", label: "Enhanced" },
  { key: "semantic", label: "Semantic" },
] as const;
type Mode = (typeof modes)[number]["key"];

export default function AiSearchOverlay({
  open,
  onClose,
  initialQuery = "",
}: AiSearchOverlayProps) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<Mode>("enhanced");
  const [filter, setFilter] = useState<"all" | ResultType>("all");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canSearch = query.trim().length > 0;

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => {
        clearTimeout(t);
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  // 后端搜索（增强/语义）
  const enhancedQ = trpc.search.ai.enhanced.useQuery(
    { q: query.trim(), topK: 20 },
    { enabled: canSearch && mode === "enhanced", staleTime: 30_000 }
  );
  const semanticQ = trpc.search.ai.semantic.useQuery(
    { q: query.trim(), topK: 20 },
    { enabled: canSearch && mode === "semantic", staleTime: 30_000 }
  );
  const isLoading =
    mode === "enhanced"
      ? enhancedQ.isLoading || enhancedQ.isFetching
      : semanticQ.isLoading || semanticQ.isFetching;
  const data = (mode === "enhanced" ? enhancedQ.data : semanticQ.data) as ApiResult[] | undefined;
  useEffect(() => {
    const err = mode === "enhanced" ? enhancedQ.error : semanticQ.error;
    setError(
      err ? (err instanceof Error && err.message ? err.message : "搜索失败，请稍后重试") : null
    );
  }, [mode, enhancedQ.error, semanticQ.error]);

  const filteredResults = useMemo(() => {
    let list: ApiResult[] = data || [];
    if (filter !== "all") list = list.filter((r) => (r.type || "post") === filter);
    return list;
  }, [data, filter]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 输入即触发查询，通过 useQuery 的 enabled 控制
  };

  if (!open) return null;

  return (
    <div className="nature-modal">
      <button
        type="button"
        className="nature-modal-backdrop"
        onClick={handleClose}
        aria-label="Close search"
      />
      <div className="nature-modal-panel w-[min(100%,64rem)] overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-[color:var(--nature-line)] px-4 py-4">
          <form onSubmit={onSubmit} className="flex items-center gap-2 flex-1">
            <div className="nature-input-shell w-full">
              <Icon
                name="tabler:search"
                className="w-5 h-5 text-[color:var(--nature-text-faint)]"
              />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="AI 搜索：输入关键词..."
                className="nature-input"
                autoComplete="off"
              />
              <div className="hidden items-center gap-1 text-xs text-[color:var(--nature-text-soft)] md:flex">
                <kbd className="nature-kbd">Enter</kbd>
                <span>to search</span>
              </div>
            </div>
            <button
              type="button"
              className="nature-icon-button"
              aria-label="关闭"
              onClick={handleClose}
            >
              <Icon name="tabler:x" className="w-5 h-5" />
            </button>
          </form>
        </div>

        <div className="flex items-center justify-between border-b border-[color:var(--nature-line)] px-4 py-3">
          <div className="nature-tabs">
            <button
              className={`nature-tab ${filter === "all" ? "is-active" : ""}`}
              onClick={() => setFilter("all")}
              type="button"
            >
              All
            </button>
            <button
              className={`nature-tab ${filter === "post" ? "is-active" : ""}`}
              onClick={() => setFilter("post")}
              type="button"
            >
              Posts
            </button>
            <button
              className={`nature-tab ${filter === "memo" ? "is-active" : ""}`}
              onClick={() => setFilter("memo")}
              type="button"
            >
              Memos
            </button>
          </div>

          <div className="nature-tabs">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`nature-tab ${mode === m.key ? "is-active" : ""}`}
                onClick={() => setMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto px-4 py-4">
          {error && (
            <div role="alert" className="nature-alert nature-alert-error mb-4">
              <Icon name="tabler:alert-triangle" className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4">
              {(["s1", "s2", "s3", "s4", "s5"] as const).map((k) => (
                <div key={k} className="flex items-start gap-4">
                  <div className="nature-skeleton h-10 w-10 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="nature-skeleton h-4 w-1/3 rounded-full"></div>
                    <div className="nature-skeleton h-3 w-5/6 rounded-full"></div>
                    <div className="nature-skeleton h-3 w-2/3 rounded-full"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : query.trim().length === 0 ? (
            <div className="nature-empty">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="tabler:stars" className="w-5 h-5" />
                <span>键入关键词开始 AI 搜索</span>
              </div>
              <div className="text-sm">
                <kbd className="nature-kbd">⌘</kbd>
                <kbd className="nature-kbd ml-1">K</kbd>
                <span className="ml-2">打开搜索，按</span>
                <kbd className="nature-kbd ml-1">Esc</kbd>
                <span className="ml-2">关闭</span>
              </div>
            </div>
          ) : !isLoading && filteredResults.length === 0 ? (
            <div className="nature-empty">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="tabler:mood-empty" className="w-5 h-5" />
                <span>没有找到相关结果</span>
              </div>
              <div className="text-sm">试试更通用的关键词或切换模式</div>
            </div>
          ) : (
            <SearchResultsList
              results={filteredResults as SearchResultItem[]}
              containerClassName="p-2"
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[color:var(--nature-line)] px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-[color:var(--nature-text-soft)]">
            <Icon name="tabler:keyboard" className="w-4 h-4" />
            <span>
              使用 <kbd className="nature-kbd">↑</kbd> <kbd className="nature-kbd">↓</kbd> 导航，
              <kbd className="nature-kbd">Enter</kbd> 打开，<kbd className="nature-kbd">Esc</kbd>{" "}
              关闭
            </span>
          </div>
          {query.trim() && (
            <Link
              href={`/search?q=${encodeURIComponent(query.trim())}`}
              className="nature-link-inline"
            >
              View all results
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
