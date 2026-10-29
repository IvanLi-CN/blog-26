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
const originalPublicSiteUrl = process.env.PUBLIC_SITE_URL;
const originalPublicCorsAllowedOrigins = process.env.PUBLIC_CORS_ALLOWED_ORIGINS;
const adminEmail = "public-frontend-admin@test.local";

function cookieNames(cookies: string[]) {
  return cookies.map((cookie) => cookie.slice(0, cookie.indexOf("=")));
}

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
    if (originalPublicSiteUrl === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = originalPublicSiteUrl;
    if (originalPublicCorsAllowedOrigins === undefined)
      delete process.env.PUBLIC_CORS_ALLOWED_ORIGINS;
    else process.env.PUBLIC_CORS_ALLOWED_ORIGINS = originalPublicCorsAllowedOrigins;
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
    const bootstrapCookies = bootstrap.headers.getSetCookie();
    expect(bootstrapCookies).toHaveLength(2);
    expect(cookieNames(bootstrapCookies)).toEqual(["frontend_session_id", "frontend_logout"]);
    const sessionCookie = bootstrapCookies
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
    const logoutCookies = logout.headers.getSetCookie();
    expect(logoutCookies).toHaveLength(2);
    expect(cookieNames(logoutCookies)).toEqual(["frontend_session_id", "frontend_logout"]);
    expect(logoutCookies[1]).toContain("frontend_logout=1");
  });

  it("keeps frontend identity across configured public and Console origins", async () => {
    process.env.PUBLIC_SITE_URL = "https://public.example.test";
    process.env.PUBLIC_CORS_ALLOWED_ORIGINS = "https://console.example.test";

    const bootstrap = await handlePublicApiRequest(
      new Request("https://public.example.test/api/public/frontend-auth/bootstrap", {
        method: "POST",
        headers: {
          origin: "https://public.example.test",
          "Remote-Email": adminEmail,
        },
      }),
      "/frontend-auth/bootstrap"
    );
    expect(bootstrap.status).toBe(200);
    const bootstrapCookies = bootstrap.headers.getSetCookie();
    expect(bootstrapCookies).toHaveLength(2);
    expect(cookieNames(bootstrapCookies)).toEqual(["frontend_session_id", "frontend_logout"]);
    const sessionCookie = bootstrapCookies
      .find((cookie) => cookie.startsWith("frontend_session_id="))
      ?.split(";", 1)[0];
    expect(sessionCookie).toBeTruthy();
    expect(bootstrapCookies[0]).toContain("SameSite=Lax");

    const consoleMe = await handlePublicApiRequest(
      new Request("https://console.example.test/api/public/frontend-auth/me", {
        headers: {
          origin: "https://public.example.test",
          cookie: sessionCookie as string,
        },
      }),
      "/frontend-auth/me"
    );
    expect(consoleMe.status).toBe(200);
    expect(await consoleMe.json()).toMatchObject({
      authenticated: true,
      principal: { kind: "admin" },
    });

    const consoleLogout = await handlePublicApiRequest(
      new Request("https://console.example.test/api/public/frontend-auth/logout", {
        method: "POST",
        headers: {
          origin: "https://public.example.test",
          cookie: sessionCookie as string,
        },
      }),
      "/frontend-auth/logout"
    );
    expect(consoleLogout.status).toBe(200);
    const consoleLogoutCookies = consoleLogout.headers.getSetCookie();
    expect(consoleLogoutCookies).toHaveLength(2);
    expect(cookieNames(consoleLogoutCookies)).toEqual(["frontend_session_id", "frontend_logout"]);
    expect(consoleLogoutCookies[0]).toContain("SameSite=None");
    expect(consoleLogoutCookies[0]).toContain("Secure");

    const rejected = await handlePublicApiRequest(
      new Request("https://console.example.test/api/public/frontend-auth/bootstrap", {
        method: "POST",
        headers: { origin: "https://evil.example.test", "Remote-Email": adminEmail },
      }),
      "/frontend-auth/bootstrap"
    );
    expect(rejected.status).toBe(403);
  });
});
