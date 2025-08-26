import { SESSION_COOKIE_NAME, updateSessionActivity, validateSession } from "./session";

export interface AuthResult {
  user?: {
    id: string;
    nickname: string;
    email: string;
    avatarUrl?: string;
  };
  isAdmin: boolean;
}

/**
 * 从请求中提取认证信息
 * 用于非 tRPC 接口的权限验证
 */
export async function extractAuthFromRequest(request: Request): Promise<AuthResult> {
  let user: AuthResult["user"] | undefined;
  let isAdmin = false;

  // 1. 尝试从 Cookie 中获取 session ID
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    const sessionId = cookies[SESSION_COOKIE_NAME];

    if (sessionId) {
      try {
        const sessionInfo = await validateSession(sessionId);
        if (sessionInfo) {
          user = {
            id: sessionInfo.user.id,
            nickname: sessionInfo.user.name || sessionInfo.user.email.split("@")[0],
            email: sessionInfo.user.email,
            avatarUrl: undefined, // 可以后续添加头像URL逻辑
          };

          // 更新session活跃时间
          await updateSessionActivity(sessionId);
        }
      } catch (error) {
        // Invalid or expired session, user remains undefined
        console.warn("Invalid session in auth utils:", error);
      }
    }
  }

  // 2. 检查是否为管理员（从 Traefik headers 或配置）
  let remoteEmail = request.headers.get("Remote-Email");

  // 检查是否为测试模式下的非管理员请求
  const isNonAdminTest =
    request.headers.get("X-Test-Mode") === "non-admin" ||
    request.headers.get("X-Admin-Override") === "false";

  // 在开发环境中，如果设置了ADMIN_MODE环境变量，模拟管理员邮箱头
  // 但如果是非管理员测试模式，则跳过这个逻辑
  if (process.env.ADMIN_MODE === "true" && !remoteEmail && !isNonAdminTest) {
    remoteEmail = process.env.ADMIN_EMAIL || "ivanli2048@gmail.com";
  }

  // 如果有 Traefik 传递的邮箱信息，检查是否为管理员
  if (remoteEmail) {
    const adminEmail = process.env.ADMIN_EMAIL;
    isAdmin = adminEmail ? remoteEmail === adminEmail : false;

    // 如果是管理员且没有用户信息，创建临时用户对象（生产环境和开发环境都需要）
    if (isAdmin && !user) {
      user = {
        id: "admin-header-user",
        nickname: "Admin",
        email: remoteEmail,
      };
    }
  }

  // 如果有用户但还没有确定管理员状态，检查用户邮箱是否为管理员邮箱
  if (user && !isAdmin) {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail && user.email === adminEmail) {
      isAdmin = true;
    }
  }

  return {
    user,
    isAdmin,
  };
}

/**
 * 检查是否为管理员
 */
export async function isAdminRequest(request: Request): Promise<boolean> {
  const auth = await extractAuthFromRequest(request);
  return auth.isAdmin;
}

/**
 * 检查是否已认证
 */
export async function isAuthenticatedRequest(request: Request): Promise<boolean> {
  const auth = await extractAuthFromRequest(request);
  return !!auth.user;
}

/**
 * 简单的 Cookie 解析函数
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name && rest.length > 0) {
      cookies[name] = rest.join("=");
    }
  });

  return cookies;
}

/**
 * 创建未授权响应
 */
export function createUnauthorizedResponse(message: string = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * 创建禁止访问响应
 */
export function createForbiddenResponse(message: string = "Forbidden"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
    },
  });
}
