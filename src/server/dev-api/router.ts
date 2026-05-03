import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { asc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { WEBDAV_PATHS } from "@/config/paths";
import { getAvatarUrl } from "@/lib/avatar";
import { getContentSourceManager } from "@/lib/content-sources";
import { db, initializeDB } from "@/lib/db";
import { getMemoRootDir, getServerLocalMemoRootDir } from "@/lib/memo-paths";
import { users } from "@/lib/schema";
import {
  createSession,
  extractDeviceInfo,
  extractIpAddress,
  SESSION_COOKIE_NAME,
} from "@/lib/session";

type DevRoute = "login" | "register" | "config" | "users" | "sync" | "test-content";

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function methodNotAllowed() {
  return json({ error: "Method Not Allowed" }, { status: 405 });
}

function checkDevEnvironment() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DEV_ENDPOINTS !== "true") {
    return json({ error: "Not Found" }, { status: 404 });
  }
  return null;
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateNickname(nickname: string) {
  return Boolean(nickname) && nickname.trim().length > 0 && nickname.trim().length <= 50;
}

async function readJson(request: Request) {
  return request.json().catch(() => ({}));
}

function appendSessionCookie(response: Response, sessionId: string) {
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax`
  );
  return response;
}

async function createDevSessionResponse(
  request: Request,
  user: { id: string; email: string; name: string | null },
  message = "特权登录成功"
) {
  const session = await createSession({
    userId: user.id,
    deviceInfo: extractDeviceInfo(request),
    ipAddress: extractIpAddress(request),
  });

  return appendSessionCookie(
    json({
      success: true,
      message,
      user: {
        id: user.id,
        nickname: user.name || user.email.split("@")[0],
        email: user.email,
        avatarUrl: getAvatarUrl(user.email),
      },
    }),
    session.id
  );
}

async function handleLogin(request: Request) {
  if (request.method !== "POST") return methodNotAllowed();

  try {
    await initializeDB();
    const body = await readJson(request);
    const email = body?.email;

    if (!email || typeof email !== "string") {
      return json({ success: false, error: "请提供邮箱地址" }, { status: 400 });
    }
    if (!validateEmail(email)) {
      return json({ success: false, error: "请提供有效的邮箱地址" }, { status: 400 });
    }

    let user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      await db.insert(users).values({
        id: uuidv4(),
        email,
        name: email.split("@")[0],
        createdAt: Date.now(),
      });
      user = await db.select().from(users).where(eq(users.email, email)).get();
      if (!user) throw new Error("Failed to create or find user");
    }

    return createDevSessionResponse(request, user);
  } catch (error) {
    console.error("[dev-api] login failed:", error);
    return json({ success: false, error: "登录失败，请稍后重试" }, { status: 500 });
  }
}

async function handleRegister(request: Request) {
  if (request.method !== "POST") return methodNotAllowed();

  try {
    await initializeDB();
    const body = await readJson(request);
    const { nickname, email } = body ?? {};

    if (!email || typeof email !== "string") {
      return json({ success: false, error: "请提供邮箱地址" }, { status: 400 });
    }
    if (!nickname || typeof nickname !== "string") {
      return json({ success: false, error: "请提供昵称" }, { status: 400 });
    }
    if (!validateEmail(email)) {
      return json({ success: false, error: "请提供有效的邮箱地址" }, { status: 400 });
    }
    if (!validateNickname(nickname)) {
      return json({ success: false, error: "昵称不能为空且长度不能超过50个字符" }, { status: 400 });
    }

    const existingUser = await db.select().from(users).where(eq(users.email, email)).get();
    if (existingUser) {
      return json(
        { success: false, error: "该邮箱已被注册，请使用其他邮箱或尝试登录" },
        { status: 409 }
      );
    }

    await db.insert(users).values({
      id: uuidv4(),
      email,
      name: nickname.trim(),
      createdAt: Date.now(),
    });

    const newUser = await db.select().from(users).where(eq(users.email, email)).get();
    if (!newUser) throw new Error("Failed to create user");

    return createDevSessionResponse(request, newUser, "特权注册成功");
  } catch (error) {
    console.error("[dev-api] register failed:", error);
    return json({ success: false, error: "注册失败，请稍后重试" }, { status: 500 });
  }
}

async function handleConfig(request: Request) {
  if (request.method !== "GET") return methodNotAllowed();
  return json({
    success: true,
    adminEmail: process.env.ADMIN_EMAIL || null,
    environment: process.env.NODE_ENV,
  });
}

async function handleUsers(request: Request) {
  if (request.method !== "GET") return methodNotAllowed();

  try {
    await initializeDB();
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.createdAt));

    return json({ success: true, users: allUsers, count: allUsers.length });
  } catch (error) {
    console.error("[dev-api] users failed:", error);
    return json({ success: false, error: "Failed to fetch users" }, { status: 500 });
  }
}

async function handleSync(request: Request) {
  if (request.method !== "POST") return methodNotAllowed();

  try {
    const manager = getContentSourceManager();
    const url = new URL(request.url);
    const full = ["1", "true", "yes"].includes((url.searchParams.get("full") || "").toLowerCase());
    const result = await manager.syncAll(full);
    return json({ ok: true, stats: result?.stats ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 500 });
  }
}

function todayPrefix() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
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

function getMemoDirForSource(source: "local" | "webdav") {
  return source === "local" ? getServerLocalMemoRootDir() : getMemoRootDir(WEBDAV_PATHS.memos[0]);
}

function writeMemoFile(
  rootDir: string,
  source: "local" | "webdav",
  title: string,
  body: string,
  isPublic: boolean
) {
  const dir = join(rootDir, getMemoDirForSource(source));
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

async function handleTestContent(request: Request) {
  if (request.method !== "POST") return methodNotAllowed();

  const payload = await readJson(request);
  const kind = payload?.kind as "memo";
  const source = payload?.source as "local" | "webdav";
  const title = String(payload?.title || `E2E Memo ${randomUUID().slice(0, 8)}`);
  const body = String(payload?.body || "用于 E2E 删除测试的内容");
  const isPublic = payload?.isPublic !== false;

  if (kind !== "memo" || (source !== "local" && source !== "webdav")) {
    return json({ error: "invalid parameters" }, { status: 400 });
  }

  const rootDir = source === "local" ? resolve("./test-data/local") : resolve("./test-data/webdav");
  const result = writeMemoFile(rootDir, source, title, body, isPublic);
  return json({ ok: true, kind, source, ...result });
}

function routeFromSubPath(subPath: string): DevRoute | null {
  const segment = subPath.replace(/^\/+/, "").split("/")[0];
  if (
    segment === "login" ||
    segment === "register" ||
    segment === "config" ||
    segment === "users" ||
    segment === "sync" ||
    segment === "test-content"
  ) {
    return segment;
  }
  return null;
}

export function handleDevApiRequest(request: Request, subPath: string) {
  const envResponse = checkDevEnvironment();
  if (envResponse) return envResponse;

  const route = routeFromSubPath(subPath);
  if (!route) return json({ error: "Not Found" }, { status: 404 });

  switch (route) {
    case "login":
      return handleLogin(request);
    case "register":
      return handleRegister(request);
    case "config":
      return handleConfig(request);
    case "users":
      return handleUsers(request);
    case "sync":
      return handleSync(request);
    case "test-content":
      return handleTestContent(request);
  }
}
