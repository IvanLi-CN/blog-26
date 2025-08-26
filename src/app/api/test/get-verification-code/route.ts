import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailVerificationCodes } from "@/lib/schema";

/**
 * 获取验证码API（仅用于测试）
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

    // 获取最新的验证码
    const codeRecord = await db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.email, email))
      .orderBy(emailVerificationCodes.expiresAt)
      .get();

    if (!codeRecord) {
      return NextResponse.json({ error: "No verification code found" }, { status: 404 });
    }

    return NextResponse.json({
      code: codeRecord.code,
      expiresAt: codeRecord.expiresAt,
    });
  } catch (error) {
    console.error("Get verification code error:", error);
    return NextResponse.json({ error: "Failed to get verification code" }, { status: 500 });
  }
}
