import type { NextRequest } from "next/server";
import { suggestCategoryIcon, suggestTagIcon } from "@/server/services/tag-icons";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type: "tag" | "category" = body.type;
    if (type !== "tag" && type !== "category") {
      return Response.json({ error: "invalid type" }, { status: 400 });
    }
    if (type === "tag") {
      const name = String(body.name || "").trim();
      if (!name) return Response.json({ error: "name required" }, { status: 400 });
      const { candidates, ai } = await suggestTagIcon(name);
      return Response.json({ type, name, candidates, ai });
    } else {
      const key = String(body.key || "").trim();
      const title = body.title ? String(body.title) : undefined;
      if (!key) return Response.json({ error: "key required" }, { status: 400 });
      const { candidates, ai } = await suggestCategoryIcon(key, title);
      return Response.json({ type, key, title, candidates, ai });
    }
  } catch (e: any) {
    return Response.json({ error: e?.message || "failed" }, { status: 500 });
  }
}
