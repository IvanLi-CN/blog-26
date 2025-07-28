import { QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { createQueryClient, createTRPCClientInstance, trpc } from '~/lib/trpc-client';
import { useMemos } from './hooks';
import { MemosList } from './MemosList';
import { QuickMemoEditor } from './QuickMemoEditor';

// 使用与hooks.ts相同的类型定义
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

interface MemosAppProps {
  isAdmin: boolean;
  initialMemos?: Memo[];
  initialPagination?: Pagination;
}

export function MemosApp({ isAdmin, initialMemos, initialPagination }: MemosAppProps) {
  // 使用 hooks 管理闪念状态
  const memosHook = useMemos({
    isAdmin,
    initialMemos,
    initialPagination,
  });

  // 监听来自抽屉编辑器的memo创建事件
  useEffect(() => {
    const handleMemoCreated = (event: CustomEvent) => {
      if (event.detail) {
        memosHook.addMemoToLocal(event.detail);
      }
    };

    // 添加事件监听器
    window.addEventListener('memoCreated', handleMemoCreated as EventListener);

    // 清理函数
    return () => {
      window.removeEventListener('memoCreated', handleMemoCreated as EventListener);
    };
  }, [memosHook.addMemoToLocal]);

  return (
    <div>
      {/* 管理员快速编辑器 */}
      {isAdmin && <QuickMemoEditor onMemoCreated={memosHook.addMemoToLocal} />}

      {/* Memos 列表 */}
      <MemosList isAdmin={isAdmin} memosHook={memosHook} />
    </div>
  );
}

export function MemosAppWithProviders({ isAdmin, initialMemos, initialPagination }: MemosAppProps) {
  // 创建客户端实例
  const [queryClient] = React.useState(() => createQueryClient());
  const [trpcClient] = React.useState(() => createTRPCClientInstance());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MemosApp isAdmin={isAdmin} initialMemos={initialMemos} initialPagination={initialPagination} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
