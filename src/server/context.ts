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
  let remoteEmail = req.headers.get('Remote-Email');

  // 在开发环境中，如果设置了ADMIN_MODE环境变量，模拟管理员邮箱头
  if (process.env.ADMIN_MODE === 'true' && !remoteEmail) {
    remoteEmail = process.env.ADMIN_EMAIL || 'ivanli2048@gmail.com';
  }

  // 如果有 Traefik 传递的邮箱信息，检查是否为管理员
  if (remoteEmail) {
    const adminEmail = process.env.ADMIN_EMAIL;
    isAdmin = adminEmail ? remoteEmail === adminEmail : false;

    // 在开发环境中，如果是管理员且没有用户信息，创建临时用户对象
    if (isAdmin && !user && process.env.ADMIN_MODE === 'true') {
      user = {
        id: 'admin-dev-user',
        nickname: 'Admin',
        email: remoteEmail,
      };
    }
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
