"use client";

/**
 * Memo 列表组件
 *
 * 完全匹配旧项目的简洁设计 - 只显示时间线样式的 memo 列表
 * 不包含搜索、过滤、视图切换等工具栏功能
 */

import { useCallback } from "react";
import { cn } from "../../lib/utils";
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
  /** Memo 点击回调 */
  onMemoClick?: (memo: MemoCardData) => void;
  /** 是否显示管理按钮 */
  showManageButtons?: boolean;
  /** 错误信息 */
  error?: any;
  /** 样式类名 */
  className?: string;

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
  onMemoClick,
  showManageButtons = false,
  className,
  // 忽略这些不需要的参数
  onSearch,
  onTagFilter,
  onRefresh,
  onNew,
  viewMode,
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
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={`skeleton-${index}`} className="flex gap-4 sm:gap-6">
          {/* 时间线圆点骨架 */}
          <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-base-300 rounded-full animate-pulse hidden sm:block" />
          {/* 卡片骨架 */}
          <div className="flex-1 bg-base-200 rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-base-300 rounded w-1/4 mb-2"></div>
            <div className="h-16 bg-base-300 rounded mb-2"></div>
            <div className="flex gap-2">
              <div className="h-6 bg-base-300 rounded w-16"></div>
              <div className="h-6 bg-base-300 rounded w-16"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // 渲染空状态
  const renderEmpty = () => (
    <div className="text-center py-12">
      <div className="text-base-content/60 mb-4">
        还没有任何 memo
      </div>
    </div>
  );

  return (
    <div className={cn("memos-list", className)}>
      {/* 直接显示 memo 列表，不需要工具栏 - 匹配旧项目 */}

      {/* 加载状态 */}
      {loading && memos.length === 0 && renderSkeleton()}

      {/* 空状态 */}
      {!loading && memos.length === 0 && renderEmpty()}

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
              onClick={onMemoClick}
              showEditButton={showManageButtons}
              showDeleteButton={showManageButtons}
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
            className="btn btn-outline btn-primary gap-2"
            type="button"
            aria-label="加载更多 Memo"
          >
            {loading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
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
        <div className="alert alert-error max-w-md mx-auto my-8">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>加载失败，请稍后重试</span>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && memos.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📝</div>
          <h3 className="text-xl font-semibold text-base-content mb-2">
            还没有 Memo
          </h3>
          <p className="text-base-content/60">
            开始记录你的第一个想法吧！
          </p>
        </div>
      )}

      {/* 已加载完所有内容提示 */}
      {!hasMore && memos.length > 0 && !loading && (
        <div className="text-center py-8">
          <div className="text-base-content/60">
            已显示所有 {memos.length} 条 Memo
          </div>
        </div>
      )}
    </div>
  );
}