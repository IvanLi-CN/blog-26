import { and, eq, gt, lt, ne } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, initializeDB } from "./db";
import { sessions, users } from "./schema";

// Session 配置
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7天 (毫秒)
export const SESSION_COOKIE_NAME = "session_id";

export interface SessionInfo {
  id: string;
  userId: string;
  deviceInfo?: string;
  ipAddress?: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface UserSessionInfo extends SessionInfo {
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface CreateSessionOptions {
  userId: string;
  deviceInfo?: string;
  ipAddress?: string;
  duration?: number; // 自定义过期时间（毫秒）
}

/**
 * 创建新的用户session
 * 支持多设备登录，每次登录都创建新的session
 */
export async function createSession(options: CreateSessionOptions): Promise<SessionInfo> {
  const { userId, deviceInfo, ipAddress, duration = SESSION_DURATION } = options;

  // 确保数据库已初始化
  if (!db) {
    await initializeDB();
  }

  const now = Date.now();
  const sessionId = uuidv4();
  const expiresAt = now + duration;

  const sessionData = {
    id: sessionId,
    userId,
    deviceInfo: deviceInfo || null,
    ipAddress: ipAddress || null,
    expiresAt,
    createdAt: now,
    updatedAt: now,
    isActive: true,
  };

  await db.insert(sessions).values(sessionData);

  return {
    ...sessionData,
    deviceInfo: sessionData.deviceInfo || undefined,
    ipAddress: sessionData.ipAddress || undefined,
  };
}

/**
 * 验证session是否有效
 * 如果有效，返回session信息；如果无效，返回null
 */
export async function validateSession(sessionId: string): Promise<UserSessionInfo | null> {
  if (!sessionId) {
    return null;
  }

  try {
    // 确保数据库已初始化
    if (!db) {
      await initializeDB();
    }

    const now = Date.now();

    // 查询session和关联的用户信息
    const result = await db
      .select({
        session: sessions,
        user: users,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.isActive, true),
          gt(sessions.expiresAt, now) // 检查是否过期
        )
      )
      .get();

    if (!result) {
      return null;
    }

    const { session, user } = result;

    return {
      id: session.id,
      userId: session.userId,
      deviceInfo: session.deviceInfo || undefined,
      ipAddress: session.ipAddress || undefined,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isActive: session.isActive,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || undefined,
      },
    };
  } catch (error) {
    console.error("Session validation error:", error);
    return null;
  }
}

/**
 * 更新session的最后活跃时间
 * 实现滑动过期机制
 */
export async function updateSessionActivity(sessionId: string): Promise<boolean> {
  if (!sessionId) {
    return false;
  }

  try {
    // 确保数据库已初始化
    if (!db) {
      await initializeDB();
    }

    const now = Date.now();

    await db
      .update(sessions)
      .set({ updatedAt: now })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.isActive, true),
          gt(sessions.expiresAt, now) // 只更新未过期的session
        )
      );

    return true;
  } catch (error) {
    console.error("Update session activity error:", error);
    return false;
  }
}

/**
 * 删除特定的session（用户登出）
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  if (!sessionId) {
    return false;
  }

  try {
    // 确保数据库已初始化
    if (!db) {
      await initializeDB();
    }

    await db
      .update(sessions)
      .set({ isActive: false, updatedAt: Date.now() })
      .where(eq(sessions.id, sessionId));

    return true;
  } catch (error) {
    console.error("Delete session error:", error);
    return false;
  }
}

/**
 * 删除用户的所有其他session（踢出其他设备）
 */
export async function deleteOtherUserSessions(
  userId: string,
  currentSessionId: string
): Promise<number> {
  try {
    // 确保数据库已初始化
    if (!db) {
      await initializeDB();
    }

    await db
      .update(sessions)
      .set({ isActive: false, updatedAt: Date.now() })
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.isActive, true),
          // 不删除当前session
          ne(sessions.id, currentSessionId)
        )
      );

    return 1; // 简化返回值
  } catch (error) {
    console.error("Delete other user sessions error:", error);
    return 0;
  }
}

/**
 * 获取用户的所有活跃session
 */
export async function getUserSessions(userId: string): Promise<SessionInfo[]> {
  try {
    // 确保数据库已初始化
    if (!db) {
      await initializeDB();
    }

    const now = Date.now();

    const results = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          eq(sessions.isActive, true),
          gt(sessions.expiresAt, now) // 只返回未过期的session
        )
      )
      .orderBy(sessions.updatedAt);

    return results.map((session) => ({
      id: session.id,
      userId: session.userId,
      deviceInfo: session.deviceInfo || undefined,
      ipAddress: session.ipAddress || undefined,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      isActive: session.isActive,
    }));
  } catch (error) {
    console.error("Get user sessions error:", error);
    return [];
  }
}

/**
 * 清理过期的session记录
 * 建议定期调用此函数进行清理
 */
export async function cleanupExpiredSessions(): Promise<number> {
  try {
    // 确保数据库已初始化
    if (!db) {
      await initializeDB();
    }

    const now = Date.now();

    await db
      .update(sessions)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(sessions.isActive, true),
          lt(sessions.expiresAt, now) // 已过期的session
        )
      );

    console.log("Cleaned up expired sessions");

    return 1; // 简化返回值
  } catch (error) {
    console.error("Cleanup expired sessions error:", error);
    return 0;
  }
}

/**
 * 从请求中提取设备信息
 */
export function extractDeviceInfo(request: Request): string {
  const userAgent = request.headers.get("user-agent") || "Unknown Device";

  // 简单的设备信息提取
  if (userAgent.includes("Mobile")) {
    return `Mobile Device (${userAgent.split(" ")[0]})`;
  } else if (userAgent.includes("Chrome")) {
    return `Chrome Browser`;
  } else if (userAgent.includes("Firefox")) {
    return `Firefox Browser`;
  } else if (userAgent.includes("Safari")) {
    return `Safari Browser`;
  } else {
    return `Desktop Browser`;
  }
}

/**
 * 从请求中提取IP地址
 */
export function extractIpAddress(request: Request): string {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

// 导出常量
export { SESSION_DURATION };
