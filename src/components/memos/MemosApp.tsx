"use client";

/**
 * Memo 应用容器组件
 *
 * 集成所有子组件，统一状态管理
 */

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { cn } from "../../lib/utils";
import type { TagIconMap } from "../tag-icons/tag-icon-client";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import ToastAlert from "../ui/ToastAlert";
import {
  type UseMemosOptions,
  useInfiniteScroll,
  useMemoEditor,
  useMemos,
  useQuickMemo,
} from "./hooks";
import type { MemoCardData } from "./MemoCard";
import type { MemoData } from "./MemoEditor";
import { MemosErrorBoundary } from "./MemosErrorBoundary";
import { MemosList } from "./MemosList";
import type { QuickMemoEditValues } from "./QuickMemoEditModal";
import type { QuickMemoData } from "./QuickMemoEditor";

const QuickMemoEditor = dynamic(
  () => import("./QuickMemoEditor").then((module) => module.QuickMemoEditor),
  { ssr: false }
);

const MemoEditor = dynamic(() => import("./MemoEditor").then((module) => module.MemoEditor), {
  ssr: false,
});

const QuickMemoEditModal = dynamic(
  () => import("./QuickMemoEditModal").then((module) => module.QuickMemoEditModal),
  { ssr: false }
);

export interface MemosAppProps {
  /** 是否显示管理功能 */
  showManageFeatures?: boolean;
  /** 是否只显示公开内容 */
  publicOnly?: boolean;
  /** SSR 首屏初始数据 */
  initialData?: UseMemosOptions["initialData"];
  /** SSR 标签图标映射（tagPath -> iconId） */
  tagIconMap?: TagIconMap;
  /** SSR 标签图标 SVG（iconId -> svg） */
  tagIconSvgMap?: Record<string, string | null>;
  /** 初始视图模式 */
  initialView?: "list" | "quick" | "editor";
  /** local source 是否启用 */
  localSourceEnabled?: boolean;
  /** 服务端校验后的 memo 根目录 */
  localMemoRootPath?: string;
  /** 样式类名 */
  className?: string;
}

