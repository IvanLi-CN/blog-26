import { NextResponse } from "next/server";
import { getContentSourceManager } from "@/lib/content-sources";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "forbidden in production" }, { status: 403 });
  }
  try {
    const manager = getContentSourceManager();
    const url = new URL(request.url);
    const full = ["1", "true", "yes"].includes((url.searchParams.get("full") || "").toLowerCase());
    const result = await manager.syncAll(full);
    return NextResponse.json({ ok: true, stats: result?.stats ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
