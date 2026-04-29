import { and, eq } from "drizzle-orm";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { emailVerificationCodes, sessions, users } from "@/lib/schema";

type TestRoute =
  | "auth"
  | "cleanup"
  | "env"
  | "expire-session"
  | "get-verification-code"
  | "headers"
  | "session-count";

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function testApiEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DEV_ENDPOINTS === "true";
}

function testOnly() {
  if (process.env.NODE_ENV !== "test") {
    return json({ error: "This endpoint is only available in test environment" }, { status: 403 });
  }
  return null;
}

function nonProductionOnly() {
  if (process.env.NODE_ENV === "production") {
    return json(
      { error: "This endpoint is not available in production environment" },
      { status: 403 }
    );
  }
  return null;
}

async function readJson(request: Request) {
  return request.json().catch(() => ({}));
}

async function handleAuth(request: Request) {
  if (request.method !== "GET") return json({ error: "Method Not Allowed" }, { status: 405 });
  return json(await extractAuthFromRequest(request));
}

async function handleCleanup(request: Request) {
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, { status: 405 });
  const envResponse = testOnly();
  if (envResponse) return envResponse;

  try {
    const { email } = await readJson(request);
    if (!email) return json({ error: "Email is required" }, { status: 400 });

    const user = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
    if (user) {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
    }
    await db.delete(users).where(eq(users.email, email));
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, email));

    return json({ success: true });
  } catch (error) {
    console.error("[test-api] cleanup failed:", error);
    return json({ error: "Failed to cleanup test data" }, { status: 500 });
  }
}

function handleEnv(request: Request) {
  if (request.method !== "GET") return json({ error: "Method Not Allowed" }, { status: 405 });
  const envResponse = nonProductionOnly();
  if (envResponse) return envResponse;

  return json({
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  });
}

async function handleExpireSession(request: Request) {
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, { status: 405 });
  const envResponse = testOnly();
  if (envResponse) return envResponse;

  try {
    const authInfo = await extractAuthFromRequest(request);
    if (!authInfo.user) return json({ error: "No active session found" }, { status: 401 });

    await db
      .update(sessions)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(sessions.userId, authInfo.user.id));

    return json({ success: true });
  } catch (error) {
    console.error("[test-api] expire-session failed:", error);
    return json({ error: "Failed to expire session" }, { status: 500 });
  }
}

async function handleGetVerificationCode(request: Request) {
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, { status: 405 });
  const envResponse = testOnly();
  if (envResponse) return envResponse;

  try {
    const { email } = await readJson(request);
    if (!email) return json({ error: "Email is required" }, { status: 400 });

    const codeRecord = await db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.email, email))
      .orderBy(emailVerificationCodes.expiresAt)
      .get();

    if (!codeRecord) return json({ error: "No verification code found" }, { status: 404 });
    return json({ code: codeRecord.code, expiresAt: codeRecord.expiresAt });
  } catch (error) {
    console.error("[test-api] get-verification-code failed:", error);
    return json({ error: "Failed to get verification code" }, { status: 500 });
  }
}

function handleHeaders(request: Request) {
  if (request.method !== "GET") return json({ error: "Method Not Allowed" }, { status: 405 });

  const headerName = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";
  const candidateHeaders = [
    headerName,
    headerName.toLowerCase(),
    "Remote-Email",
    "remote-email",
    "x-forwarded-email",
  ];
  let matchedEmailHeader: string | null = null;
  let forwardedEmail: string | null = null;

  for (const key of candidateHeaders) {
    const value = request.headers.get(key);
    if (value) {
      matchedEmailHeader = key;
      forwardedEmail = value;
      break;
    }
  }

  const allHeaders: Record<string, string> = {};
  for (const [key, value] of request.headers.entries()) {
    allHeaders[key] = value;
  }

  return json({ headerName, matchedHeader: matchedEmailHeader, forwardedEmail, all: allHeaders });
}

async function handleSessionCount(request: Request) {
  if (request.method !== "POST") return json({ error: "Method Not Allowed" }, { status: 405 });
  const envResponse = testOnly();
  if (envResponse) return envResponse;

  try {
    const { email } = await readJson(request);
    if (!email) return json({ error: "Email is required" }, { status: 400 });

    const sessionCount = await db
      .select({ count: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(users.email, email), eq(sessions.isActive, true)));

    return json({ count: sessionCount.length, email });
  } catch (error) {
    console.error("[test-api] session-count failed:", error);
    return json({ error: "Failed to get session count" }, { status: 500 });
  }
}

function routeFromSubPath(subPath: string): TestRoute | null {
  const segment = subPath.replace(/^\/+/, "").split("/")[0];
  if (
    segment === "auth" ||
    segment === "cleanup" ||
    segment === "env" ||
    segment === "expire-session" ||
    segment === "get-verification-code" ||
    segment === "headers" ||
    segment === "session-count"
  ) {
    return segment;
  }
  return null;
}

export function handleTestApiRequest(request: Request, subPath: string) {
  if (!testApiEnabled()) return json({ error: "Not Found" }, { status: 404 });

  const route = routeFromSubPath(subPath);
  if (!route) return json({ error: "Not Found" }, { status: 404 });

  switch (route) {
    case "auth":
      return handleAuth(request);
    case "cleanup":
      return handleCleanup(request);
    case "env":
      return handleEnv(request);
    case "expire-session":
      return handleExpireSession(request);
    case "get-verification-code":
      return handleGetVerificationCode(request);
    case "headers":
      return handleHeaders(request);
    case "session-count":
      return handleSessionCount(request);
  }
}
