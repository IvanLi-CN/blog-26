import { useCallback, useEffect, useRef, useState } from 'react';
import { trpc } from '~/lib/trpc-client';

// 使用 tRPC 推导的类型
type MemoData = Awaited<ReturnType<typeof import('~/server/routers/memos').memosRouter.getMemos.query>>;
type Memo = MemoData['memos'][0];

interface UseMemosProps {
  isAdmin?: boolean;
}

export function useMemos({ isAdmin = false }: UseMemosProps = {}) {
  const [allMemos, setAllMemos] = useState<Memo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 使用tRPC query获取当前页数据
  const { data, isLoading, error, refetch } = trpc.memos.getMemos.useQuery(
    { page, limit: 10 },
    {
      enabled: true,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5分钟
    }
  );

  // 当获取到新数据时，更新状态
  useEffect(() => {
    if (data) {
      setAllMemos((prev) => {
        if (page === 1) {
          // 第一页，直接替换
          return data.memos;
        } else {
          // 后续页，追加数据，避免重复
          const existingIds = new Set(prev.map((memo) => memo.id));
          const newMemos = data.memos.filter((memo) => !existingIds.has(memo.id));
          return [...prev, ...newMemos];
        }
      });
      setHasMore(data.pagination.hasMore);
      setIsLoadingMore(false);
    }
  }, [data, page]);

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

  return {
    memos: allMemos,
    isLoading: isLoading && page === 1,
    isLoadingMore,
    error: error?.message || null,
    hasMore,
    total: data?.pagination.total || 0,
    page,
    loadMore,
    refetch: refetchAll,
  };
}

// 无限滚动hook
export function useInfiniteScroll(loadMore: () => void, hasMore: boolean, isLoading: boolean, threshold = 200) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !hasMore || isLoading) return;

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
  let timeoutId: NodeJS.Timeout | null = null;
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
