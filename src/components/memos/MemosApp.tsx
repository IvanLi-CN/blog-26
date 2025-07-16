import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createQueryClient, createTRPCClientInstance, trpc } from '~/lib/trpc-client';
import { MemosList } from './MemosList';
import { QuickMemoEditor } from './QuickMemoEditor';

interface MemosAppProps {
  isAdmin: boolean;
}

export function MemosApp({ isAdmin }: MemosAppProps) {
  return (
    <div>
      {/* 管理员快速编辑器 */}
      {isAdmin && <QuickMemoEditor />}

      {/* Memos 列表 */}
      <MemosList isAdmin={isAdmin} />
    </div>
  );
}

export function MemosAppWithProviders({ isAdmin }: MemosAppProps) {
  // 创建客户端实例
  const [queryClient] = React.useState(() => createQueryClient());
  const [trpcClient] = React.useState(() => createTRPCClientInstance());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MemosApp isAdmin={isAdmin} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
