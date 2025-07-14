import { QueryClient } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '~/server/router';

/**
 * tRPC React 客户端
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * 创建 tRPC 客户端实例
 */
export function createTRPCClientInstance() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/api/trpc',
        headers() {
          return {
            // 可以在这里添加认证 headers
          };
        },
      }),
    ],
  });
}

/**
 * 创建 React Query 客户端
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: (failureCount, error: any) => {
          // 不重试 4xx 错误
          if (error?.data?.httpStatus >= 400 && error?.data?.httpStatus < 500) {
            return false;
          }
          return failureCount < 3;
        },
      },
    },
  });
}
