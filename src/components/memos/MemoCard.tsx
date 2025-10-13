"use client";

/**
 * Memo 卡片组件
 *
 * 完全匹配旧项目 (Astro) 的时间线样式 memo 卡片
 *
 * 主要特点：
 * - 时间线圆点：渐变色圆形，带编辑笔图标和阴影环形
 * - 时间线连接线：渐变透明效果，正确定位
 * - DaisyUI 卡片样式：悬停阴影效果
 * - 头部信息栏：时间显示、公开/私有状态、管理员操作按钮
 * - 内容区域：Markdown 渲染、标签显示
 * - 响应式设计：手机端隐藏时间线，调整间距和字体大小
 * - 复杂的点击交互逻辑：避免与文本选择冲突
 */

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseContentTags } from "@/lib/tag-parser";
import { detectContentAnomalies } from "../../lib/content-anomalies";
import { formatRelativeTime } from "../../lib/utils";
import PostTags from "../blog/PostTags";
import MarkdownRenderer from "../common/MarkdownRenderer";
import AnomalyIndicator from "./AnomalyIndicator";

export interface MemoCardProps {
  /** Memo 数据 */
  memo: MemoCardData;
  /** 是否为紧凑模式 */
  compact?: boolean;
  /** 是否显示编辑按钮 */
  showEditButton?: boolean;
  /** 是否显示删除按钮 */
  showDeleteButton?: boolean;
  /** 是否显示可见性指示器（公开/私有状态） */
  showVisibilityIndicator?: boolean;
  /** 编辑回调 */
  onEdit?: (memo: MemoCardData) => void;
  /** 删除回调 */
  onDelete?: (memo: MemoCardData) => void | Promise<void>;
  /** 样式类名 */
  className?: string;
  /** 是否为最后一个（用于时间线连接线） */
  isLast?: boolean;
  /** 索引（用于时间线样式） */
  index?: number;
}

export interface MemoCardData {
  id: string;
  slug: string;
  title?: string;
  content: string;
  excerpt?: string;
  isPublic: boolean;
  tags: string[];
  author?: string;
  filePath?: string;
  source: string;
  createdAt: string;
  publishedAt?: string;
  updatedAt: string;
  timeDisplaySource?: "publishDate" | "updateDate" | "lastModified" | "unknown";
  attachments?: Array<{
    filename: string;
    path: string;
    isImage: boolean;
  }>;
  /** 是否已完成向量化（当前模型且哈希匹配） */
  isVectorized?: boolean;
}