export function MemosApp({
  showManageFeatures = false,
  publicOnly = true,
  initialData,
  tagIconMap,
  tagIconSvgMap,
  localSourceEnabled = true,
  localMemoRootPath,
  className,
}: MemosAppProps) {
  // 获取URL搜索参数
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const initialTag = searchParams.get("tag") || "";

  // 状态管理
  const [editingMemo, setEditingMemo] = useState<MemoCardData | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [showQuickEditor, setShowQuickEditor] = useState(false);

  // Memo 列表管理
  const {
    memos,
    pagination,
    isLoading,
    isError,
    error,
    handleSearch,
    handleTagFilter,
    loadMore,
    refresh,
  } = useMemos({
    limit: 20,
    publicOnly,
    initialSearch,
    initialTag,
    initialData,
  });

  const handleSaveSuccess = useCallback(() => {
    setShowEditor(false);
    setShowQuickEditor(false);
    setEditingMemo(null);
    refresh();
  }, [refresh]);

  // 删除/保存反馈通过 react-toastify 统一处理

  // 编辑器管理
  const {
    existingMemo,
    isLoadingMemo,
    isSaving: isSavingMemo,
    saveError,
    saveMemo,
    handleDelete,
  } = useMemoEditor({
    memoId: editingMemo?.slug,
    memoRecordId: editingMemo?.id,
    onSaveSuccess: handleSaveSuccess,
    onSaveError: (error) => {
      console.error("保存失败:", error);
    },
  });

  // 快速编辑器管理
  const { saveQuickMemo } = useQuickMemo({
    onSaveSuccess: () => {
      setShowQuickEditor(false);
      refresh();
      toast.success(
        <ToastAlert type="success" message="Memo 已发布" onAction={() => toast.dismiss()} />
      );
    },
    onSaveError: (error) => {
      console.error("快速保存失败:", error);
      const raw = (error as Error)?.message || (typeof error === "string" ? error : "服务器错误");
      const reason =
        String(raw)
          .replace(/^(TRPCClientError:|Error:)/i, "")
          .trim() || "未知原因";
      toast.error(
        <ToastAlert
          type="error"
          message={`发布 Memo 失败：${reason}`}
          onAction={() => toast.dismiss()}
        />
      );
    },
  });

  // 无限滚动
  useInfiniteScroll({
    hasMore: pagination?.hasMore,
    isLoading,
    onLoadMore: loadMore,
  });

  // 处理新建 memo
  const handleNew = useCallback(() => {
    setEditingMemo(null);
    setShowEditor(true);
  }, []);

  // 处理编辑 memo
  const handleEdit = useCallback((memo: MemoCardData) => {
    setEditingMemo(memo);
    setShowEditor(false);
    setShowQuickEditor(true);
  }, []);

  const handleCloseQuickEditor = useCallback(() => {
    setShowQuickEditor(false);
    setEditingMemo(null);
  }, []);

  // 处理删除 memo
  const handleDeleteMemo = useCallback(
    async (memo: MemoCardData) => {
      try {
        await handleDelete(memo.id);
        toast.success(
          <ToastAlert
            type="success"
            message={`已删除 Memo：${memo.title || memo.slug || "(未命名)"}`}
            onAction={() => toast.dismiss()}
          />
        );
        refresh();
      } catch (error) {
        console.error("删除失败:", error);
        const _memoLabel = memo.title || memo.slug || "(未命名)";
        const raw = (error as Error)?.message || (typeof error === "string" ? error : "服务器错误");
        const _reason =
          String(raw)
            .replace(/^(TRPCClientError:|Error:)/i, "")
            .trim() || "未知原因";
        // 仅在对话框内提示，不再额外弹全局 toast
        // const msg = `删除 Memo 失败：${memoLabel}（${reason}）`;
        // toast.error(<ToastAlert type="error" message={msg} onAction={() => toast.dismiss()} />);
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    [handleDelete, refresh]
  );

  // 处理编辑器保存
  const handleEditorSave = useCallback(
    async (data: MemoData) => {
      await saveMemo(data);
    },
    [saveMemo]
  );

  // 处理快速编辑器保存
  const handleQuickSave = useCallback(
    async (data: QuickMemoData) => {
      await saveQuickMemo(data);
    },
    [saveQuickMemo]
  );

  const handleQuickEditSave = useCallback(
    async ({ content, isPublic }: QuickMemoEditValues) => {
      const memoForQuickEdit = existingMemo ?? editingMemo;

      if (!memoForQuickEdit) {
        console.warn("尝试在未加载完成时保存闪念，已忽略");
        return;
      }

      await saveMemo({
        content,
        title: memoForQuickEdit.title,
        isPublic,
        tags: memoForQuickEdit.tags ?? [],
      });
    },
    [editingMemo, existingMemo, saveMemo]
  );

  const quickEditTitle =
    existingMemo?.title || editingMemo?.title || editingMemo?.slug || undefined;
  const quickEditContent = existingMemo?.content ?? editingMemo?.content;
  const quickEditIsPublic = existingMemo?.isPublic ?? editingMemo?.isPublic ?? true;
  const quickEditArticlePath = existingMemo?.filePath ?? editingMemo?.filePath ?? editingMemo?.slug;
  const quickEditSource = existingMemo?.source ?? editingMemo?.source;
  const quickEditContentSource = quickEditSource === "local" ? "local" : "webdav";
  const quickEditPending = Boolean(editingMemo && isLoadingMemo && !quickEditContent);
  const quickEditErrorMessage =
    saveError instanceof Error ? saveError.message : saveError ? String(saveError) : undefined;

  // 渲染错误状态
  if (isError) {
    return (
      <div className="text-center py-12">
        <div className="text-destructive mb-4">加载失败: {error?.message || "未知错误"}</div>
        <Button onClick={refresh}>重试</Button>
      </div>
    );
  }

  return (
    <div className={cn("memos-app", className)}>
      {/* 主要内容区域 - 匹配旧项目的简洁设计 */}
      <div>
        {/* 管理员快速编辑器 - 匹配旧项目 */}
        {showManageFeatures && (
          <MemosErrorBoundary>
            <QuickMemoEditor
              onSave={handleQuickSave}
              localSourceEnabled={localSourceEnabled}
              localMemoRootPath={localMemoRootPath}
            />
          </MemosErrorBoundary>
        )}

        {/* Memos 列表 - 匹配旧项目的简洁设计 */}
        <MemosErrorBoundary>
          <MemosList
            memos={memos}
            loading={isLoading}
            hasMore={pagination?.hasMore}
            onLoadMore={loadMore}
            onSearch={handleSearch}
            onTagFilter={handleTagFilter}
            onRefresh={refresh}
            onNew={showManageFeatures ? handleNew : undefined}
            onEdit={showManageFeatures ? handleEdit : undefined}
            onDelete={showManageFeatures ? handleDeleteMemo : undefined}
            showManageButtons={showManageFeatures}
            showVisibilityIndicator={showManageFeatures}
            viewMode="timeline"
            error={error}
            tagIconMap={tagIconMap}
            tagIconSvgMap={tagIconSvgMap}
          />
        </MemosErrorBoundary>
      </div>

      {/* 编辑器对话框 */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMemo ? "编辑 Memo" : "新建 Memo"}</DialogTitle>
          </DialogHeader>

          <MemoEditor
            initialContent={existingMemo?.content}
            initialTitle={existingMemo?.title}
            initialIsPublic={existingMemo?.isPublic}
            initialTags={existingMemo?.tags}
            isEditing={!!editingMemo}
            onSave={handleEditorSave}
            onCancel={() => setShowEditor(false)}
            showAdvancedOptions
            localSourceEnabled={localSourceEnabled}
            localMemoRootPath={localMemoRootPath}
          />
        </DialogContent>
      </Dialog>

      <QuickMemoEditModal
        open={showQuickEditor}
        onClose={handleCloseQuickEditor}
        memoTitle={quickEditTitle}
        initialContent={quickEditContent}
        initialIsPublic={quickEditIsPublic}
        articlePath={quickEditArticlePath}
        contentSource={quickEditContentSource}
        isLoading={quickEditPending}
        isSaving={isSavingMemo}
        errorMessage={quickEditErrorMessage}
        onSave={handleQuickEditSave}
      />
    </div>
  );
}
