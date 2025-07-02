import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { APIRoute } from 'astro';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/router';

// 禁用预渲染，因为这是一个动态 API 路由
export const prerender = false;

/**
 * tRPC API 处理器
 * 处理所有 /api/trpc/* 路由
 */
export const ALL: APIRoute = async (opts) => {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req: opts.request,
    router: appRouter,
    createContext,
    onError: ({ error, path }) => {
      console.error(`❌ tRPC failed on ${path ?? '<no-path>'}:`, error);
    },
  });
};
