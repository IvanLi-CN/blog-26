import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { extractAuthFromRequest } from '~/lib/auth-utils';
import { initializeDB } from '~/lib/db';

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
export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions): Promise<TRPCContext> {
  // 初始化数据库
  await initializeDB();

  // 使用统一的认证逻辑
  const { user, isAdmin } = await extractAuthFromRequest(req);

  // 3. 获取客户端 IP 地址
  const clientAddress =
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown';

  return {
    req,
    resHeaders,
    user,
    isAdmin,
    clientAddress,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
