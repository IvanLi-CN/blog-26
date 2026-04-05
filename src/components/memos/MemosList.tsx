"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Memo 列表组件
 *
 * 完全匹配旧项目的简洁设计 - 只显示时间线样式的 memo 列表
 * 不包含搜索、过滤、视图切换等工具栏功能
 */

import { useCallback } from "react";
import { cn } from "../../lib/utils";
import type { TagIconMap } from "../tag-icons/tag-icon-client";
import EmptyState from "../ui/EmptyState";
import { MemoCard, type MemoCardData } from "./MemoCard";

export interface MemosListProps {
  /** Memo 数据 */
  memos: MemoCardData[];
  /** 是否正在加载 */
  loading?: boolean;
  /** 是否有更多数据 */
  hasMore?: boolean;
  /** 加载更多回调 */
  onLoadMore?: () => void;
  /** 编辑回调 */
  onEdit?: (memo: MemoCardData) => void;
  /** 删除回调 */
  onDelete?: (memo: MemoCardData) => void;
  /** 是否显示管理按钮 */
  showManageButtons?: boolean;
  /** 是否显示可见性指示器（公开/私有状态） */
  showVisibilityIndicator?: boolean;
  /** 错误信息 */
  error?: any;
  /** 样式类名 */
  className?: string;
  /** SSR 标签图标映射（tagPath -> iconId） */
  tagIconMap?: TagIconMap;
  /** SSR 标签图标 SVG（iconId -> svg） */
  tagIconSvgMap?: Record<string, string | null>;

  // 保留这些参数以兼容现有调用，但不使用
  onSearch?: (query: string) => void;
  onTagFilter?: (tag: string | null) => void;
  onRefresh?: () => void;
  onNew?: () => void;
  viewMode?: "timeline" | "grid" | "list";
}

export function MemosList({
  memos,
  loading = false,
  hasMore = false,
  onLoadMore,
  onEdit,
  onDelete,
  error,
  showManageButtons = false,
  showVisibilityIndicator = true,
  className,
  tagIconMap,
  tagIconSvgMap,
  // 忽略这些不需要的参数
  onSearch: _onSearch,
  onTagFilter: _onTagFilter,
  onRefresh: _onRefresh,
  onNew: _onNew,
  viewMode: _viewMode,
}: MemosListProps) {
  // 处理加载更多
  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore && onLoadMore) {
      onLoadMore();
    }
  }, [loading, hasMore, onLoadMore]);

  // 渲染加载骨架
  const renderSkeleton = () => (
    <div className="space-y-6 sm:space-y-8">
      {["a", "b", "c"].map((id) => (
        <div key={`skeleton-${id}`} className="flex gap-4 sm:gap-6">
          <div className="hidden h-8 w-8 flex-shrink-0 rounded-full nature-skeleton sm:block sm:h-10 sm:w-10" />
          <div className="flex-1 rounded-[1.8rem] border border-[rgba(var(--nature-border-rgb),0.64)] bg-[rgba(var(--nature-surface-rgb),0.78)] p-4">
            <div className="mb-2 h-4 w-1/4 rounded nature-skeleton"></div>
            <div className="mb-2 h-16 rounded nature-skeleton"></div>
            <div className="flex gap-2">
              <div className="h-6 w-16 rounded nature-skeleton"></div>
              <div className="h-6 w-16 rounded nature-skeleton"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // 渲染空状态
  const renderEmpty = () => (
    <EmptyState
      icon={showManageButtons ? "tabler:notes" : "tabler:inbox"}
      title={showManageButtons ? "还没有 Memo" : "暂无公开 Memo"}
      // 管理员：引导创建；访客：显示中性提示，避免误导
      description={showManageButtons ? "开始记录你的第一个想法吧！" : "这里暂时没有公开的内容"}
      size={showManageButtons ? "lg" : "md"}
      tone={showManageButtons ? "brand" : "neutral"}
      variant={showManageButtons ? "plain" : "card"}
      links={
        showManageButtons
          ? undefined
          : [
              { label: "去看文章", href: "/posts", icon: "tabler:article" },
              { label: "浏览标签", href: "/tags", icon: "tabler:tags" },
              { label: "订阅 RSS", href: "/rss.xml", icon: "tabler:rss" },
            ]
      }
      action={
        showManageButtons && _onNew
          ? {
              label: "发布新Memo",
              onClick: _onNew,
              variant: "default",
            }
          : undefined
      }
    />
  );

  return (
    <div className={cn("memos-list", className)}>
      {/* 直接显示 memo 列表，不需要工具栏 - 匹配旧项目 */}

      {/* 加载状态 */}
      {loading && memos.length === 0 && renderSkeleton()}

      {/* 空状态 */}
      {!loading && !error && memos.length === 0 && renderEmpty()}

      {/* Memo 列表 - 时间线样式 */}
      {memos.length > 0 && (
        <div className="space-y-6 sm:space-y-8">
          {memos.map((memo, index) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              index={index}
              isLast={index === memos.length - 1}
              onEdit={onEdit}
              onDelete={onDelete}
              showEditButton={showManageButtons}
              showDeleteButton={showManageButtons}
              showVisibilityIndicator={showVisibilityIndicator}
              tagIconMap={tagIconMap}
              tagIconSvgMap={tagIconSvgMap}
            />
          ))}
        </div>
      )}

      {/* 加载更多按钮 */}
      {hasMore && (
        <div className="flex justify-center py-8">
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="nature-button nature-button-outline gap-2"
            type="button"
            aria-label="加载更多 Memo"
          >
            {loading ? (
              <>
                <span className="nature-spinner h-4 w-4" />
                加载中...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
                加载更多 Memo
              </>
            )}
          </button>
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="nature-alert nature-alert-error mx-auto my-8 max-w-md">
          <span className="text-lg">!</span>
          <span>加载失败，请稍后重试</span>
        </div>
      )}

      {/* 空状态 - 已在上方处理，避免重复渲染 */}

      {/* 已加载完所有内容提示 */}
      {!hasMore && memos.length > 0 && !loading && (
        <div className="text-center py-8">
          <div className="text-[color:var(--nature-text-soft)]">
            已显示所有 {memos.length} 条 Memo
          </div>
        </div>
      )}
    </div>
  );
}
