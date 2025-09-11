import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const h = await headers();
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
    const val = h.get(key);
    if (val) {
      matchedEmailHeader = key;
      forwardedEmail = val;
      break;
    }
  }

  const allHeaders: Record<string, string> = {};
  for (const [k, v] of h.entries()) {
    allHeaders[k] = v;
  }

  return NextResponse.json({
    headerName,
    matchedHeader: matchedEmailHeader,
    forwardedEmail,
    all: allHeaders,
  });
}
