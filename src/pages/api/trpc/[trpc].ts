import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { APIRoute } from 'astro';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/router';
import { isHtmlAccepted } from '~/utils/error-handler';

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
    responseMeta: ({ errors }) => {
      // 对于404错误，确保返回正确的状态码
      const hasNotFoundError = errors.some((err) => err.code === 'NOT_FOUND');
      if (hasNotFoundError) {
        return {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      }

      // 其他错误的默认处理
      const hasError = errors.length > 0;
      if (hasError) {
        const firstError = errors[0];
        const statusCode =
          firstError.code === 'UNAUTHORIZED'
            ? 401
            : firstError.code === 'FORBIDDEN'
              ? 403
              : firstError.code === 'BAD_REQUEST'
                ? 400
                : firstError.code === 'CONFLICT'
                  ? 409
                  : firstError.code === 'TOO_MANY_REQUESTS'
                    ? 429
                    : 500;

        return {
          status: statusCode,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      }

      return {};
    },
  });
};
