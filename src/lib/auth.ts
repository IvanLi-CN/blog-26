import type { AstroCookies } from 'astro';
import { extractAuthFromRequest } from './auth-utils';
import { verifyJwt } from './jwt';

export interface UserInfo {
  id: string;
  nickname: string;
  email: string;
}

/**
 * 从cookies中获取用户信息
 */
export async function getUserFromCookies(cookies: AstroCookies): Promise<UserInfo | null> {
  const token = cookies.get('token');

  if (!token?.value) {
    return null;
  }

  try {
    const payload = await verifyJwt(token.value);
    if (payload.sub && typeof payload.nickname === 'string' && typeof payload.email === 'string') {
      return {
        id: payload.sub,
        nickname: payload.nickname,
        email: payload.email,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 检查用户是否为管理员（通过邮箱）
 */
export function isAdmin(userEmail: string): boolean {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    return Boolean(adminEmail && userEmail === adminEmail);
  } catch {
    // Configuration not available (e.g., during prerender)
    return false;
  }
}

/**
 * 从请求头中检查当前用户是否为管理员（Traefik SSO）
 */
export function isAdminFromHeaders(headers: Headers): boolean {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const emailHeaderName = process.env.ADMIN_EMAIL_HEADER_NAME || 'Remote-Email';

    if (!adminEmail) {
      return false;
    }

    const emailFromHeader = headers.get(emailHeaderName);
    return Boolean(emailFromHeader && emailFromHeader === adminEmail);
  } catch {
    // Configuration not available (e.g., during prerender)
    return false;
  }
}

/**
 * 从cookies中检查当前用户是否为管理员
 */
export async function isAdminFromCookies(cookies: AstroCookies): Promise<boolean> {
  const user = await getUserFromCookies(cookies);
  return user ? isAdmin(user.email) : false;
}

/**
 * 综合检查当前用户是否为管理员（支持 cookies 和 headers）
 * 使用统一的认证逻辑
 */
export async function isAdminFromRequest(cookies: AstroCookies, headers: Headers): Promise<boolean> {
  // 创建一个模拟的 Request 对象来复用 auth-utils 的逻辑
  const mockRequest = new Request('http://localhost', {
    headers: new Headers(headers),
  });

  // 将 Astro cookies 转换为 cookie 字符串
  const cookiePairs: string[] = [];

  // 获取 token cookie（主要的认证 cookie）
  const token = cookies.get('token');
  if (token?.value) {
    cookiePairs.push(`token=${token.value}`);
  }

  // 如果有其他 cookies，也可以添加
  // 注意：Astro cookies 没有 getAll() 方法，我们只处理已知的认证相关 cookies

  if (cookiePairs.length > 0) {
    mockRequest.headers.set('cookie', cookiePairs.join('; '));
  }

  const { isAdmin } = await extractAuthFromRequest(mockRequest);
  return isAdmin;
}

/**
 * 重定向到管理员登录页面的响应
 */
export function redirectToAdminLogin(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin/login',
    },
  });
}

/**
 * 重定向到登录页面的响应
 */
export function redirectToLogin(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/?login=required',
    },
  });
}

/**
 * 返回403禁止访问的响应
 */
export function forbiddenResponse(): Response {
  return new Response('Forbidden: Admin access required', {
    status: 403,
  });
}
