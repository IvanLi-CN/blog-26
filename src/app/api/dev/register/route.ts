/**
 * 特权注册接口
 *
 * 仅在开发环境和测试环境中启用的特权认证接口
 * 允许直接创建新用户账号并自动登录，无需验证码
 *
 * 安全限制：
 * - 仅在 NODE_ENV=development 或 NODE_ENV=test 时启用
 * - 生产环境返回 404 错误
 *
 * @route POST /api/dev/register
 * @param {string} nickname - 用户昵称
 * @param {string} email - 用户邮箱地址
 * @returns {Object} 注册结果和用户信息
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
 * 验证昵称
 */
function validateNickname(nickname: string): boolean {
  return nickname && nickname.trim().length > 0 && nickname.trim().length <= 50;
}

/**
 * 特权注册处理函数
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
    console.warn("🔧 [DEV-AUTH] 特权注册接口被调用 - 仅限开发/测试环境使用");

    // 解析请求体
    const body = await request.json();
    const { nickname, email } = body;

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

    if (!nickname || typeof nickname !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "请提供昵称",
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

    // 昵称验证
    if (!validateNickname(nickname)) {
      return NextResponse.json(
        {
          success: false,
          error: "昵称不能为空且长度不能超过50个字符",
        },
        { status: 400 }
      );
    }

    // 检查邮箱是否已存在
    const existingUser = await db.select().from(users).where(eq(users.email, email)).get();

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: "该邮箱已被注册，请使用其他邮箱或尝试登录",
        },
        { status: 409 }
      );
    }

    // 创建新用户
    const userId = uuidv4();
    const trimmedNickname = nickname.trim();

    await db.insert(users).values({
      id: userId,
      email,
      name: trimmedNickname,
      createdAt: Date.now(),
    });

    // 查询创建的用户
    const newUser = await db.select().from(users).where(eq(users.email, email)).get();

    if (!newUser) {
      throw new Error("Failed to create user");
    }

    console.log(`🔧 [DEV-AUTH] 特权注册新用户: ${email} (${trimmedNickname})`);

    // 创建新的session
    const deviceInfo = extractDeviceInfo(request);
    const ipAddress = extractIpAddress(request);

    const session = await createSession({
      userId: newUser.id,
      deviceInfo,
      ipAddress,
    });

    // 准备响应数据
    const responseData = {
      success: true,
      message: "特权注册成功",
      user: {
        id: newUser.id,
        nickname: newUser.name || newUser.email.split("@")[0],
        email: newUser.email,
        avatarUrl: getAvatarUrl(newUser.email),
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
    console.error("🔧 [DEV-AUTH] 特权注册失败:", error);

    return NextResponse.json(
      {
        success: false,
        error: "注册失败，请稍后重试",
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
