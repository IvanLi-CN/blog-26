import { createContext } from "@/server/context";
import { appRouter } from "@/server/router";

/**
 * 创建 TRPC 服务端调用器
 * 用于 SSR 和 SSG
 */
export const createCaller = appRouter.createCaller;

// 移除了 createSSRHelpers 函数，因为我们直接使用 createCaller

/**
 * 获取初始 memo 数据用于 SSR
 */
export async function getInitialMemos(
  options: { page?: number; limit?: number; publicOnly?: boolean } = {}
) {
  // 创建模拟的请求对象用于 SSR
  const mockRequest = new Request("http://localhost:3000/api/trpc");
  const mockHeaders = new Headers();

  const caller = createCaller(
    await createContext({
      req: mockRequest,
      resHeaders: mockHeaders,
      info: {
        isBatchCall: false,
        calls: [],
        accept: "application/jsonl",
        type: "query" as const,
        connectionParams: {},
        signal: new AbortController().signal,
        url: new URL("http://localhost:3000/api/trpc"),
      },
    })
  );

  try {
    const result = await caller.memos.list({
      limit: options.limit || 20,
      publicOnly: options.publicOnly ?? true,
    });

    return result;
  } catch (error) {
    console.error("Failed to fetch initial memos:", error);
    return {
      items: [],
      nextCursor: undefined,
      hasMore: false,
    };
  }
}
