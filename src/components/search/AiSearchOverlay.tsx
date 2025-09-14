"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import Icon from "../ui/Icon";

type ResultType = "post" | "memo";

export interface AiSearchOverlayProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}

type ApiResult = {
  slug: string;
  title?: string | null;
  excerpt?: string | null;
  type?: ResultType;
  final?: number;
  cosine?: number;
};

const modes = [
  { key: "enhanced", label: "Enhanced" },
  { key: "semantic", label: "Semantic" },
];

export default function AiSearchOverlay({
  open,
  onClose,
  initialQuery = "",
}: AiSearchOverlayProps) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<"enhanced" | "semantic">("enhanced");
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
    const err = (mode === "enhanced" ? enhancedQ.error : semanticQ.error) as any;
    setError(err ? String(err?.message || "搜索失败，请稍后重试") : null);
  }, [mode, enhancedQ.error, semanticQ.error]);

  const filteredResults = useMemo(() => {
    let list = (data || []) as ApiResult[];
    if (filter !== "all") list = list.filter((r) => (r.type || "post") === filter);
    return list;
  }, [data, filter]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // 输入即触发查询，通过 useQuery 的 enabled 控制
  };

  if (!open) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box w-11/12 max-w-4xl p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 border-b border-base-300 bg-base-100">
          <form onSubmit={onSubmit} className="flex items-center gap-2 flex-1">
            <div className="input input-bordered flex items-center gap-2 w-full">
              <Icon name="tabler:search" className="w-5 h-5 opacity-60" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="AI 搜索：输入关键词..."
                className="grow"
                autoComplete="off"
              />
              <div className="hidden md:flex items-center gap-1 text-xs text-base-content/60">
                <kbd className="kbd kbd-xs">Enter</kbd>
                <span>to search</span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-circle"
              aria-label="关闭"
              onClick={handleClose}
            >
              <Icon name="tabler:x" className="w-5 h-5" />
            </button>
          </form>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-100">
          <div className="tabs tabs-bordered">
            <button
              className={`tab ${filter === "all" ? "tab-active" : ""}`}
              onClick={() => setFilter("all")}
              type="button"
            >
              All
            </button>
            <button
              className={`tab ${filter === "post" ? "tab-active" : ""}`}
              onClick={() => setFilter("post")}
              type="button"
            >
              Posts
            </button>
            <button
              className={`tab ${filter === "memo" ? "tab-active" : ""}`}
              onClick={() => setFilter("memo")}
              type="button"
            >
              Memos
            </button>
          </div>

          <div className="join">
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`btn btn-sm join-item ${mode === (m.key as any) ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setMode(m.key as any)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-auto divide-y divide-base-200">
          {error && (
            <div role="alert" className="alert alert-error m-4">
              <Icon name="tabler:alert-triangle" className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="p-4 space-y-4">
              {(["s1", "s2", "s3", "s4", "s5"] as const).map((k) => (
                <div key={k} className="flex items-start gap-4">
                  <div className="skeleton w-10 h-10 rounded"></div>
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-1/3"></div>
                    <div className="skeleton h-3 w-5/6"></div>
                    <div className="skeleton h-3 w-2/3"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : query.trim().length === 0 ? (
            <div className="p-10 text-center text-base-content/60">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="tabler:stars" className="w-5 h-5" />
                <span>键入关键词开始 AI 搜索</span>
              </div>
              <div className="text-sm">
                <kbd className="kbd kbd-xs">⌘</kbd>
                <kbd className="kbd kbd-xs ml-1">K</kbd>
                <span className="ml-2">打开搜索，按</span>
                <kbd className="kbd kbd-xs ml-1">Esc</kbd>
                <span className="ml-2">关闭</span>
              </div>
            </div>
          ) : !isLoading && filteredResults.length === 0 ? (
            <div className="p-10 text-center text-base-content/60">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Icon name="tabler:mood-empty" className="w-5 h-5" />
                <span>没有找到相关结果</span>
              </div>
              <div className="text-sm">试试更通用的关键词或切换模式</div>
            </div>
          ) : (
            <ul className="menu bg-base-100 p-2">
              {filteredResults.map((r) => (
                <li key={r.slug} className="">
                  <Link
                    href={(r.type || "post") === "memo" ? `/memos/${r.slug}` : `/posts/${r.slug}`}
                    className="!py-3"
                  >
                    <div className="flex items-start gap-4">
                      <div className="avatar placeholder">
                        <div className="bg-base-200 text-base-content/70 rounded w-10">
                          <span>{(r.type || "post") === "post" ? "P" : "M"}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate max-w-[75%]">
                            {r.title || r.slug}
                          </span>
                          <span className="badge badge-sm badge-outline capitalize">
                            {r.type || "post"}
                          </span>
                          {typeof r.final === "number" && (
                            <span className="badge badge-xs badge-ghost">
                              {(r.final * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        {r.excerpt && (
                          <p className="text-sm text-base-content/70 line-clamp-2">{r.excerpt}</p>
                        )}
                        <div className="text-xs text-base-content/50">
                          {(r.type || "post") === "memo" ? `/memos/${r.slug}` : `/posts/${r.slug}`}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-base-300 bg-base-100 flex items-center justify-between text-sm">
          <div className="text-base-content/60 flex items-center gap-2">
            <Icon name="tabler:keyboard" className="w-4 h-4" />
            <span>
              使用 <kbd className="kbd kbd-xxs">↑</kbd> <kbd className="kbd kbd-xxs">↓</kbd> 导航，
              <kbd className="kbd kbd-xxs">Enter</kbd> 打开，<kbd className="kbd kbd-xxs">Esc</kbd>{" "}
              关闭
            </span>
          </div>
          {query.trim() && (
            <Link
              href={`/search?q=${encodeURIComponent(query.trim())}`}
              className="link link-hover"
            >
              View all results
            </Link>
          )}
        </div>
      </div>
      <button
        type="button"
        className="modal-backdrop"
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClose();
        }}
        aria-label="Close search"
      />
    </div>
  );
}
