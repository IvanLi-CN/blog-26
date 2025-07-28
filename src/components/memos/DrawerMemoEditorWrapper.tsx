import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createQueryClient, createTRPCClientInstance, trpc } from '~/lib/trpc-client';
import { DrawerMemoEditor } from './DrawerMemoEditor';

interface DrawerMemoEditorWrapperProps {
  onMemoCreated?: (memo: any) => void;
  onClose?: () => void;
}

export function DrawerMemoEditorWrapper({ onMemoCreated, onClose }: DrawerMemoEditorWrapperProps) {
  // 创建客户端实例
  const [queryClient] = React.useState(() => createQueryClient());
  const [trpcClient] = React.useState(() => createTRPCClientInstance());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <DrawerMemoEditor onMemoCreated={onMemoCreated} onClose={onClose} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

// 导出带有 Providers 的版本，用于在 Astro 中使用
export { DrawerMemoEditorWrapper as DrawerMemoEditorWithProviders };
