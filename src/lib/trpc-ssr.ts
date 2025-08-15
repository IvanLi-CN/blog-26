import { appRouter } from '@/server/router';
import { createContext } from '@/server/context';

/**
 * 创建 TRPC 服务端调用器
 * 用于 SSR 和 SSG
 */
export const createCaller = appRouter.createCaller;

// 移除了 createSSRHelpers 函数，因为我们直接使用 createCaller

/**
 * 获取初始 memo 数据用于 SSR
 */
export async function getInitialMemos(options: {
  page?: number;
  limit?: number;
  publicOnly?: boolean;
} = {}) {
  const caller = createCaller(await createContext());
  
  try {
    const result = await caller.memos.list({
      page: options.page || 1,
      limit: options.limit || 20,
      publicOnly: options.publicOnly ?? true,
    });
    
    return result;
  } catch (error) {
    console.error('Failed to fetch initial memos:', error);
    return {
      items: [],
      nextCursor: undefined,
      hasMore: false,
    };
  }
}
