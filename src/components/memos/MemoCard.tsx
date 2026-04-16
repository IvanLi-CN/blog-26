"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseContentTags } from "@/lib/tag-parser";
import { detectContentAnomalies } from "../../lib/content-anomalies";
import { formatRelativeTime } from "../../lib/utils";
import PostTags from "../blog/PostTags";
import MarkdownRenderer from "../common/MarkdownRenderer";
import type { TagIconMap } from "../tag-icons/tag-icon-client";
import Icon from "../ui/Icon";
import AnomalyIndicator from "./AnomalyIndicator";

export interface MemoCardProps {
  memo: MemoCardData;
  compact?: boolean;
  showEditButton?: boolean;
  showDeleteButton?: boolean;
  showVisibilityIndicator?: boolean;
  onEdit?: (memo: MemoCardData) => void;
  onDelete?: (memo: MemoCardData) => void | Promise<void>;
  className?: string;
  isLast?: boolean;
  index?: number;
  tagIconMap?: TagIconMap;
  tagIconSvgMap?: Record<string, string | null>;
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
  isVectorized?: boolean;
}

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
  className,
  isLast = true,
  tagIconMap,
  tagIconSvgMap,
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
    if (inlineTags.length === 0) return memo.tags ?? [];
    const merged = new Set<string>(inlineTags);
    (memo.tags ?? []).forEach((tag) => {
      merged.add(tag);
    });
    return Array.from(merged);
  }, [memo.tags, parsedContent.tags]);

  const anomalies = useMemo(() => detectContentAnomalies(memo.content || ""), [memo.content]);
  const displayContent = parsedContent.cleanedContent || memo.excerpt || "";
  const showMobileDetailLink = !memo.title;

  useLayoutEffect(() => {
    if (isExpanded) return;
    if (displayContent.trim().length === 0) {
      setIsCollapsible(false);
      return;
    }

    setIsCollapsible((prev) => (prev === null ? prev : null));
    const container = contentRef.current;
    if (!container) return;

    const checkOverflow = () => {
      const hasOverflow = container.scrollHeight - container.clientHeight > 1;
      setIsCollapsible((prev) => (prev === hasOverflow ? prev : hasOverflow));
    };

    checkOverflow();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(container);
    return () => observer.disconnect();
  }, [displayContent, isExpanded]);

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
  const publishDateTimeAttr =
    publishDate?.toISOString() ?? memo.publishedAt ?? memo.createdAt ?? memo.updatedAt ?? undefined;

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onEdit?.(memo);
    },
    [memo, onEdit]
  );

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteError(null);
    setShowDeleteConfirm(true);
  }, []);

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

  const showAdminView = showVisibilityIndicator;
  const showGradient = !isExpanded && (isCollapsible ?? true);

  return (
    <div
      className={`nature-timeline-item ${className ?? ""}`}
      data-is-last={isLast}
      data-testid="memo-card"
      data-id={memo.id}
      data-source={memo.source}
      data-slug={memo.slug}
    >
      <div className="nature-timeline-rail" aria-hidden="true">
        <div
          className="nature-timeline-node text-[color:var(--nature-accent-strong)]"
          data-testid="timeline-node"
          data-timeline-kind="memo"
        >
          <Icon name="tabler:bulb" className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        {!isLast && <div className="nature-timeline-connector" data-testid="timeline-connector" />}
      </div>

      <div className="nature-timeline-content">
        <div className="nature-panel nature-timeline-card relative flex-1 overflow-hidden px-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(var(--nature-border-rgb),0.62)] bg-[rgba(var(--nature-highlight-rgb),0.18)] px-4 py-3 sm:px-6">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-[color:var(--nature-text-soft)] sm:text-sm">
              <Icon
                name="tabler:clock"
                className="h-4 w-4 flex-shrink-0 text-[color:var(--nature-accent-strong)]"
              />
              <time
                title={fullPublishDate}
                dateTime={publishDateTimeAttr}
                className="truncate"
                suppressHydrationWarning
              >
                {formattedPublishDate}
              </time>
              {showAdminView && hasMeaningfulUpdate && formattedUpdatedDate && (
                <span
                  className="whitespace-nowrap italic text-[color:var(--nature-text-faint)]"
                  title={fullUpdatedDate ?? undefined}
                  suppressHydrationWarning
                >
                  (编辑于 {formattedUpdatedDate})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {showVisibilityIndicator && (
                <span
                  className={`nature-chip ${memo.isPublic ? "nature-chip-info" : "nature-chip-warning"}`}
                  data-testid={memo.isPublic ? "public-indicator" : "private-indicator"}
                >
                  <Icon
                    name={memo.isPublic ? "tabler:world" : "tabler:lock"}
                    className="h-3.5 w-3.5"
                  />
                  <span className="hidden sm:inline">{memo.isPublic ? "公开" : "私有"}</span>
                </span>
              )}

              {showVisibilityIndicator && anomalies.hasInlineDataImages && (
                <AnomalyIndicator anomalies={anomalies} />
              )}

              {memo.isVectorized && (
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(var(--nature-accent-rgb),0.12)] text-[color:var(--nature-accent-strong)]"
                  title="已向量化（当前模型，哈希匹配）"
                  role="img"
                  aria-label="已向量化"
                >
                  <Icon name="tabler:sparkles" className="h-4 w-4" />
                </span>
              )}

              {showEditButton && (
                <button
                  type="button"
                  onClick={handleEditClick}
                  className="nature-icon-button inline-flex"
                  title={`编辑 Memo: ${memo.title || "无标题"}`}
                  aria-label={`编辑 Memo: ${memo.title || "无标题"}`}
                >
                  <Icon name="tabler:edit" className="h-4 w-4" />
                </button>
              )}

              {showDeleteButton && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  className="nature-icon-button inline-flex text-[color:var(--nature-danger)]"
                  title={`删除 Memo: ${memo.title || "无标题"}`}
                  aria-label={`删除 Memo: ${memo.title || "无标题"}`}
                >
                  <Icon name="tabler:trash" className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="px-4 py-4 sm:px-6 sm:py-5">
            {memo.title && (
              <h3 className="mb-3 font-heading text-xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
                <Link
                  href={`/memos/${memo.slug}`}
                  className="transition-colors hover:text-[color:var(--nature-accent-strong)]"
                  title={`查看详情: ${memo.title}`}
                  aria-label={`查看详情: ${memo.title}`}
                >
                  {memo.title}
                </Link>
              </h3>
            )}

            <div className="relative">
              <div
                ref={contentRef}
                className="overflow-hidden transition-all duration-300 ease-in-out"
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
                  className="nature-prose-preview max-w-none [&_h1]:text-base [&_h1]:font-medium [&_h2]:text-sm [&_h2]:font-medium [&_h3]:text-sm [&_h3]:font-medium [&_img]:max-h-32 [&_img]:rounded-2xl [&_img]:object-cover"
                />
              </div>
              {showGradient && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-b from-transparent to-[rgba(var(--nature-surface-rgb),0.98)]" />
              )}
            </div>

            {!isExpanded && isCollapsible && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(true);
                }}
                className="nature-link-inline mt-3 text-sm"
              >
                展开
              </button>
            )}

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col gap-3">
                {derivedTags.length > 0 ? (
                  <PostTags
                    tags={derivedTags}
                    className="flex flex-wrap gap-1.5"
                    iconMap={tagIconMap}
                    iconSvgMap={tagIconSvgMap}
                  />
                ) : null}

                {showMobileDetailLink && (
                  <Link
                    href={`/memos/${memo.slug}`}
                    className="nature-link-inline inline-flex items-center gap-1 self-start text-sm sm:hidden"
                    title="查看详情"
                    aria-label="查看详情"
                  >
                    <span>查看详情</span>
                    <Icon name="tabler:arrow-up-right" className="h-4 w-4" />
                  </Link>
                )}
              </div>

              <Link
                href={`/memos/${memo.slug}`}
                className="hidden h-10 w-10 shrink-0 items-center justify-center self-start rounded-full bg-[rgba(var(--nature-accent-rgb),0.9)] text-white shadow-[0_14px_28px_rgba(var(--nature-accent-rgb),0.28)] transition-transform duration-200 hover:translate-x-0.5 sm:inline-flex sm:self-end"
                title={`查看详情: ${memo.title || "无标题"}`}
                aria-label={`查看详情: ${memo.title || "无标题"}`}
              >
                <Icon name="tabler:arrow-up-right" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div
          className="nature-modal z-50"
          role="dialog"
          aria-modal="true"
          data-testid="memo-delete-dialog"
        >
          <button
            type="button"
            className="nature-modal-backdrop"
            aria-label="关闭删除确认"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div
            className="nature-modal-panel w-full max-w-md"
            data-testid="memo-delete-dialog-panel"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--nature-danger)_14%,transparent)] text-[color:var(--nature-danger)]">
                <Icon name="tabler:alert-triangle" className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--nature-text)]">确认删除</h3>
                <p className="text-sm text-[color:var(--nature-text-soft)]">此操作不可撤销</p>
              </div>
            </div>

            <div className="nature-panel-soft mt-5 px-4 py-4">
              <p className="text-sm text-[color:var(--nature-text-soft)]">
                确定要删除 “{memo.title || "这条 Memo"}” 吗？删除后将无法恢复。
              </p>
            </div>
            {deleteError && (
              <div className="nature-alert nature-alert-error mt-4">
                <Icon name="tabler:alert-triangle" className="h-5 w-5" />
                <span className="text-sm">{deleteError}</span>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="nature-button nature-button-ghost"
                disabled={isDeleting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="nature-button nature-button-danger"
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <span className="nature-spinner h-4 w-4" />
                ) : (
                  <Icon name="tabler:trash" className="h-4 w-4" />
                )}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
