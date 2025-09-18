import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const location = new URL(
    "/feed.xml",
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:25090"
  ).toString();
  const res = NextResponse.redirect(location, 301);
  res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}

export const dynamic = "force-static";
