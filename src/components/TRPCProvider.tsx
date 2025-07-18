import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, httpSubscriptionLink, splitLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '~/lib/trpc';

interface TRPCProviderProps {
  children: React.ReactNode;
}

export function TRPCProvider({ children }: TRPCProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime)
            retry: (failureCount, error: any) => {
              // 不重试 4xx 错误
              if (error?.data?.httpStatus >= 400 && error?.data?.httpStatus < 500) {
                return false;
              }
              // 最多重试 2 次
              return failureCount < 2;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: false, // 不重试 mutations
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        splitLink({
          condition: (op) => op.type === 'subscription',
          true: httpSubscriptionLink({
            url: '/api/trpc',
          }),
          false: httpBatchLink({
            url: '/api/trpc',
            maxURLLength: 2048,
            headers() {
              return {
                // 可以在这里添加认证 headers
              };
            },
          }),
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
