import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { getServerLocalMemoRootDir } from "@/lib/memo-paths";

function todayPrefix() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
    .replace(/[\s\u4e00-\u9fff]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

function writeMemoFile(rootDir: string, title: string, body: string, isPublic: boolean) {
  const dir = join(rootDir, getServerLocalMemoRootDir());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const slug = slugify(title) || randomUUID().slice(0, 8);
  const filename = `${todayPrefix()}_${slug}.md`;
  const now = new Date().toISOString();
  const frontmatter = [
    `createdAt: ${now}`,
    `updatedAt: ${now}`,
    `publishDate: ${now}`,
    `public: ${isPublic ? "true" : "false"}`,
    "tags:",
    "  - e2e",
    "  - delete-test",
  ].join("\n");
  const content = `---\n${frontmatter}\n---\n\n# ${title}\n\n${body}\n`;
  const filePath = join(dir, filename);
  writeFileSync(filePath, content, "utf-8");
  return { filePath, filename, title, slug };
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "forbidden in production" }, { status: 403 });
  }

  const payload = await req.json().catch(() => ({}));
  const kind = payload?.kind as "memo";
  const source = payload?.source as "local" | "webdav";
  const title = String(payload?.title || `E2E Memo ${randomUUID().slice(0, 8)}`);
  const body = String(payload?.body || "用于 E2E 删除测试的内容");
  const isPublic = payload?.isPublic !== false;

  if (kind !== "memo" || (source !== "local" && source !== "webdav")) {
    return NextResponse.json({ error: "invalid parameters" }, { status: 400 });
  }

  const rootDir = source === "local" ? resolve("./test-data/local") : resolve("./test-data/webdav");
  const result = writeMemoFile(rootDir, title, body, isPublic);
  return NextResponse.json({ ok: true, kind, source, ...result });
}
