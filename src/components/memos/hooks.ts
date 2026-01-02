/**
 * Memo 相关的自定义 hooks
 */

import type { inferRouterOutputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";
import type { AppRouter } from "../../server/router";
import type { MemoCardData } from "./MemoCard";
import type { MemoData } from "./MemoEditor";
import type { QuickMemoData } from "./QuickMemoEditor";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type MemosListOutput = RouterOutputs["memos"]["list"];

// ============================================================================
// useMemos Hook - 管理 memo 列表
// ============================================================================

export interface UseMemosOptions {
  /** 每页数量 */
  limit?: number;
  /** 是否只显示公开内容 */
  publicOnly?: boolean;
  /** 初始搜索查询 */
  initialSearch?: string;
  /** 初始标签过滤 */
  initialTag?: string;
  /** SSR 初始数据（首屏） */
  initialData?: MemosListOutput;
}

export function useMemos(options: UseMemosOptions = {}) {
  const {
    limit = 10,
    publicOnly = true,
    initialSearch = "",
    initialTag = "",
    initialData,
  } = options;

  // 状态管理
  const [search, setSearch] = useState(initialSearch);
  const [tag, setTag] = useState(initialTag);

  const shouldUseInitialData =
    Boolean(initialData) && search === initialSearch && tag === initialTag;

  // tRPC 无限查询
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = trpc.memos.list.useInfiniteQuery(
    {
      limit,
      search: search || undefined,
      tag: tag || undefined,
      publicOnly,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialData: shouldUseInitialData
        ? {
            pages: [initialData as MemosListOutput],
            pageParams: [undefined],
          }
        : undefined,
    }
  );

  // 合并所有页面的数据
  const allMemos = useMemo<MemoCardData[]>(() => {
    if (!data?.pages) return [];

    return data.pages.flatMap(
      (page) =>
        page.memos.map((memo) => ({
          ...memo,
          excerpt: memo.excerpt ?? undefined,
          // Ensure required fields satisfy MemoCardData
          tags: (memo as Partial<MemoCardData>).tags ?? [],
        })) as MemoCardData[]
    );
  }, [data]);

  // 搜索处理
  const handleSearch = useCallback(
    (query: string) => {
      setSearch(query);
      refetch();
    },
    [refetch]
  );

  // 标签过滤处理
  const handleTagFilter = useCallback(
    (selectedTag: string | null) => {
      setTag(selectedTag || "");
      refetch();
    },
    [refetch]
  );

  // 加载更多
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 刷新
  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    memos: allMemos,
    pagination: {
      hasMore: hasNextPage,
    },
    isLoading: isLoading || isFetchingNextPage,
    isError,
    error,
    search,
    tag,
    handleSearch,
    handleTagFilter,
    loadMore,
    refresh,
  };
}

// ============================================================================
// useMemoEditor Hook - 管理 memo 编辑
// ============================================================================

export interface UseMemoEditorOptions {
  /** 编辑模式下的 memo ID */
  memoId?: string;
  /** 保存成功回调 */
  onSaveSuccess?: (memo: unknown) => void;
  /** 保存失败回调 */
  onSaveError?: (error: unknown) => void;
}

