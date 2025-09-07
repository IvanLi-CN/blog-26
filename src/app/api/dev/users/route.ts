/**
 * Development Users API
 *
 * Lists all users for development tools
 * Only accessible in development and test environments
 *
 * Security restrictions:
 * - Only enabled when NODE_ENV=development or NODE_ENV=test
 * - Returns 404 in production environment
 */

import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, initializeDB } from "@/lib/db";
import { users } from "@/lib/schema";

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
 * Get all users
 */
export async function GET() {
  try {
    // Environment check - return 404 directly in production
    const envCheck = checkDevEnvironment();
    if (envCheck) {
      return envCheck;
    }

    // Initialize database
    await initializeDB();

    // Log development environment warning
    console.warn("🔧 [DEV-USERS] Users API accessed - Development/Test environment only");

    // Fetch all users, ordered by creation time (newest first)
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt));

    return NextResponse.json({
      success: true,
      users: allUsers,
      count: allUsers.length,
    });
  } catch (error) {
    console.error("🔧 [DEV-USERS] Users fetch failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch users",
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
