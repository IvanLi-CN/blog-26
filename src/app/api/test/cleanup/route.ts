import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailVerificationCodes, sessions, users } from "@/lib/schema";

/**
 * 测试数据清理API
 * 仅在测试环境中使用
 */
export async function POST(request: NextRequest) {
  // 仅在测试环境中允许
  if (process.env.NODE_ENV !== "test") {
    return NextResponse.json(
      { error: "This endpoint is only available in test environment" },
      { status: 403 }
    );
  }

  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // 获取用户ID
    const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();

    if (user) {
      // 删除用户的sessions
      await db.delete(sessions).where(eq(sessions.userId, user.id));
    }

    // 删除用户
    await db.delete(users).where(eq(users.email, email));

    // 删除验证码
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, email));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Test cleanup error:", error);
    return NextResponse.json({ error: "Failed to cleanup test data" }, { status: 500 });
  }
}
