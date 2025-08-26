import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/schema";

/**
 * 获取用户活跃session数量API（仅用于测试）
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

    // 获取用户的活跃session数量
    const sessionCount = await db
      .select({ count: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(users.email, email), eq(sessions.isActive, true)));

    return NextResponse.json({
      count: sessionCount.length,
      email,
    });
  } catch (error) {
    console.error("Get session count error:", error);
    return NextResponse.json({ error: "Failed to get session count" }, { status: 500 });
  }
}
