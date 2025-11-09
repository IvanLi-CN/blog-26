import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/auth-utils";
import { isValidIconId } from "@/lib/icons/aliases";
import { assignCategoryIcon, assignTagIcon } from "@/server/services/tag-icons";

type AssignTagIconRequest = {
  type: "tag" | "category";
  icon?: string;
  name?: string;
  key?: string;
};

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (!(await isAdminRequest(req))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await req.json()) as AssignTagIconRequest;
    const type: AssignTagIconRequest["type"] = body.type;
    const rawIcon = body.icon;
    const icon = typeof rawIcon === "string" ? rawIcon : "";
    // 允许清除图标：当 icon 为空串或未提供时，写入 null
    const clearing = !icon || icon.trim() === "";
    if (!clearing && !isValidIconId(icon))
      return Response.json({ error: "invalid icon" }, { status: 400 });
    if (type === "tag") {
      const name = String(body.name || "").trim();
      if (!name) return Response.json({ error: "name required" }, { status: 400 });
      await assignTagIcon(name, clearing ? null : icon);
      return Response.json({ ok: true });
    } else if (type === "category") {
      const key = String(body.key || "").trim();
      if (!key) return Response.json({ error: "key required" }, { status: 400 });
      await assignCategoryIcon(key, clearing ? null : icon);
      return Response.json({ ok: true });
    } else {
      return Response.json({ error: "invalid type" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
