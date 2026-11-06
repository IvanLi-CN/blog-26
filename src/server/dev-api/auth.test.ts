import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { sessions } from "@/lib/schema";
import { handleDevApiRequest } from "./router";

const directory = mkdtempSync(join(tmpdir(), "blog-dev-auth-"));
const originalEnv = {
  DB_PATH: process.env.DB_PATH,
  NODE_ENV: process.env.NODE_ENV,
  ENABLE_DEV_ENDPOINTS: process.env.ENABLE_DEV_ENDPOINTS,
};
let serial = 0;
const email = () => `dev-auth-${serial++}@example.test`;
function request(route: "login" | "register", body?: unknown, method = "POST") {
  return handleDevApiRequest(
    new Request(`http://localhost/api/dev/${route}`, {
      method,
      ...(method === "POST"
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    }),
    route
  );
}

beforeAll(async () => {
  process.env.DB_PATH = join(directory, "auth.sqlite");
  process.env.NODE_ENV = "test";
  delete process.env.ENABLE_DEV_ENDPOINTS;
  const sqlite = new Database(process.env.DB_PATH);
  try {
    migrate(drizzle(sqlite), { migrationsFolder: resolve("drizzle") });
  } finally {
    sqlite.close();
  }
  await initializeDB(true);
});
afterAll(() => {
  db.$client.close();
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(directory, { recursive: true, force: true });
});

describe("development auth HTTP contracts with real SQLite", () => {
  for (const route of ["login", "register"] as const) {
    test(`${route}: GET is rejected`, async () => {
      expect((await request(route, undefined, "GET")).status).toBe(405);
    });
    test(`${route}: successful response creates a persisted session and protected cookie`, async () => {
      const address = email();
      const response = await request(route, { email: address, nickname: "DevTestUser" });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({ success: true, user: { email: address } });
      if (route === "register") expect(body.user.nickname).toBe("DevTestUser");
      const cookie = response.headers.get("set-cookie");
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Max-Age=604800");
      const sessionId = decodeURIComponent(cookie!.split(";", 1)[0].split("=")[1]);
      const persisted = await db.select().from(sessions);
      expect(persisted.find((session) => session.id === sessionId)?.userId).toBe(body.user.id);
    });
    test(`${route}: invalid email is rejected`, async () => {
      const response = await request(route, { email: "invalid-email", nickname: "DevTestUser" });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        success: false,
        error: "请提供有效的邮箱地址",
      });
    });
    test(`${route}: missing email is rejected`, async () => {
      const response = await request(route, { nickname: "DevTestUser" });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ success: false });
    });
    test(`${route}: production denies access unless explicitly enabled`, async () => {
      process.env.NODE_ENV = "production";
      try {
        expect((await request(route, { email: email(), nickname: "DevTestUser" })).status).toBe(
          404
        );
        process.env.ENABLE_DEV_ENDPOINTS = "true";
        expect((await request(route, { email: email(), nickname: "DevTestUser" })).status).toBe(
          200
        );
      } finally {
        process.env.NODE_ENV = "test";
        delete process.env.ENABLE_DEV_ENDPOINTS;
      }
    });
  }
  for (const nickname of [undefined, "", "   "]) {
    test(`registration rejects nickname ${JSON.stringify(nickname)}`, async () => {
      const response = await request("register", { email: email(), nickname });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        success: false,
        error: nickname === "   " ? "昵称不能为空且长度不能超过50个字符" : "请提供昵称",
      });
    });
  }
  test("duplicate registration conflicts and login preserves the registered identity", async () => {
    const address = email();
    const registered = await request("register", { email: address, nickname: "RegisteredUser" });
    expect(registered.status).toBe(200);
    const identity = (await registered.json()).user;
    const duplicate = await request("register", { email: address, nickname: "AnotherUser" });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      success: false,
      error: "该邮箱已被注册，请使用其他邮箱或尝试登录",
    });
    const login = await request("login", { email: address });
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ success: true, user: identity });
  });
});
