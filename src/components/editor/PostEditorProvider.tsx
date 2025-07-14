import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { createTRPCClientInstance, trpc } from '~/lib/trpc-client';
import { PostEditor } from './PostEditor';

interface PostEditorProviderProps {
  postId?: string;
  isNewPost: boolean;
}

export function PostEditorProvider({ postId, isNewPost }: PostEditorProviderProps) {
  // 创建客户端实例
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: (failureCount) => failureCount < 3,
          },
        },
      })
  );

  const [trpcClient] = React.useState(() => createTRPCClientInstance());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <PostEditor postId={postId} isNewPost={isNewPost} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
