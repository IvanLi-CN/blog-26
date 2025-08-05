import { useCallback, useEffect, useState } from 'react';
import { trpc } from '~/lib/trpc-client';

// 定义Memo类型
interface Memo {
  id: string;
  slug: string;
  title?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, any>;
  isPublic: boolean;
  attachments?: Array<{
    filename: string;
    path: string;
    size?: number;
    isImage: boolean;
  }>;
  tags?: string[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface UseMemosProps {
  isAdmin?: boolean;
  initialMemos?: Memo[];
  initialPagination?: Pagination;
}

export function useMemos({ isAdmin: _isAdmin = false, initialMemos, initialPagination }: UseMemosProps = {}) {
  // Note: _isAdmin is currently not used but kept for future admin-specific features
  const [allMemos, setAllMemos] = useState<Memo[]>(initialMemos || []);
  const [page, setPage] = useState(initialPagination?.page || 1);
  const [hasMore, setHasMore] = useState(initialPagination?.hasMore ?? true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // 使用tRPC query获取当前页数据
  // 如果有初始数据且是第一页，则不需要立即请求
  const shouldFetch = !initialMemos || page > 1;
  const { data, isLoading, error, refetch } = trpc.memos.getMemos.useQuery(
    { page, limit: 10 },
    {
      enabled: shouldFetch,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5分钟
    }
  );

  // 当获取到新数据时，更新状态
  useEffect(() => {
    if (data) {
      setAllMemos((prev) => {
        if (page === 1 && !initialMemos) {
          // 第一页且没有初始数据，直接替换
          return data.memos;
        } else if (page > 1) {
          // 后续页，追加数据，避免重复
          const existingIds = new Set(prev.map((memo) => memo.id));
          const newMemos = data.memos.filter((memo) => !existingIds.has(memo.id));
          return [...prev, ...newMemos];
        }
        // 如果有初始数据且是第一页，保持现有数据不变
        return prev;
      });
      setHasMore(data.pagination.hasMore);
      setIsLoadingMore(false);
    }
  }, [data, page, initialMemos]);

  const loadMore = useCallback(() => {
    if (hasMore && !isLoading && !isLoadingMore) {
      setIsLoadingMore(true);
      setPage((prev) => prev + 1);
    }
  }, [hasMore, isLoading, isLoadingMore]);

  const refetchAll = useCallback(() => {
    setPage(1);
    setAllMemos([]);
    setHasMore(true);
    refetch();
  }, [refetch]);

  // 从本地状态中移除指定的闪念
  const removeMemoFromLocal = useCallback((slug: string) => {
    setAllMemos((prev) => prev.filter((memo) => memo.slug !== slug));
  }, []);

  // 添加新闪念到列表顶部
  const addMemoToLocal = useCallback((newMemo: Memo) => {
    setAllMemos((prev) => [newMemo, ...prev]);
  }, []);

  return {
    memos: allMemos,
    isLoading: isLoading && page === 1 && !initialMemos,
    isLoadingMore,
    error: error?.message || null,
    hasMore,
    total: data?.pagination.total || initialPagination?.total || 0,
    page,
    loadMore,
    refetch: refetchAll,
    removeMemoFromLocal,
    addMemoToLocal,
  };
}

// 无限滚动hook
export function useInfiniteScroll(loadMore: () => void, hasMore: boolean, isLoading: boolean, threshold = 200) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // 确保在客户端环境中才执行
    if (!isMounted || !hasMore || isLoading || typeof window === 'undefined') return;

    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;

      if (scrollTop + clientHeight >= scrollHeight - threshold) {
        loadMore();
      }
    };

    const throttledHandleScroll = throttle(handleScroll, 200);
    window.addEventListener('scroll', throttledHandleScroll);

    return () => {
      window.removeEventListener('scroll', throttledHandleScroll);
    };
  }, [isMounted, loadMore, hasMore, isLoading, threshold]);
}

// 简单的节流函数
function throttle<T extends (...args: any[]) => any>(func: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastExecTime = 0;

  return ((...args: any[]) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(
        () => {
          func(...args);
          lastExecTime = Date.now();
        },
        delay - (currentTime - lastExecTime)
      );
    }
  }) as T;
}
