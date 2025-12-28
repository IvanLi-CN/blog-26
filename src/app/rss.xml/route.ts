import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const location = new URL("/feed.xml", request.url).toString();
  const res = NextResponse.redirect(location, 301);
  res.headers.set("Cache-Control", "public, max-age=86400");
  return res;
}

export const dynamic = "force-static";
