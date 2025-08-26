import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { sessions } from "@/lib/schema";

/**
 * 使当前session过期API（仅用于测试）
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
    // 获取当前用户的认证信息
    const authInfo = await extractAuthFromRequest(request);

    if (!authInfo) {
      return NextResponse.json({ error: "No active session found" }, { status: 401 });
    }

    // 将所有用户的session设置为过期
    await db
      .update(sessions)
      .set({ expiresAt: Date.now() - 1000 }) // 设置为1秒前过期
      .where(eq(sessions.userId, authInfo.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Expire session error:", error);
    return NextResponse.json({ error: "Failed to expire session" }, { status: 500 });
  }
}
