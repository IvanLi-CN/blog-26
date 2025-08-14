"use client";

/**
 * Memo 应用容器组件
 *
 * 集成所有子组件，统一状态管理
 */

import { Edit3, List, Plus, Zap } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { useInfiniteScroll, useMemoEditor, useMemos, useQuickMemo } from "./hooks";
import { MemoCard, type MemoCardData } from "./MemoCard";
import { type MemoData, MemoEditor } from "./MemoEditor";
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
  initialView = "list",
  className,
}: MemosAppProps) {
  // 状态管理
  const [currentView, setCurrentView] = useState(initialView);
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

  // 处理快速新建
  const handleQuickNew = useCallback(() => {
    setShowQuickEditor(true);
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

  // 处理 memo 点击
  const handleMemoClick = useCallback((memo: MemoCardData) => {
    // 可以导航到详情页或展开预览
    window.open(`/memos/${memo.slug}`, "_blank");
  }, []);

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
      {/* 主要内容区域 */}
      <div className="space-y-6">
        {/* 头部操作栏 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Memos</h1>
            <p className="text-muted-foreground">记录想法，分享见解</p>
          </div>

          {showManageFeatures && (
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                onClick={handleQuickNew}
                className="flex items-center space-x-2"
              >
                <Zap className="w-4 h-4" />
                <span>快速记录</span>
              </Button>

              <Button onClick={handleNew} className="flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>新建 Memo</span>
              </Button>
            </div>
          )}
        </div>

        {/* 视图切换（可选） */}
        {showManageFeatures && (
          <Tabs value={currentView} onValueChange={setCurrentView as any}>
            <TabsList>
              <TabsTrigger value="list" className="flex items-center space-x-2">
                <List className="w-4 h-4" />
                <span>列表</span>
              </TabsTrigger>
              <TabsTrigger value="quick" className="flex items-center space-x-2">
                <Zap className="w-4 h-4" />
                <span>快速</span>
              </TabsTrigger>
              <TabsTrigger value="editor" className="flex items-center space-x-2">
                <Edit3 className="w-4 h-4" />
                <span>编辑</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="mt-6">
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
                onMemoClick={handleMemoClick}
                showManageButtons={showManageFeatures}
              />
            </TabsContent>

            <TabsContent value="quick" className="mt-6">
              <div className="max-w-2xl mx-auto">
                <QuickMemoEditor
                  onSave={handleQuickSave}
                  autoFocus
                  showAdvancedOptions={showManageFeatures}
                />

                {/* 最近的 memo */}
                <div className="mt-8">
                  <h3 className="text-lg font-medium mb-4">最近的 Memo</h3>
                  <div className="space-y-3">
                    {memos.slice(0, 5).map((memo) => (
                      <MemoCard
                        key={memo.id}
                        memo={memo}
                        compact
                        showEditButton={showManageFeatures}
                        onEdit={handleEdit}
                        onDelete={handleDeleteMemo}
                        onClick={handleMemoClick}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="editor" className="mt-6">
              <div className="max-w-4xl mx-auto">
                <MemoEditor
                  onSave={handleEditorSave}
                  onCancel={() => setCurrentView("list")}
                  showAdvancedOptions
                />
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* 默认列表视图（非管理模式） */}
        {!showManageFeatures && (
          <MemosList
            memos={memos}
            loading={isLoading}
            hasMore={pagination?.hasMore}
            onLoadMore={loadMore}
            onSearch={handleSearch}
            onTagFilter={handleTagFilter}
            onRefresh={refresh}
            onMemoClick={handleMemoClick}
            showManageButtons={false}
          />
        )}
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
