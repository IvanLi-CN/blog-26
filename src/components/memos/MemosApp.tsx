"use client";

/**
 * Memo 应用容器组件
 *
 * 集成所有子组件，统一状态管理
 */

import { useCallback, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { useInfiniteScroll, useMemoEditor, useMemos, useQuickMemo } from "./hooks";
import type { MemoCardData } from "./MemoCard";
import { type MemoData, MemoEditor } from "./MemoEditor";
import { MemosErrorBoundary } from "./MemosErrorBoundary";
import { MemosList } from "./MemosList";
import { type QuickMemoData, QuickMemoEditor } from "./QuickMemoEditor";

export interface MemosAppProps {
  /** 是否显示管理功能 */
  showManageFeatures?: boolean;
  /** 是否只显示公开内容 */
  publicOnly?: boolean;
  /** 初始视图模式 */
  initialView?: "list" | "quick" | "editor";
  /** 样式类名 */
  className?: string;
}

export function MemosApp({
  showManageFeatures = false,
  publicOnly = true,
  className,
}: MemosAppProps) {
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
  });

  // 编辑器管理
  const { existingMemo, saveMemo, handleDelete } = useMemoEditor({
    memoId: editingMemo?.slug,
    onSaveSuccess: () => {
      setShowEditor(false);
      setEditingMemo(null);
      refresh();
    },
    onSaveError: (error) => {
      console.error("保存失败:", error);
    },
  });

  // 快速编辑器管理
  const { saveQuickMemo } = useQuickMemo({
    onSaveSuccess: () => {
      setShowQuickEditor(false);
      refresh();
    },
    onSaveError: (error) => {
      console.error("快速保存失败:", error);
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
    setShowEditor(true);
  }, []);

  // 处理删除 memo
  const handleDeleteMemo = useCallback(
    async (memo: MemoCardData) => {
      try {
        await handleDelete(memo.id);
        refresh();
      } catch (error) {
        console.error("删除失败:", error);
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
            <QuickMemoEditor onSave={handleQuickSave} />
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
            viewMode="timeline"
            error={error}
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
          />
        </DialogContent>
      </Dialog>

      {/* 快速编辑器对话框 */}
      <Dialog open={showQuickEditor} onOpenChange={setShowQuickEditor}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>快速记录</DialogTitle>
          </DialogHeader>

          <QuickMemoEditor onSave={handleQuickSave} autoFocus showAdvancedOptions />
        </DialogContent>
      </Dialog>
    </div>
  );
}
