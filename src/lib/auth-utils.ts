import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, initializeDB } from "./db";
import { users } from "./schema";
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
  let isAdmin = false; // 默认不是管理员

  console.log("🔍 [AUTH-UTILS] 开始权限检查, 默认 isAdmin=false");

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

  // 2. 检查是否为管理员/用户（从 Traefik/SSO headers 或配置）
  const emailHeaderName = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";
  const remoteEmail = request.headers.get(emailHeaderName);

  // 如果有 Traefik/SSO 传递的邮箱信息，优先基于邮箱识别用户，并判断管理员
  if (remoteEmail) {
    const adminEmail = process.env.ADMIN_EMAIL;
    console.log("🔍 [AUTH-UTILS] Traefik/SSO 权限检查:", {
      remoteEmail,
      adminEmail,
      adminEmailSet: !!adminEmail,
      isMatch: adminEmail ? remoteEmail === adminEmail : false,
    });
    // 只有当 ADMIN_EMAIL 明确设置且匹配时才认为是管理员
    isAdmin = adminEmail ? remoteEmail === adminEmail : false;

    // 如果还没有从 Cookie 中识别出用户，则尝试从数据库查找或创建
    if (!user) {
      try {
        if (!db) {
          await initializeDB();
        }

        let dbUser = await db.select().from(users).where(eq(users.email, remoteEmail)).get();

        if (!dbUser) {
          const userId = uuidv4();
          await db.insert(users).values({
            id: userId,
            email: remoteEmail,
            name: remoteEmail.split("@")[0],
            createdAt: Date.now(),
          });

          dbUser = await db.select().from(users).where(eq(users.email, remoteEmail)).get();
        }

        if (dbUser) {
          user = {
            id: dbUser.id,
            nickname: dbUser.name || dbUser.email.split("@")[0],
            email: dbUser.email,
            avatarUrl: undefined,
          };
        }
      } catch (err) {
        console.warn("Header-based user lookup/creation failed:", err);
        // 回退到最小可用信息（无 DB 的情况下仍允许识别请求态用户）
        user = {
          id: "header-user",
          nickname: remoteEmail.split("@")[0],
          email: remoteEmail,
        };
      }
    }
  }

  // 如果有用户但还没有确定管理员状态，检查用户邮箱是否为管理员邮箱
  if (user && !isAdmin) {
    const adminEmail = process.env.ADMIN_EMAIL;
    console.log("🔍 [AUTH-UTILS] 权限检查:", {
      userEmail: user.email,
      adminEmail,
      adminEmailSet: !!adminEmail,
      isMatch: adminEmail && user.email === adminEmail,
    });

    // 只有当 ADMIN_EMAIL 明确设置且匹配时才认为是管理员
    if (adminEmail && user.email === adminEmail) {
      isAdmin = true;
      console.log("✅ [AUTH-UTILS] 用户被识别为管理员");
    } else {
      console.log("❌ [AUTH-UTILS] 用户不是管理员 (ADMIN_EMAIL未设置或不匹配)");
    }
  }

  console.log("🔍 [AUTH-UTILS] 最终权限结果:", {
    hasUser: !!user,
    userEmail: user?.email,
    isAdmin,
  });

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
