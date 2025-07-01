import type { AstroCookies } from 'astro';
import { config } from './config';
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
  const { email: adminEmail } = config.admin;
  return Boolean(adminEmail && userEmail === adminEmail);
}

/**
 * 从请求头中检查当前用户是否为管理员（Traefik SSO）
 */
export function isAdminFromHeaders(headers: Headers): boolean {
  const { email: adminEmail, emailHeaderName } = config.admin;

  if (!adminEmail || !emailHeaderName) {
    return false;
  }

  const emailFromHeader = headers.get(emailHeaderName);
  return Boolean(emailFromHeader && emailFromHeader === adminEmail);
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
 */
export async function isAdminFromRequest(cookies: AstroCookies, headers: Headers): Promise<boolean> {
  // 首先检查 Traefik SSO 请求头
  if (isAdminFromHeaders(headers)) {
    return true;
  }

  // 回退到传统的 cookie 认证
  return await isAdminFromCookies(cookies);
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
