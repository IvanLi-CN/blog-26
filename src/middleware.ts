import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  try {
    const emailHeaderName = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";
    const headers = request.headers;

    // 依次尝试若干可能的邮箱头，并记录命中的是哪个
    const candidateHeaders = [
      emailHeaderName,
      emailHeaderName.toLowerCase(),
      "Remote-Email",
      "remote-email",
      "x-forwarded-email",
    ];
    let forwardedEmail: string | null = null;
    let matchedEmailHeader: string | null = null;
    for (const key of candidateHeaders) {
      const val = headers.get(key);
      if (val) {
        forwardedEmail = val;
        matchedEmailHeader = key;
        break;
      }
    }

    const adminEmail = process.env.ADMIN_EMAIL || "";
    const isAdmin = Boolean(adminEmail && forwardedEmail && forwardedEmail === adminEmail);

    const url = new URL(request.url);
    console.log(
      `➡️  [MW] ${request.method} ${url.pathname}${url.search} | ForwardEmail(${emailHeaderName})=` +
        `${forwardedEmail ?? "<none>"} | matchedHeader=${matchedEmailHeader ?? "<none>"} | isAdmin=${isAdmin}`
    );

    // 打印所有请求头（Edge/中间件环境），帮助定位大小写/转发链
    try {
      const allHeaderEntries = Array.from(headers.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      );
      console.log("🧾 [MW] 请求头:");
      for (const [k, v] of allHeaderEntries) {
        console.log(`   ${k}: ${v}`);
      }
    } catch (e) {
      console.warn("[MW] 打印请求头失败:", e);
    }
  } catch (e) {
    console.warn("Middleware logging failed:", e);
  }

  return NextResponse.next();
}

export const config = {
  // 默认匹配所有路径（静态资源等由 Next 优化后可能不触发）
};
