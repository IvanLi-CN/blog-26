/**
 * Development Configuration API
 *
 * Provides configuration information for development tools
 * Only accessible in development and test environments
 *
 * Security restrictions:
 * - Only enabled when NODE_ENV=development or NODE_ENV=test
 * - Returns 404 in production environment
 */

import { NextResponse } from "next/server";

/**
 * Check if development environment
 * Return 404 error in production to not expose interface existence
 */
function checkDevEnvironment(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  return null;
}

/**
 * Get development configuration
 */
export async function GET() {
  try {
    // Environment check - return 404 directly in production
    const envCheck = checkDevEnvironment();
    if (envCheck) {
      return envCheck;
    }

    // Log development environment warning
    console.warn("🔧 [DEV-CONFIG] Configuration API accessed - Development/Test environment only");

    // Get admin email from environment variables
    const adminEmail = process.env.ADMIN_EMAIL || null;

    return NextResponse.json({
      success: true,
      adminEmail,
      environment: process.env.NODE_ENV,
    });
  } catch (error) {
    console.error("🔧 [DEV-CONFIG] Configuration fetch failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch configuration",
      },
      { status: 500 }
    );
  }
}

/**
 * Other HTTP methods return 405 Method Not Allowed
 */
export async function POST() {
  const envCheck = checkDevEnvironment();
  if (envCheck) {
    return envCheck;
  }

  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function PUT() {
  const envCheck = checkDevEnvironment();
  if (envCheck) {
    return envCheck;
  }

  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function DELETE() {
  const envCheck = checkDevEnvironment();
  if (envCheck) {
    return envCheck;
  }

  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
