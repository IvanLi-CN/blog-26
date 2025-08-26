/**
 * 特权登录接口
 *
 * 仅在开发环境和测试环境中启用的特权认证接口
 * 允许通过邮箱地址直接登录，无需密码验证
 *
 * 安全限制：
 * - 仅在 NODE_ENV=development 或 NODE_ENV=test 时启用
 * - 生产环境返回 404 错误
 *
 * @route POST /api/dev/login
 * @param {string} email - 用户邮箱地址
 * @returns {Object} 登录结果和用户信息
 */

import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getAvatarUrl } from "@/lib/avatar";
import { db, initializeDB } from "@/lib/db";
import { users } from "@/lib/schema";
import {
  createSession,
  extractDeviceInfo,
  extractIpAddress,
  SESSION_COOKIE_NAME,
} from "@/lib/session";

/**
 * 检查是否为开发环境
 * 生产环境返回 404 错误，不暴露接口存在
 */
function checkDevEnvironment(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  return null;
}

/**
 * 验证邮箱格式
 */
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 特权登录处理函数
 */
export async function POST(request: NextRequest) {
  try {
    // 环境检查 - 生产环境直接返回 404
    const envCheck = checkDevEnvironment();
    if (envCheck) {
      return envCheck;
    }

    // 初始化数据库
    await initializeDB();

    // 添加开发环境警告日志
    console.warn("🔧 [DEV-AUTH] 特权登录接口被调用 - 仅限开发/测试环境使用");

    // 解析请求体
    const body = await request.json();
    const { email } = body;

    // 参数验证
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "请提供邮箱地址",
        },
        { status: 400 }
      );
    }

    // 邮箱格式验证
    if (!validateEmail(email)) {
      return NextResponse.json(
        {
          success: false,
          error: "请提供有效的邮箱地址",
        },
        { status: 400 }
      );
    }

    // 查找现有用户
    let user = await db.select().from(users).where(eq(users.email, email)).get();

    // 如果用户不存在，自动创建
    if (!user) {
      const userId = uuidv4();
      const defaultName = email.split("@")[0]; // 使用邮箱前缀作为默认昵称

      await db.insert(users).values({
        id: userId,
        email,
        name: defaultName,
        createdAt: Date.now(),
      });

      // 重新查询创建的用户
      user = await db.select().from(users).where(eq(users.email, email)).get();

      if (!user) {
        throw new Error("Failed to create or find user");
      }

      console.log(`🔧 [DEV-AUTH] 自动创建新用户: ${email}`);
    } else {
      console.log(`🔧 [DEV-AUTH] 用户登录: ${email}`);
    }

    // 创建新的session
    const deviceInfo = extractDeviceInfo(request);
    const ipAddress = extractIpAddress(request);

    const session = await createSession({
      userId: user.id,
      deviceInfo,
      ipAddress,
    });

    // 准备响应数据
    const responseData = {
      success: true,
      message: "特权登录成功",
      user: {
        id: user.id,
        nickname: user.name || user.email.split("@")[0],
        email: user.email,
        avatarUrl: getAvatarUrl(user.email),
      },
    };

    // 创建响应并设置 Session Cookie
    const response = NextResponse.json(responseData);
    response.cookies.set(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7天
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("🔧 [DEV-AUTH] 特权登录失败:", error);

    return NextResponse.json(
      {
        success: false,
        error: "登录失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}

/**
 * 其他 HTTP 方法返回 405 Method Not Allowed
 */
export async function GET() {
  const envCheck = checkDevEnvironment();
  if (envCheck) {
    return envCheck;
  }

  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
