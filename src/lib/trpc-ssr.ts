import "server-only";

import { cookies } from "next/headers";
import { createContext } from "@/server/context";
import { appRouter } from "@/server/router";
import { SESSION_COOKIE_NAME } from "./session";
import { buildMockRequestUrl } from "./url-builder";

/**
 * 创建 TRPC 服务端调用器
 * 用于 SSR 和 SSG
 */
export const createCaller = appRouter.createCaller;

export async function createSsrCaller(requestHeaders?: HeadersInit) {
  const mockRequestUrl = buildMockRequestUrl("/api/trpc");
  const mergedHeaders = new Headers(requestHeaders);

  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie && !mergedHeaders.has("cookie")) {
      mergedHeaders.set("cookie", `${SESSION_COOKIE_NAME}=${sessionCookie}`);
    }
  } catch {
    // ignore when cookies() is unavailable (e.g. build-time)
  }

  const mockRequest = new Request(mockRequestUrl, { headers: mergedHeaders });
  const mockHeaders = new Headers();

  const ctx = await createContext({
    req: mockRequest,
    resHeaders: mockHeaders,
    info: {
      isBatchCall: false,
      calls: [],
      accept: "application/jsonl",
      type: "query" as const,
      connectionParams: {},
      signal: new AbortController().signal,
      url: new URL(mockRequestUrl),
    },
  });

  return createCaller(ctx);
}

/**
 * 获取初始 memo 数据用于 SSR
 */
export async function getInitialMemos(
  options: { page?: number; limit?: number; publicOnly?: boolean } = {}
) {
  const caller = await createSsrCaller();

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
