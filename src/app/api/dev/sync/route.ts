import { NextResponse } from "next/server";
import { getContentSourceManager } from "@/lib/content-sources";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "forbidden in production" }, { status: 403 });
  }
  try {
    const manager = getContentSourceManager();
    const result = await manager.syncAll();
    return NextResponse.json({ ok: true, stats: result?.stats ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
