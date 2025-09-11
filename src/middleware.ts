import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  try {
    const emailHeaderName = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";
    const headers = request.headers;

    const forwardedEmail =
      headers.get(emailHeaderName) ||
      headers.get(emailHeaderName.toLowerCase()) ||
      headers.get("Remote-Email") ||
      headers.get("remote-email") ||
      headers.get("x-forwarded-email") ||
      null;

    const adminEmail = process.env.ADMIN_EMAIL || "";
    const isAdmin = Boolean(adminEmail && forwardedEmail && forwardedEmail === adminEmail);

    const url = new URL(request.url);
    console.log(
      `➡️  [MW] ${request.method} ${url.pathname}${url.search} | ${emailHeaderName}=` +
        `${forwardedEmail ?? "<none>"} | isAdmin=${isAdmin}`
    );
  } catch (e) {
    console.warn("Middleware logging failed:", e);
  }

  return NextResponse.next();
}

export const config = {
  // 默认匹配所有路径（静态资源等由 Next 优化后可能不触发）
};
