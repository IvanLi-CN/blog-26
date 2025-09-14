"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../ui/Icon";

type ResultType = "post" | "memo";

export interface AiSearchOverlayProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}

type MockResult = {
  slug: string;
  title: string;
  excerpt: string;
  type: ResultType;
  score?: number;
};

const MOCK_RESULTS: MockResult[] = [
  {
    slug: "ai-search-design",
    title: "Designing an AI-Powered Search Overlay",
    excerpt:
      "Outline a clean command-palette style overlay using DaisyUI with tabs, skeleton loading, and keyboard hints.",
    type: "post",
    score: 0.92,
  },
  {
    slug: "semantic-search-nextjs",
    title: "Semantic Search in Next.js with Embeddings",
    excerpt:
      "Compute embeddings, filter by published status, and rank by cosine similarity for relevant content retrieval.",
    type: "post",
    score: 0.88,
  },
  {
    slug: "note-ai-search-roadmap",
    title: "Memo: AI Search Roadmap",
    excerpt: "Track tasks: UI polish, reranking, and quick preview with keyboard navigation.",
    type: "memo",
    score: 0.81,
  },
  {
    slug: "reranking-options",
    title: "Reranking Options and Trade-offs",
    excerpt:
      "Compare base cosine ranking vs. reranker scores, and consider latency vs. quality for various models.",
    type: "post",
    score: 0.79,
  },
];

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const doMockSearch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      // Simulate latency
      await new Promise((r) => setTimeout(r, 450));
    } catch (_e) {
      setError("Failed to search. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const filteredResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = MOCK_RESULTS;
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.excerpt.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q)
      );
    }
    if (filter !== "all") list = list.filter((r) => r.type === filter);
    return list;
  }, [query, filter]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!query.trim()) return;
    void doMockSearch();
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

          {loading ? (
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
          ) : filteredResults.length === 0 ? (
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
                  <Link href={`/${r.slug}`} className="!py-3">
                    <div className="flex items-start gap-4">
                      <div className="avatar placeholder">
                        <div className="bg-base-200 text-base-content/70 rounded w-10">
                          <span>{r.type === "post" ? "P" : "M"}</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate max-w-[75%]">{r.title}</span>
                          <span className="badge badge-sm badge-outline capitalize">{r.type}</span>
                          {typeof r.score === "number" && (
                            <span className="badge badge-xs badge-ghost">
                              {(r.score * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-base-content/70 line-clamp-2">{r.excerpt}</p>
                        <div className="text-xs text-base-content/50">/{r.slug}</div>
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
