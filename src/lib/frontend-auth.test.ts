import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import {
  bootstrapFrontendAuth,
  frontendAuthMe,
  logoutFrontendAuth,
  startAdminFrontendAuth,
} from "@/lib/frontend-auth";
import { frontendIdentityLinks, frontendSessions, frontendUsers, users } from "@/lib/schema";

const testDbPath = path.join(process.cwd(), "tmp/frontend-auth-test.sqlite");
const migrationsPath = path.resolve("drizzle");
const originalDbPath = process.env.DB_PATH;
const originalAdminEmail = process.env.ADMIN_EMAIL;
const originalNodeEnv = process.env.NODE_ENV;
const adminEmail = "frontend-admin@test.local";

function cookieFromSetCookies(cookies: string[], name: string) {
  return cookies.find((cookie) => cookie.startsWith(`${name}=`))?.split(";", 1)[0] ?? "";
}

function adminRequest(cookie = "") {
  return new Request("http://localhost/api/public/frontend-auth/bootstrap", {
    headers: {
      "Remote-Email": adminEmail,
      ...(cookie ? { cookie } : {}),
    },
  });
}

describe("frontend authentication", () => {
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
    if (!db) throw new Error("Database has not been initialized");
    await db.delete(frontendSessions);
    await db.delete(frontendIdentityLinks);
    await db.delete(frontendUsers);
    await db.delete(users);
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

  it("keeps a valid frontend session after backend auth is absent", async () => {
    const bootstrapped = await bootstrapFrontendAuth(adminRequest());
    expect(bootstrapped.authenticated).toBe(true);
    const sessionCookie = cookieFromSetCookies(bootstrapped.setCookies, "frontend_session_id");
    expect(sessionCookie).toContain("frontend_session_id=");
    expect(bootstrapped.principal).toMatchObject({
      kind: "admin",
      isAdmin: true,
      github: null,
      avatarUrl: "/site-assets/avatar.jpg",
    });

    const frontendOnly = await frontendAuthMe(
      new Request("http://localhost/api/public/frontend-auth/me", {
        headers: { cookie: sessionCookie },
      })
    );
    expect(frontendOnly).toMatchObject({ authenticated: true, loggedOut: false });
    expect(frontendOnly.principal?.id).toBe(bootstrapped.principal?.id);
  });

  it("suppresses bootstrap after explicit logout until admin-start", async () => {
    const initial = await bootstrapFrontendAuth(adminRequest());
    const sessionCookie = cookieFromSetCookies(initial.setCookies, "frontend_session_id");
    const loggedOut = await logoutFrontendAuth(
      new Request("http://localhost/api/public/frontend-auth/logout", {
        headers: { cookie: sessionCookie },
      })
    );
    const logoutCookie = cookieFromSetCookies(loggedOut.setCookies, "frontend_logout");

    const suppressed = await bootstrapFrontendAuth(
      adminRequest(`${logoutCookie}; ${sessionCookie}`)
    );
    expect(suppressed).toMatchObject({
      authenticated: false,
      loggedOut: true,
      bootstrapped: false,
    });

    const restarted = await startAdminFrontendAuth(
      new Request("http://localhost/api/public/frontend-auth/admin-start", {
        headers: { "Remote-Email": adminEmail, cookie: logoutCookie },
      })
    );
    expect(restarted).toMatchObject({ authenticated: true, loggedOut: false, bootstrapped: true });
    expect(restarted.setCookies.some((cookie) => cookie.startsWith("frontend_logout=;"))).toBe(
      true
    );
  });

  it("does not require a GitHub binding for the admin frontend identity", async () => {
    const result = await bootstrapFrontendAuth(adminRequest());
    expect(result.principal?.adminUserId).toBeTruthy();
    expect(
      await db?.select().from(frontendUsers).where(eq(frontendUsers.isAdmin, true)).all()
    ).toHaveLength(1);
  });
});
