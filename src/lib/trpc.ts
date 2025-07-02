import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '~/server/router';

/**
 * tRPC React 客户端 - 用于 React 组件
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * tRPC Vanilla 客户端 - 用于 Astro 页面和脚本
 */
export const trpcVanilla = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      // 可选：添加自定义 headers
      headers() {
        return {
          // 可以在这里添加认证 headers
        };
      },
    }),
  ],
});

/**
 * 获取 tRPC 客户端的基础 URL
 */
export function getTRPCUrl() {
  if (typeof window !== 'undefined') {
    // 浏览器环境
    return '/api/trpc';
  }

  // 服务器环境
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/trpc`;
  }

  return `http://localhost:${process.env.PORT ?? 4321}/api/trpc`;
}

/**
 * 创建 tRPC 客户端实例
 * 用于在不同环境中创建客户端
 */
export function createTRPCClient() {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: getTRPCUrl(),
      }),
    ],
  });
}
