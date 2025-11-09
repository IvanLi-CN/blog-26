import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth-utils";
import { suggestCategoryIcon, suggestTagIcon } from "@/server/services/tag-icons";

export const dynamic = "force-dynamic";

type SuggestTagIconRequest = {
  type: "tag" | "category";
  name?: string;
  key?: string;
  title?: string;
};

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdminRequest(req))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await req.json()) as SuggestTagIconRequest;
    const type: SuggestTagIconRequest["type"] = body.type;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
