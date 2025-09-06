import { cookies } from "next/headers";
import { extractAuthFromRequest } from "./auth-utils";
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
    const emailHeaderName = process.env.ADMIN_EMAIL_HEADER_NAME || "Remote-Email";

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
 * 从 Next.js cookies 中检查当前用户是否为管理员
 */
export async function isAdminFromCookies(): Promise<boolean> {
  const user = await getUserFromCookies();
  return user ? isAdmin(user.email) : false;
}

/**
 * 综合检查当前用户是否为管理员（支持 cookies 和 headers）
 * 使用统一的认证逻辑
 */
export async function isAdminFromRequest(headers: Headers): Promise<boolean> {
  // 在开发环境和测试环境中提供管理员权限绕过
  const isDev = process.env.NODE_ENV === "development";
  const isTest = process.env.NODE_ENV === "test";

  if (isDev || isTest) {
    console.log(`🔧 [Auth] ${isDev ? "开发" : "测试"}环境：提供默认管理员权限`);
    return true;
  }

  // 生产环境：创建一个模拟的 Request 对象来复用 auth-utils 的逻辑
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

  const { isAdmin: userIsAdmin } = await extractAuthFromRequest(mockRequest);

  // 使用统一的权限检查逻辑
  return userIsAdmin;
}

/**
 * 重定向到管理员登录页面的响应
 */
export function redirectToAdminLogin(): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin/login",
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
