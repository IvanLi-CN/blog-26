import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const h = await headers();
  const headerName = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";
  return NextResponse.json({
    headerName,
    received: h.get(headerName) || null,
    all: {
      "remote-email": h.get("remote-email"),
      "Remote-Email": h.get("Remote-Email"),
      "REMOTE-EMAIL": h.get("REMOTE-EMAIL"),
      "x-forwarded-for": h.get("x-forwarded-for"),
      host: h.get("host"),
    },
  });
}