// 不在界面上解释时间来源，因此无需 fallback 标签

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatFull(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

export function MemoCard({
  memo,
  showEditButton = false,
  showDeleteButton = false,
  showVisibilityIndicator = true,
  onEdit,
  onDelete,
  className: _className,
  isLast = false,
  index: _index = 0,
}: MemoCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsible, setIsCollapsible] = useState<boolean | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const COLLAPSED_MAX_HEIGHT = "50lh";

  const parsedContent = useMemo(() => parseContentTags(memo.content || ""), [memo.content]);

  const derivedTags = useMemo(() => {
    const inlineTags = parsedContent.tags.map((tag) => tag.name);
    if (inlineTags.length === 0) {
      return memo.tags ?? [];
    }
    const merged = new Set<string>(inlineTags);
    (memo.tags ?? []).forEach((tag) => {
      merged.add(tag);
    });
    return Array.from(merged);
  }, [memo.tags, parsedContent.tags]);

  // 管理员异常数据检测（依赖于上层通过 showVisibilityIndicator 标识管理员场景）
  const anomalies = useMemo(() => detectContentAnomalies(memo.content || ""), [memo.content]);

  // 显示内容（按固定 CSS 高度控制折叠）
  const displayContent = parsedContent.cleanedContent || memo.excerpt || "";

  useLayoutEffect(() => {
    if (isExpanded) {
      return;
    }

    if (displayContent.trim().length === 0) {
      setIsCollapsible(false);
      return;
    }

    setIsCollapsible((prev) => (prev === null ? prev : null));

    const container = contentRef.current;
    if (!container) {
      return;
    }

    const checkOverflow = () => {
      const { scrollHeight, clientHeight } = container;
      const hasOverflow = scrollHeight - clientHeight > 1;
      setIsCollapsible((prev) => (prev === hasOverflow ? prev : hasOverflow));
    };

    checkOverflow();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      checkOverflow();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [displayContent, isExpanded]);

  const shouldShowGradient = !isExpanded && (isCollapsible ?? true);

  const publishDate = useMemo(
    () => parseDate(memo.publishedAt ?? memo.createdAt ?? memo.updatedAt),
    [memo.publishedAt, memo.createdAt, memo.updatedAt]
  );
  const updatedDate = useMemo(() => parseDate(memo.updatedAt), [memo.updatedAt]);

  const formattedPublishDate = useMemo(
    () => formatRelativeTime(publishDate ?? undefined) ?? "未知时间",
    [publishDate]
  );
  const fullPublishDate = useMemo(
    () => formatFull(publishDate) ?? memo.publishedAt ?? memo.createdAt ?? "未知时间",
    [publishDate, memo.publishedAt, memo.createdAt]
  );
  const fullUpdatedDate = useMemo(() => formatFull(updatedDate), [updatedDate]);
  const formattedUpdatedDate = useMemo(
    () => formatRelativeTime(updatedDate ?? undefined),
    [updatedDate]
  );

  const hasMeaningfulUpdate = useMemo(() => {
    if (!updatedDate) return false;
    if (!publishDate) return true;
    return Math.abs(updatedDate.getTime() - publishDate.getTime()) > 1000;
  }, [publishDate, updatedDate]);

  // 不显示任何“自动选择”等解释性标签
  const fallbackLabel = "";

  const publishDateTimeAttr =
    publishDate?.toISOString() ?? memo.publishedAt ?? memo.createdAt ?? memo.updatedAt ?? undefined;
  const isAdminView = showVisibilityIndicator;
  // 处理编辑
  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onEdit?.(memo);
    },
    [memo, onEdit]
  );

  // 触发删除确认弹窗
  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setShowDeleteConfirm(true);
  }, []);

  // 确认删除
  const handleConfirmDelete = useCallback(async () => {
    if (!onDelete) {
      setShowDeleteConfirm(false);
      return;
    }
    setDeleteError(null);
    try {
      setIsDeleting(true);
      await onDelete(memo);
      setShowDeleteConfirm(false);
    } catch (err) {
      const raw = (err as Error)?.message || (typeof err === "string" ? err : "未知错误");
      const msg =
        String(raw)
          .replace(/^(TRPCClientError:|Error:)/i, "")
          .trim() || "未知错误";
      setDeleteError(`删除失败：${msg}`);
    } finally {
      setIsDeleting(false);
    }
  }, [onDelete, memo]);

  return (
    <div
      className="relative"
      data-testid="memo-card"
      data-id={memo.id}
      data-source={memo.source}
      data-slug={memo.slug}
    >
      {/* 时间线连接线 - 完全匹配旧项目 */}
      {!isLast && (
        <div className="absolute left-4 sm:left-5 top-10 sm:top-12 w-0.5 h-full bg-gradient-to-b from-primary/30 to-transparent -z-10 hidden sm:block"></div>
      )}

      {/* Memo 卡片 - 完全匹配旧项目的布局 */}
      <div className="flex items-start space-x-0 sm:space-x-5">
        {/* 时间线圆点 - 完全匹配旧项目 */}
        <div
          className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-primary to-primary/80 rounded-full items-center justify-center shadow-lg ring-2 sm:ring-4 ring-base-100 hidden sm:flex"
          aria-label={`Memo 时间 ${formattedPublishDate}`}
          role="img"
        >
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </div>

        {/* Memo 内容 - 完全匹配旧项目 */}
        <div
          className="flex-1 card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-200 overflow-hidden relative"
          data-testid="memo-card"
        >
          {/* 卡片内容 */}
          <div>
            {/* 头部信息 - 完全匹配旧项目 */}
            <div className="flex items-center justify-between px-4 py-2 sm:px-6 sm:py-3 bg-base-200 border-b border-base-300 gap-2 sm:gap-4">
              {/* 左侧：时间信息 */}
              <div className="flex items-center gap-2 text-xs sm:text-sm text-base-content/70 min-w-0 flex-shrink flex-wrap">
                <svg
                  className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <time
                  title={fullPublishDate}
                  dateTime={publishDateTimeAttr}
                  className="cursor-help truncate"
                  data-testid="memo-time"
                >
                  {formattedPublishDate}
                </time>
                {isAdminView && hasMeaningfulUpdate && formattedUpdatedDate && (
                  <span
                    className="whitespace-nowrap text-xs text-base-content/50 italic"
                    title={fullUpdatedDate ?? undefined}
                  >
                    (编辑于 {formattedUpdatedDate})
                  </span>
                )}
                {fallbackLabel && (
                  <span className="text-warning/80 flex-shrink-0">{fallbackLabel}</span>
                )}
              </div>

              {/* 右侧：状态和操作按钮 */}
              <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
                {/* 公开/私有状态指示器 - 只有管理员可见 */}
                {showVisibilityIndicator && (
                  <div className="flex items-center">
                    {memo.isPublic ? (
                      <div
                        className="badge badge-outline badge-xs sm:badge-sm h-6 sm:h-7 gap-1 text-info border-info/40 bg-info/5"
                        data-testid="public-indicator"
                      >
                        <svg
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="hidden sm:inline">公开</span>
                      </div>
                    ) : (
                      <div
                        className="badge badge-outline badge-xs sm:badge-sm h-6 sm:h-7 gap-1 text-warning border-warning/40 bg-warning/5"
                        data-testid="private-indicator"
                      >
                        <svg
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                          />
                        </svg>
                        <span className="hidden sm:inline">私有</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 管理员异常数据提示（例如包含 base64 内嵌图片） */}
                {showVisibilityIndicator && anomalies.hasInlineDataImages && (
                  <AnomalyIndicator anomalies={anomalies} />
                )}

                {/* 向量化标记：与管理员操作按钮同列展示，避免重叠 */}
                {memo.isVectorized && (
                  <span
                    className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-full bg-secondary/10 text-secondary/80 drop-shadow-sm flex-shrink-0"
                    title="已向量化（当前模型，哈希匹配）"
                    role="img"
                    aria-label="已向量化"
                  >
                    <Icon
                      icon="tabler:sparkles"
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                      aria-hidden="true"
                    />
                  </span>
                )}

                {/* 管理员操作按钮组 */}
                {(showEditButton || showDeleteButton) && (
                  <div className="flex items-center space-x-0.5 sm:space-x-1">
                    {/* 编辑按钮 */}
                    {showEditButton && (
                      <button
                        type="button"
                        onClick={handleEditClick}
                        className="btn btn-ghost btn-xs btn-circle text-info hover:bg-info/10 hover:text-info h-6 w-6 sm:h-7 sm:w-7"
                        title={`编辑 Memo: ${memo.title || "无标题"}`}
                        aria-label={`编辑 Memo: ${memo.title || "无标题"}`}
                      >
                        <svg
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                    )}

                    {/* 删除按钮 */}
                    {showDeleteButton && (
                      <button
                        type="button"
                        onClick={handleDeleteClick}
                        className="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/10 hover:text-error h-6 w-6 sm:h-7 sm:w-7"
                        title={`删除 Memo: ${memo.title || "无标题"}`}
                        aria-label={`删除 Memo: ${memo.title || "无标题"}`}
                      >
                        <svg
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Memo 内容 - 完全匹配旧项目 */}
            <div className="card-body px-4 py-3 sm:px-6 sm:py-4">
              {/* 内容容器：仅按 CSS 高度折叠；展开后不再折叠 */}
              <div className="relative">
                <div
                  ref={contentRef}
                  className={"transition-all duration-300 ease-in-out overflow-hidden"}
                  style={{ maxHeight: isExpanded ? undefined : COLLAPSED_MAX_HEIGHT }}
                >
                  <MarkdownRenderer
                    content={displayContent}
                    variant="preview"
                    enableMath={true}
                    enableMermaid={true}
                    enableCodeFolding={true}
                    enableImageLightbox={true}
                    maxCodeLines={15}
                    previewCodeLines={10}
                    articlePath={memo.filePath || memo.id}
                    contentSource={memo.source === "local" ? "local" : "webdav"}
                    removeTags={false}
                    className="prose prose-sm max-w-none [&_h1]:text-base [&_h1]:font-medium [&_h2]:text-sm [&_h2]:font-medium [&_h3]:text-sm [&_h3]:font-medium [&_img]:max-h-32 [&_img]:object-cover [&_img]:rounded"
                  />
                </div>
                {/* 渐变遮罩：折叠时显示（纯 CSS 高度判断）*/}
                {shouldShowGradient && (
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-base-100" />
                )}
              </div>

              {/* 展开按钮：一次性展开，不再收起 */}
              {!isExpanded && isCollapsible && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(true);
                  }}
                  className="text-xs text-primary hover:text-primary/80 mt-2"
                >
                  展开
                </button>
              )}

              {/* 标签显示：统一使用 PostTags（与 posts 表一致） */}
              {derivedTags.length > 0 && (
                <PostTags tags={derivedTags} className="flex flex-wrap gap-1 mt-2 sm:mt-3" />
              )}
            </div>
          </div>

          {/* 详情链接图标 - 右下角浮动 */}
          <Link
            href={`/memos/${memo.slug}`}
            className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 w-8 h-8 sm:w-9 sm:h-9 bg-primary/80 hover:bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 group"
            title={`查看详情: ${memo.title || "无标题"}`}
            aria-label={`查看详情: ${memo.title || "无标题"}`}
          >
            <svg
              className="w-4 h-4 sm:w-5 sm:h-5 transform group-hover:translate-x-0.5 transition-transform duration-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
      {showDeleteConfirm && (
        <div className="modal modal-open z-50" role="dialog" aria-modal="true">
          <div className="modal-box w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-error/10">
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6 text-error"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-lg text-base-content">确认删除</h3>
                <p className="text-sm text-base-content/60">此操作不可撤销</p>
              </div>
            </div>

            <div className="bg-base-100 p-4 rounded-lg border border-base-200 mb-3">
              <p className="text-sm text-base-content/80">
                确定要删除 &ldquo;{memo.title || "这条 Memo"}&rdquo; 吗？删除后将无法恢复。
              </p>
            </div>
            {deleteError && (
              <div className="alert alert-error shadow-sm mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="stroke-current shrink-0 h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm">{deleteError}</span>
              </div>
            )}

            <div className="modal-action">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn btn-error gap-2"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    删除中...
                  </>
                ) : (
                  <>
                    <svg
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    确认删除
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-ghost gap-2"
                disabled={isDeleting}
              >
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
