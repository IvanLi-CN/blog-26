import { type NextRequest, NextResponse } from "next/server";

/**
 * 检查环境变量API（仅用于测试）
 * 仅在测试环境中使用
 */
export async function GET(_request: NextRequest) {
  // 仅在测试和开发环境中允许
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "This endpoint is not available in production environment" },
      { status: 403 }
    );
  }

  try {
    return NextResponse.json({
      NODE_ENV: process.env.NODE_ENV,
      ADMIN_EMAIL: process.env.ADMIN_EMAIL,
      ADMIN_MODE: process.env.ADMIN_MODE,
    });
  } catch (error) {
    console.error("Get env error:", error);
    return NextResponse.json({ error: "Failed to get env" }, { status: 500 });
  }
}
