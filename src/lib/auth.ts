import { cookies } from "next/headers";
import { getAdminEmail, getSsoEmailHeaderName } from "./admin-config";
import { type AuthResult, extractAuthFromRequest } from "./auth-utils";
import { SESSION_COOKIE_NAME, validateSession } from "./session";

export interface UserInfo {
  id: string;
  nickname: string;
  email: string;
}

/**
 * 从 Next.js cookies 中获取用户信息
 */
export async function getUserFromCookies(): Promise<UserInfo | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    const sessionInfo = await validateSession(sessionCookie.value);
    if (sessionInfo) {
      return {
        id: sessionInfo.user.id,
        nickname: sessionInfo.user.name || sessionInfo.user.email.split("@")[0],
        email: sessionInfo.user.email,
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
    const adminEmail = getAdminEmail();
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
    const adminEmail = getAdminEmail();
    const emailHeaderName = getSsoEmailHeaderName();

    const emailFromHeader = headers.get(emailHeaderName);
    return Boolean(emailFromHeader && emailFromHeader === adminEmail);
  } catch {
    // Configuration not available (e.g., during prerender)
    return false;
  }
}

/**
 * 从 Next.js cookies 中检查当前用户是否为管理员
 */
export async function isAdminFromCookies(): Promise<boolean> {
  const user = await getUserFromCookies();
  return user ? isAdmin(user.email) : false;
}

/**
 * 从请求头和 cookies 中提取统一的认证结果
 * 用于需要根据是否登录/是否管理员做细分处理的场景
 */
export async function getAuthFromHeaders(headers: Headers): Promise<AuthResult> {
  // 创建一个模拟的 Request 对象来复用 auth-utils 的逻辑
  const cookieStore = await cookies();
  const cookiePairs: string[] = [];

  // 获取 session cookie（主要的认证 cookie）
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (sessionCookie?.value) {
    cookiePairs.push(`${SESSION_COOKIE_NAME}=${sessionCookie.value}`);
  }

  const mockRequest = new Request("http://localhost", {
    headers: new Headers(headers),
  });

  if (cookiePairs.length > 0) {
    mockRequest.headers.set("cookie", cookiePairs.join("; "));
  }

  return extractAuthFromRequest(mockRequest);
}

/**
 * 综合检查当前用户是否为管理员（支持 cookies 和 headers）
 * 使用统一的认证逻辑
 */
export async function isAdminFromRequest(headers: Headers): Promise<boolean> {
  const auth = await getAuthFromHeaders(headers);
  return auth.isAdmin;
}

/**
 * 重定向到管理员登录页面的响应
 */
export function redirectToAdminLogin(): Response {
  // 当前不再提供公开的后台登录页面，
  // 仍有调用方使用该方法时统一返回 403。
  return forbiddenResponse();
}

/**
 * 重定向到登录页面的响应
 */
export function redirectToLogin(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/?login=required",
    },
  });
}

/**
 * 返回403禁止访问的响应
 */
export function forbiddenResponse(): Response {
  return new Response("Forbidden: Admin access required", {
    status: 403,
  });
}
