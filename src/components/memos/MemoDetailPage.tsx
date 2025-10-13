"use client";

/**
 * Memo 详情页面组件
 *
 * 展示单个 memo 的详细内容，支持编辑功能
 */

import {
  ArrowLeft,
  Calendar,
  Copy,
  Edit3,
  ExternalLink,
  Globe,
  Lock,
  MoreHorizontal,
  Share2,
  Trash2,
} from "lucide-react";
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
import PostTags from "../blog/PostTags";
import MarkdownRenderer from "../common/MarkdownRenderer";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import AnomalyIndicator from "./AnomalyIndicator";
import type { MemoCardData } from "./MemoCard";
import { type MemoData, MemoEditor } from "./MemoEditor";
// 不在界面上解释时间来源，因此无需 fallback 标签映射

export interface MemoDetailPageProps {
  /** Memo slug */
  slug: string;
  /** 初始数据（SSR） */
  initialData?: MemoCardData;
  /** 是否显示编辑功能 */
  showEditFeatures?: boolean;
  /** 样式类名 */
  className?: string;
}

export function MemoDetailPage({
  slug,
  initialData: _initialData,
  showEditFeatures = false,
  className,
}: MemoDetailPageProps) {
  const router = useRouter();
  const { isAdmin } = useAuth();

  // 状态管理
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 获取 memo 数据
  const {
    data: memo,
    isLoading,
    isError,
    refetch,
  } = trpc.memos.bySlug.useQuery(
    { slug },
    {
      refetchOnMount: false,
    }
  );

  // 更新 memo
  const updateMemo = trpc.memos.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      refetch();
    },
    onError: (error) => {
      console.error("更新失败:", error);
    },
  });

  // 删除 memo
  const deleteMemo = trpc.memos.delete.useMutation({
    onSuccess: () => {
      router.push("/memos");
    },
    onError: (error) => {
      console.error("删除失败:", error);
    },
  });

  // 格式化时间
  const formatTime = useCallback((dateString: string) => {
    if (!dateString) {
      return "未知时间";
    }

    const result = formatRelativeTime(dateString);
    return result ?? "未知时间";
  }, []);

  // 处理编辑保存
  const handleSave = useCallback(
    async (data: MemoData) => {
      if (!memo) return;

      await updateMemo.mutateAsync({
        id: memo.id,
        content: data.content,
        title: data.title,
        isPublic: data.isPublic,
        tags: data.tags,
        attachments: [], // TODO: 处理附件
      });
    },
    [memo, updateMemo]
  );

  // 处理删除：打开确认框
  const handleAskDelete = useCallback(() => {
    if (!memo) return;
    setShowDeleteConfirm(true);
  }, [memo]);

  const handleConfirmDelete = useCallback(async () => {
    if (!memo) return;
    await deleteMemo.mutateAsync({ id: memo.id });
  }, [memo, deleteMemo]);

  // 处理分享
  const handleShare = useCallback(async () => {
    if (!memo) return;

    try {
      const url = `${window.location.origin}/memos/${memo.slug}`;
      await navigator.clipboard.writeText(url);
      // 这里可以添加成功提示
    } catch (error) {
      console.error("复制链接失败:", error);
    }
  }, [memo]);

  // 处理返回
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

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
  // 不显示任何“自动选择”等解释性标签
  const fallbackLabel = "";

  const publishRelative = useMemo(
    () => (publishDateIso ? formatTime(publishDateIso) : "未知时间"),
    [formatTime, publishDateIso]
  );

  const publishFull = useMemo(() => {
    if (!publishDateIso) {
      return "未知时间";
    }
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

  const publishDateTimeAttr = publishDateIso ?? undefined;

  const shouldShowUpdateHint = useMemo(() => {
    if (!updatedAtIso) {
      return false;
    }
    if (!publishDateIso) {
      return true;
    }
    const publishMs = Date.parse(publishDateIso);
    const updateMs = Date.parse(updatedAtIso);
    if (Number.isNaN(publishMs) || Number.isNaN(updateMs)) {
      return publishDateIso !== updatedAtIso;
    }
    return Math.abs(updateMs - publishMs) > 1000;
  }, [publishDateIso, updatedAtIso]);

  // 加载状态
  if (isLoading) {
    return (
      <div className={cn("memo-detail-page", className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-1/4" />
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded" />
            <div className="h-4 bg-muted rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  // 错误状态
  if (isError || !memo) {
    return (
      <div className={cn("memo-detail-page", className)}>
        <div className="alert alert-error max-w-md mx-auto my-8">
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
          <span>加载失败，请稍后重试</span>
        </div>
        <div className="text-center">
          <Button onClick={handleBack}>返回</Button>
        </div>
      </div>
    );
  }

  // 编辑模式
  if (isEditing) {
    return (
      <div className={cn("memo-detail-page", className)}>
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

  // 详情展示模式
  return (
    <div className={cn("memo-detail-page", className)}>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={handleBack} className="flex items-center space-x-2">
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </Button>

        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleShare} className="flex items-center space-x-2">
            <Share2 className="w-4 h-4" />
            <span>分享</span>
          </Button>

          {showEditFeatures && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit3 className="w-4 h-4 mr-2" />
                  编辑
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShare}>
                  <Copy className="w-4 h-4 mr-2" />
                  复制链接
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.open(`/memos/${memo.slug}`, "_blank")}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  在新窗口打开
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleAskDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* 顶部：标签列表（统一使用 PostTags） */}
      <div className="mb-6">
        {derivedTags.length > 0 && <PostTags tags={derivedTags} className="flex flex-wrap gap-2" />}
      </div>

      {/* 内容 */}
      <div>
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
          className="prose prose-lg max-w-none"
        />
        {/* 元信息：移动到内容末尾展示 */}
        <div className="mt-6 flex items-center text-sm text-muted-foreground gap-4">
          <div className="flex items-center space-x-2">
            <Avatar className="w-6 h-6">
              <AvatarFallback className="text-xs">
                {memo.author?.charAt(0)?.toUpperCase() || "M"}
              </AvatarFallback>
            </Avatar>
            <span>{memo.author || SITE.author.name}</span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-wrap text-sm">
            <Calendar className="w-4 h-4" />
            <div className="flex items-center gap-2 flex-wrap">
              <time title={publishFull} dateTime={publishDateTimeAttr} className="cursor-help">
                {publishRelative}
              </time>
              {isAdmin && shouldShowUpdateHint && updateRelative && (
                <span
                  className="whitespace-nowrap text-xs text-base-content/50 italic"
                  title={updateFull ?? undefined}
                >
                  (编辑于 {updateRelative})
                </span>
              )}
              {fallbackLabel && (
                <span className="text-warning/80 flex-shrink-0">{fallbackLabel}</span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-1">
            {memo.isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>{memo.isPublic ? "公开" : "私有"}</span>
          </div>

          {/* 右侧：仅管理员显示异常提示 */}
          {(() => {
            const anomalies = detectContentAnomalies(memo.content || "");
            return isAdmin && anomalies.hasInlineDataImages ? (
              <div className="ml-auto">
                <AnomalyIndicator anomalies={anomalies} showLabel={true} />
              </div>
            ) : (
              <div className="ml-auto" />
            );
          })()}
        </div>
      </div>

      {/* 附件 */}
      {memo.attachments && memo.attachments.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-medium mb-4">附件</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {memo.attachments.map(
              (attachment: { path: string; filename: string; isImage: boolean }) => (
                <div key={attachment.path} className="border rounded-lg p-3">
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
                      className="w-full h-24 object-cover rounded mb-2"
                      width={320}
                      height={96}
                    />
                  ) : (
                    <div className="w-full h-24 bg-muted rounded mb-2 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">
                        {attachment.filename.split(".").pop()?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <p className="text-xs truncate">{attachment.filename}</p>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* 删除确认对话框（daisyUI）*/}
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

            <div className="bg-base-100 p-4 rounded-lg border border-base-200 mb-6">
              <p className="text-sm text-base-content/80">
                确定要删除这条 Memo 吗？删除后将无法恢复。
              </p>
            </div>

            <div className="modal-action">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn btn-error gap-2"
                disabled={deleteMemo.isPending}
              >
                {deleteMemo.isPending ? (
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
                disabled={deleteMemo.isPending}
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
