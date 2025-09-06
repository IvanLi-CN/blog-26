import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { extractAuthFromRequest } from "../lib/auth-utils";
import { initializeDB } from "../lib/db";

export interface User {
  id: string;
  nickname: string;
  email: string;
  avatarUrl?: string;
}

export interface TRPCContext {
  req: Request;
  resHeaders: Headers;
  user?: User;
  isAdmin: boolean;
  clientAddress?: string;
}

/**
 * 创建 tRPC 上下文
 * 集成现有的认证逻辑和数据库初始化
 */
export async function createContext({
  req,
  resHeaders,
}: FetchCreateContextFnOptions): Promise<TRPCContext> {
  // 初始化数据库
  await initializeDB();

  // 在开发环境和测试环境中提供管理员权限绕过
  const isDev = process.env.NODE_ENV === "development";
  const isTest = process.env.NODE_ENV === "test";

  if (isDev || isTest) {
    // 开发/测试环境：提供默认管理员权限
    const devUser: User = {
      id: isTest ? "test-user" : "dev-user",
      email: isTest ? "admin@test.com" : "dev@example.com",
      nickname: isTest ? "Test User" : "Dev User",
    };

    console.log(`🔧 [tRPC-Context] ${isDev ? "开发" : "测试"}环境：提供默认管理员权限`);

    return {
      req,
      resHeaders,
      user: devUser,
      isAdmin: true,
      clientAddress: "dev-environment",
    };
  }

  // 生产环境：使用统一的认证逻辑
  const { user, isAdmin } = await extractAuthFromRequest(req);

  // 3. 获取客户端 IP 地址
  const clientAddress =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  return {
    req,
    resHeaders,
    user,
    isAdmin,
    clientAddress,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
