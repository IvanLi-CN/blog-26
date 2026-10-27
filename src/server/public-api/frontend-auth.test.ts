import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import { frontendIdentityLinks, frontendSessions, frontendUsers, users } from "@/lib/schema";
import { handlePublicApiRequest } from "@/server/public-api/router";

const testDbPath = path.join(process.cwd(), "tmp/public-frontend-auth-test.sqlite");
const migrationsPath = path.resolve("drizzle");
const originalDbPath = process.env.DB_PATH;
const originalAdminEmail = process.env.ADMIN_EMAIL;
const originalNodeEnv = process.env.NODE_ENV;
const adminEmail = "public-frontend-admin@test.local";

function request(pathname: string, options: RequestInit = {}) {
  return new Request(`http://localhost/api/public${pathname}`, {
    ...options,
    headers: {
      origin: "http://localhost",
      ...(options.headers ?? {}),
    },
  });
}

describe("public frontend auth routes", () => {
  beforeAll(async () => {
    process.env.DB_PATH = testDbPath;
    process.env.ADMIN_EMAIL = adminEmail;
    process.env.NODE_ENV = "test";
    fs.mkdirSync(path.dirname(testDbPath), { recursive: true });
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath);
    const sqlite = new Database(testDbPath);
    migrate(drizzle(sqlite), { migrationsFolder: migrationsPath });
    sqlite.close();
    await initializeDB(true);
  });

  beforeEach(async () => {
    await db?.delete(frontendSessions);
    await db?.delete(frontendIdentityLinks);
    await db?.delete(frontendUsers);
    await db?.delete(users);
  });

  afterAll(() => {
    if (originalDbPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = originalDbPath;
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (fs.existsSync(testDbPath)) fs.rmSync(testDbPath);
  });

  it("exposes independent bootstrap, me, and logout endpoints", async () => {
    const bootstrap = await handlePublicApiRequest(
      request("/frontend-auth/bootstrap", {
        method: "POST",
        headers: { "Remote-Email": adminEmail },
      }),
      "/frontend-auth/bootstrap"
    );
    expect(bootstrap.status).toBe(200);
    expect(await bootstrap.json()).toMatchObject({
      authenticated: true,
      principal: { kind: "admin", avatarUrl: "/site-assets/avatar.jpg" },
    });
    const sessionCookie = bootstrap.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("frontend_session_id="))
      ?.split(";", 1)[0];
    expect(sessionCookie).toBeTruthy();

    const me = await handlePublicApiRequest(
      request("/frontend-auth/me", { headers: { cookie: sessionCookie as string } }),
      "/frontend-auth/me"
    );
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ authenticated: true, loggedOut: false });

    const logout = await handlePublicApiRequest(
      request("/frontend-auth/logout", {
        method: "POST",
        headers: { cookie: sessionCookie as string },
      }),
      "/frontend-auth/logout"
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("frontend_logout=1");
  });
});
