import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { initializeDB } from '~/lib/db';
import { verifyJwt } from '~/lib/jwt';

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

  // 从请求中提取用户信息
  let user: User | undefined;
  let isAdmin = false;

  // 1. 尝试从 Cookie 中获取 JWT token
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const token = cookies.token;

    if (token) {
      try {
        const payload = await verifyJwt(token);
        if (
          typeof payload.sub === 'string' &&
          typeof payload.nickname === 'string' &&
          typeof payload.email === 'string'
        ) {
          user = {
            id: payload.sub,
            nickname: payload.nickname,
            email: payload.email,
            avatarUrl: payload.avatarUrl as string | undefined,
          };
        }
      } catch (error) {
        // Invalid or expired token, user remains undefined
        console.warn('Invalid JWT token in context:', error);
      }
    }
  }

  // 2. 检查是否为管理员（从 Traefik headers 或配置）
  const remoteEmail = req.headers.get('Remote-Email');
  const _remoteUser = req.headers.get('Remote-User');

  // 如果有 Traefik 传递的邮箱信息，优先使用
  if (remoteEmail) {
    // 这里可以添加管理员邮箱检查逻辑
    // 暂时简化处理
    isAdmin = true;
  }

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

/**
 * 简单的 Cookie 解析函数
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });

  return cookies;
}

export type Context = Awaited<ReturnType<typeof createContext>>;
