"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { resolveImagePath } from "@/lib/image-utils";
import { parseContentTags } from "@/lib/tag-parser";
import { SITE } from "../../config/site";
import { useAuth } from "../../hooks/useAuth";
import { detectContentAnomalies } from "../../lib/content-anomalies";
import { trpc } from "../../lib/trpc";
import { cn, formatRelativeTime } from "../../lib/utils";
import type { AppRouter } from "../../server/router";
import PostTags from "../blog/PostTags";
import MarkdownRenderer from "../common/MarkdownRenderer";
import type { TagIconMap } from "../tag-icons/tag-icon-client";
import Icon from "../ui/Icon";
import AnomalyIndicator from "./AnomalyIndicator";
import { type MemoData, MemoEditor } from "./MemoEditor";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type MemoDetailOutput = RouterOutputs["memos"]["bySlug"];

export interface MemoDetailPageProps {
  slug: string;
  initialData?: MemoDetailOutput;
  tagIconMap?: TagIconMap;
  tagIconSvgMap?: Record<string, string | null>;
  showEditFeatures?: boolean;
  className?: string;
}

export function MemoDetailPage({
  slug,
  initialData,
  tagIconMap,
  tagIconSvgMap,
  showEditFeatures = false,
  className,
}: MemoDetailPageProps) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    data: memo,
    isLoading,
    isError,
    refetch,
  } = trpc.memos.bySlug.useQuery(
    { slug },
    {
      initialData,
      refetchOnMount: false,
    }
  );

  const updateMemo = trpc.memos.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      refetch();
    },
    onError: (error) => {
      console.error("更新失败:", error);
    },
  });

  const deleteMemo = trpc.memos.delete.useMutation({
    onSuccess: () => {
      router.push("/memos");
    },
    onError: (error) => {
      console.error("删除失败:", error);
    },
  });

  const formatTime = useCallback((dateString: string) => {
    if (!dateString) return "未知时间";
    const result = formatRelativeTime(dateString);
    return result ?? "未知时间";
  }, []);

  const handleSave = useCallback(
    async (data: MemoData) => {
      if (!memo) return;

      await updateMemo.mutateAsync({
        id: memo.id,
        content: data.content,
        title: data.title,
        isPublic: data.isPublic,
        tags: data.tags,
        attachments: [],
      });
    },
    [memo, updateMemo]
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!memo) return;
    await deleteMemo.mutateAsync({ id: memo.id });
  }, [memo, deleteMemo]);

  const handleShare = useCallback(async () => {
    if (!memo) return;
    try {
      const url = `${window.location.origin}/memos/${memo.slug}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("复制链接失败:", error);
    }
  }, [memo]);

  const parsedContent = useMemo(() => parseContentTags(memo?.content ?? ""), [memo?.content]);
  const derivedTags = useMemo(() => {
    const inlineTags = parsedContent.tags.map((tag) => tag.name);
    if (inlineTags.length === 0) {
      return memo?.tags ?? [];
    }
    const merged = new Set<string>(inlineTags);
    (memo?.tags ?? []).forEach((tag) => {
      merged.add(tag);
    });
    return Array.from(merged);
  }, [memo?.tags, parsedContent.tags]);

  const displayContent = useMemo(
    () => parsedContent.cleanedContent || memo?.content || "",
    [memo?.content, parsedContent.cleanedContent]
  );

  const publishDateIso = memo?.publishedAt ?? memo?.createdAt ?? memo?.updatedAt ?? null;
  const updatedAtIso = memo?.updatedAt ?? null;
  const publishRelative = useMemo(
    () => (publishDateIso ? formatTime(publishDateIso) : "未知时间"),
    [formatTime, publishDateIso]
  );
  const publishFull = useMemo(() => {
    if (!publishDateIso) return "未知时间";
    try {
      return new Date(publishDateIso).toLocaleString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return publishDateIso;
    }
  }, [publishDateIso]);
  const updateRelative = useMemo(
    () => (updatedAtIso ? formatTime(updatedAtIso) : null),
    [formatTime, updatedAtIso]
  );
  const updateFull = useMemo(() => {
    if (!updatedAtIso) return null;
    try {
      return new Date(updatedAtIso).toLocaleString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return updatedAtIso;
    }
  }, [updatedAtIso]);

  const shouldShowUpdateHint = useMemo(() => {
    if (!updatedAtIso) return false;
    if (!publishDateIso) return true;
    const publishMs = Date.parse(publishDateIso);
    const updateMs = Date.parse(updatedAtIso);
    if (Number.isNaN(publishMs) || Number.isNaN(updateMs)) {
      return publishDateIso !== updatedAtIso;
    }
    return Math.abs(updateMs - publishMs) > 1000;
  }, [publishDateIso, updatedAtIso]);

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="nature-skeleton h-10 w-1/3 rounded-full" />
        <div className="nature-skeleton h-4 w-1/4 rounded-full" />
        <div className="space-y-3">
          <div className="nature-skeleton h-4 w-full rounded-full" />
          <div className="nature-skeleton h-4 w-5/6 rounded-full" />
          <div className="nature-skeleton h-4 w-3/5 rounded-full" />
        </div>
      </div>
    );
  }

  if (isError || !memo) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="nature-alert nature-alert-error max-w-md">
          <Icon name="tabler:alert-triangle" className="h-5 w-5" />
          <span>加载失败，请稍后重试</span>
        </div>
        <button
          type="button"
          onClick={() => router.back()}
          className="nature-button nature-button-outline"
        >
          返回
        </button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className={cn("nature-panel px-5 py-5 sm:px-6", className)}>
        <MemoEditor
          initialContent={memo.content}
          initialTitle={memo.title}
          initialIsPublic={memo.isPublic}
          initialTags={derivedTags}
          isEditing={true}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
          showAdvancedOptions
        />
      </div>
    );
  }

  const anomalies = detectContentAnomalies(memo.content || "");

  return (
    <article className={cn("space-y-8", className)}>
      <section className="nature-surface px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="nature-button nature-button-ghost"
          >
            <Icon name="tabler:arrow-left" className="h-4 w-4" />
            返回
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="nature-button nature-button-outline"
            >
              <Icon name={copied ? "tabler:check" : "tabler:copy"} className="h-4 w-4" />
              {copied ? "已复制" : "复制链接"}
            </button>
            {showEditFeatures && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="nature-button nature-button-outline"
                >
                  <Icon name="tabler:edit" className="h-4 w-4" />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="nature-button nature-button-danger"
                >
                  <Icon name="tabler:trash" className="h-4 w-4" />
                  删除
                </button>
              </>
            )}
          </div>
        </div>

        {derivedTags.length > 0 && (
          <PostTags
            tags={derivedTags}
            className="mt-5 flex flex-wrap gap-2"
            iconMap={tagIconMap}
            iconSvgMap={tagIconSvgMap}
          />
        )}

        {memo.title && (
          <h1 className="mt-5 font-heading text-3xl font-semibold tracking-[-0.04em] text-[color:var(--nature-text)] sm:text-4xl">
            {memo.title}
          </h1>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
          <span className="nature-chip nature-chip-info gap-1">
            <Icon name="tabler:clock" className="h-3.5 w-3.5" />
            <time title={publishFull} dateTime={publishDateIso ?? undefined}>
              {publishRelative}
            </time>
          </span>
          {isAdmin && shouldShowUpdateHint && updateRelative && (
            <span
              className="text-xs italic text-[color:var(--nature-text-faint)]"
              title={updateFull ?? undefined}
            >
              编辑于 {updateRelative}
            </span>
          )}
          <span
            className={`nature-chip ${memo.isPublic ? "nature-chip-success" : "nature-chip-warning"} gap-1`}
          >
            <Icon name={memo.isPublic ? "tabler:world" : "tabler:lock"} className="h-3.5 w-3.5" />
            {memo.isPublic ? "公开" : "私有"}
          </span>
          {isAdmin && anomalies.hasInlineDataImages && (
            <div className="ml-auto">
              <AnomalyIndicator anomalies={anomalies} showLabel={true} />
            </div>
          )}
        </div>
      </section>

      <section className="nature-panel px-5 py-6 sm:px-7">
        <MarkdownRenderer
          content={displayContent}
          variant="memo"
          enableMath={true}
          enableMermaid={true}
          enableCodeFolding={true}
          enableImageLightbox={true}
          maxCodeLines={30}
          previewCodeLines={20}
          articlePath={memo.filePath}
          contentSource={memo.source === "local" ? "local" : "webdav"}
          removeTags={false}
          className="nature-prose max-w-none"
        />

        <div className="nature-divider my-6" />

        <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--nature-text-soft)]">
          <span className="nature-chip gap-2">
            <Icon name="tabler:user-circle" className="h-4 w-4" />
            {memo.author || SITE.author.name}
          </span>
          <span className="nature-chip gap-2">
            <Icon name="tabler:file-description" className="h-4 w-4" />
            Memo
          </span>
        </div>
      </section>

      {memo.attachments && memo.attachments.length > 0 && (
        <section className="nature-panel px-5 py-5 sm:px-6">
          <h2 className="font-heading text-xl font-semibold tracking-[-0.03em] text-[color:var(--nature-text)]">
            附件
          </h2>
          <div className="mt-5 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {memo.attachments.map((attachment) => (
              <div
                key={attachment.path}
                className="rounded-[1.4rem] border border-[rgba(var(--nature-border-rgb),0.72)] bg-[rgba(var(--nature-surface-rgb),0.78)] p-3"
              >
                {attachment.isImage ? (
                  <Image
                    src={
                      resolveImagePath(
                        attachment.path,
                        memo.source === "local" ? "local" : "webdav",
                        memo.filePath
                      ) || attachment.path
                    }
                    alt={attachment.filename}
                    className="mb-2 h-24 w-full rounded-xl object-cover"
                    width={320}
                    height={96}
                  />
                ) : (
                  <div className="mb-2 flex h-24 w-full items-center justify-center rounded-xl bg-[rgba(var(--nature-highlight-rgb),0.2)]">
                    <span className="text-xs text-[color:var(--nature-text-soft)]">
                      {attachment.filename.split(".").pop()?.toUpperCase()}
                    </span>
                  </div>
                )}
                <p className="truncate text-xs text-[color:var(--nature-text-soft)]">
                  {attachment.filename}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {showDeleteConfirm && (
        <div className="nature-modal z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            className="nature-modal-backdrop"
            aria-label="关闭删除确认"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="nature-modal-panel w-full max-w-md">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--nature-danger)_14%,transparent)] text-[color:var(--nature-danger)]">
                <Icon name="tabler:alert-triangle" className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--nature-text)]">确认删除</h3>
                <p className="text-sm text-[color:var(--nature-text-soft)]">此操作不可撤销</p>
              </div>
            </div>
            <div className="nature-panel-soft mt-5 px-4 py-4 text-sm text-[color:var(--nature-text-soft)]">
              确定要删除这条 Memo 吗？删除后将无法恢复。
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="nature-button nature-button-ghost"
                disabled={deleteMemo.isPending}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="nature-button nature-button-danger"
                disabled={deleteMemo.isPending}
              >
                {deleteMemo.isPending ? (
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
    </article>
  );
}