export function useMemoEditor(options: UseMemoEditorOptions = {}) {
  const { memoId, onSaveSuccess, onSaveError } = options;
  const utils = trpc.useUtils();

  // tRPC mutations
  const createMemo = trpc.memos.create.useMutation({
    onSuccess: (data) => {
      // 使缓存失效，确保列表显示最新数据
      utils.memos.list.invalidate();
      onSaveSuccess?.(data);
    },
    onError: (error) => {
      onSaveError?.(error);
    },
  });

  const updateMemo = trpc.memos.update.useMutation({
    onSuccess: (data) => {
      // 使缓存失效，确保列表显示最新数据
      utils.memos.list.invalidate();
      utils.memos.bySlug.invalidate({ slug: memoId || "" });
      onSaveSuccess?.(data);
    },
    onError: (error) => {
      onSaveError?.(error);
    },
  });

  const deleteMemo = trpc.memos.delete.useMutation({
    onSuccess: () => {
      // 使缓存失效，确保列表显示最新数据
      utils.memos.list.invalidate();
    },
  });

  // 获取单个 memo（编辑模式）
  const { data: existingMemo, isLoading: isLoadingMemo } = trpc.memos.bySlug.useQuery(
    { slug: memoId || "" },
    { enabled: !!memoId }
  );

  // 保存 memo
  const saveMemo = useCallback(
    async (data: MemoData) => {
      if (memoId && existingMemo) {
        // 更新现有 memo
        await updateMemo.mutateAsync({
          id: existingMemo.id,
          content: data.content,
          title: data.title,
          isPublic: data.isPublic,
          tags: data.tags,
          attachments: [], // TODO: 处理附件
        });
      } else {
        // 创建新 memo
        await createMemo.mutateAsync({
          content: data.content,
          title: data.title,
          isPublic: data.isPublic,
          tags: data.tags,
          attachments: [], // TODO: 处理附件
        });
      }
    },
    [memoId, existingMemo, createMemo, updateMemo]
  );

  // 删除 memo
  const handleDelete = useCallback(
    async (id: string) => {
      await deleteMemo.mutateAsync({ id });
    },
    [deleteMemo]
  );

  return {
    existingMemo,
    isLoadingMemo,
    saveMemo,
    handleDelete,
    isSaving: createMemo.isPending || updateMemo.isPending,
    isDeleting: deleteMemo.isPending,
    saveError: createMemo.error || updateMemo.error,
    deleteError: deleteMemo.error,
  };
}

// ============================================================================
// useQuickMemo Hook - 管理快速 memo
// ============================================================================

export interface UseQuickMemoOptions {
  /** 保存成功回调 */
  onSaveSuccess?: () => void;
  /** 保存失败回调 */
  onSaveError?: (error: unknown) => void;
}

export function useQuickMemo(options: UseQuickMemoOptions = {}) {
  const { onSaveSuccess, onSaveError } = options;
  const utils = trpc.useUtils();

  // tRPC mutation
  const createMemo = trpc.memos.create.useMutation({
    onSuccess: () => {
      // 使缓存失效，确保列表显示最新数据
      utils.memos.list.invalidate();
      onSaveSuccess?.();
    },
    onError: (error) => {
      onSaveError?.(error);
    },
  });

  // 保存快速 memo
  const saveQuickMemo = useCallback(
    async (data: QuickMemoData) => {
      await createMemo.mutateAsync({
        content: data.content,
        isPublic: data.isPublic,
        tags: data.tags,
        attachments: [],
      });
    },
    [createMemo]
  );

  return {
    saveQuickMemo,
    isSaving: createMemo.isPending,
    error: createMemo.error,
  };
}

// ============================================================================
// useInfiniteScroll Hook - 无限滚动
// ============================================================================

export interface UseInfiniteScrollOptions {
  /** 触发加载更多的阈值（像素） */
  threshold?: number;
  /** 是否有更多数据 */
  hasMore?: boolean;
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 加载更多回调 */
  onLoadMore?: () => void;
}

export function useInfiniteScroll(options: UseInfiniteScrollOptions) {
  const { threshold = 200, hasMore = false, isLoading = false, onLoadMore } = options;

  useEffect(() => {
    if (!hasMore || isLoading || !onLoadMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

      if (scrollTop + clientHeight >= scrollHeight - threshold) {
        onLoadMore();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoading, onLoadMore, threshold]);
}

// ============================================================================
// useMemoAttachments Hook - 管理附件
// ============================================================================

export function useMemoAttachments() {
  const [attachments, setAttachments] = useState<
    Array<{
      filename: string;
      path: string;
      contentType?: string;
      size?: number;
      isImage: boolean;
    }>
  >([]);

  // tRPC mutation
  const uploadAttachment = trpc.memos.uploadAttachment.useMutation();

  // 上传附件
  const handleUpload = useCallback(
    async (file: File) => {
      try {
        // 将文件转换为 base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]); // 移除 data:xxx;base64, 前缀
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const result = await uploadAttachment.mutateAsync({
          filename: file.name,
          content: base64,
          contentType: file.type,
        });

        setAttachments((prev) => [...prev, result]);
        return result;
      } catch (error) {
        console.error("上传附件失败:", error);
        throw error;
      }
    },
    [uploadAttachment]
  );

  // 删除附件
  const removeAttachment = useCallback((filename: string) => {
    setAttachments((prev) => prev.filter((att) => att.filename !== filename));
  }, []);

  return {
    attachments,
    handleUpload,
    removeAttachment,
    isUploading: uploadAttachment.isPending,
    uploadError: uploadAttachment.error,
  };
}
