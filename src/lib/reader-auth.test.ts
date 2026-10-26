import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import {
  cancelAdminGithubBindingOAuth,
  completeAdminGithubBindingOAuth,
  completeReaderOAuth,
  createAdminGithubBindingStart,
  createReaderOAuthStart,
  getReaderFromRequest,
  getReaderOAuthReturnTo,
  revokeReaderSession,
} from "@/lib/reader-auth";
import {
  adminGithubBindingEvents,
  adminGithubBindings,
  readerOAuthAttempts,
  readerSessions,
  readers,
  users,
} from "@/lib/schema";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/reader-auth-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");
const originalFetch = globalThis.fetch;
const originalEnv = {
  clientId: process.env.GITHUB_READER_CLIENT_ID,
  clientSecret: process.env.GITHUB_READER_CLIENT_SECRET,
  callbackUrl: process.env.GITHUB_READER_CALLBACK_URL,
  publicSiteUrl: process.env.PUBLIC_SITE_URL,
  siteUrl: process.env.SITE_URL,
};

describe("reader OAuth", () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);
    const sqlite = new Database(TEST_DB_PATH);
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();
    await initializeDB(true);
    process.env.GITHUB_READER_CLIENT_ID = "reader-client-id";
    process.env.GITHUB_READER_CLIENT_SECRET = "reader-client-secret";
    process.env.GITHUB_READER_CALLBACK_URL =
      "https://console.example/api/public/reader-auth/github/callback";
    process.env.PUBLIC_SITE_URL = "https://blog.example";
    process.env.SITE_URL = "https://blog.example";
  });

  beforeEach(async () => {
    if (!db) throw new Error("Database has not been initialised");
    await db.delete(readerOAuthAttempts);
    await db.delete(readerSessions);
    await db.delete(readers);
    await db.delete(adminGithubBindingEvents);
    await db.delete(adminGithubBindings);
    await db.delete(users);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(() => {
    process.env.GITHUB_READER_CLIENT_ID = originalEnv.clientId;
    process.env.GITHUB_READER_CLIENT_SECRET = originalEnv.clientSecret;
    process.env.GITHUB_READER_CALLBACK_URL = originalEnv.callbackUrl;
    process.env.PUBLIC_SITE_URL = originalEnv.publicSiteUrl;
    process.env.SITE_URL = originalEnv.siteUrl;
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);
  });

  it("uses PKCE and consumes state once while storing only a session hash", async () => {
    const startRequest = new Request(
      "https://console.example/api/public/reader-auth/github/start",
      { headers: { origin: "https://console.example" } }
    );
    const start = await createReaderOAuthStart(
      startRequest,
      "https://blog.example/posts/demo?draft=1#comments"
    );
    const authorize = new URL(start.location);
    const state = authorize.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(start.cookie).toContain("reader_oauth_state=");
    expect(start.cookie).toContain("SameSite=Lax");

    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) return Response.json({ access_token: "github-token" });
        if (url === "https://api.github.com/user") {
          return Response.json({
            id: 12345,
            login: "reader-demo",
            name: "Reader Demo",
            avatar_url: "https://avatars.example/reader.png",
            html_url: "https://github.com/reader-demo",
          });
        }
        throw new Error(`unexpected OAuth request: ${url}`);
      },
      { preconnect: originalFetch.preconnect }
    ) as typeof fetch;

    const callbackRequest = new Request(
      `https://console.example/api/public/reader-auth/github/callback?state=${state}&code=one`,
      { headers: { cookie: start.cookie.split(";")[0] } }
    );
    const result = await completeReaderOAuth(callbackRequest, state as string, "one");
    expect(result.returnTo).toBe("https://blog.example/posts/demo?draft=1#comments");
    expect(result.cookie).toContain("reader_session_id=");
    expect(result.cookie).toContain("Max-Age=604800");
    expect(result.cookie).toContain("SameSite=Lax");

    const sessionToken = result.cookie.match(/reader_session_id=([^;]+)/)?.[1];
    expect(sessionToken).toBeTruthy();
    const sessionRows = await db?.select().from(readerSessions).all();
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows?.[0]?.tokenHash).not.toBe(sessionToken);

    const authenticated = await getReaderFromRequest(
      new Request("https://console.example/api/public/reader-auth/me", {
        headers: { cookie: `reader_session_id=${sessionToken}` },
      })
    );
    expect(authenticated).toMatchObject({ githubLogin: "reader-demo" });
    await expect(completeReaderOAuth(callbackRequest, state as string, "one")).rejects.toThrow(
      "state is invalid or expired"
    );

    await revokeReaderSession(
      new Request("https://console.example/api/public/reader-auth/logout", {
        headers: { cookie: `reader_session_id=${sessionToken}` },
      })
    );
    expect(
      await getReaderFromRequest(
        new Request("https://console.example/api/public/reader-auth/me", {
          headers: { cookie: `reader_session_id=${sessionToken}` },
        })
      )
    ).toBeNull();
  });

  it("cleans expired OAuth attempts before starting a new authorization", async () => {
    if (!db) throw new Error("Database has not been initialised");
    const now = Date.now();
    await db.insert(readerOAuthAttempts).values([
      {
        id: "expired-unconsumed",
        stateHash: "expired-unconsumed-hash",
        codeVerifier: "expired-verifier",
        returnTo: "/",
        expiresAt: now - 1,
        createdAt: now - 1000,
      },
      {
        id: "expired-consumed",
        stateHash: "expired-consumed-hash",
        codeVerifier: "expired-verifier",
        returnTo: "/",
        expiresAt: now - 1,
        createdAt: now - 1000,
        consumedAt: now - 500,
      },
    ]);

    await createReaderOAuthStart(
      new Request("https://console.example/api/public/reader-auth/github/start"),
      "/"
    );

    expect(await db.select().from(readerOAuthAttempts).all()).toHaveLength(1);
  });

  it("uses the runtime public site when the console build site points at the console", async () => {
    process.env.PUBLIC_SITE_URL = "https://console.example";
    process.env.SITE_URL = "https://blog.example";
    const startRequest = new Request(
      "https://console.example/api/public/reader-auth/github/start",
      { headers: { origin: "https://console.example" } }
    );
    const start = await createReaderOAuthStart(
      startRequest,
      "https://blog.example/memos/demo/#comments"
    );
    const authorize = new URL(start.location);
    const state = authorize.searchParams.get("state");
    expect(state).toBeTruthy();

    const returnTo = await getReaderOAuthReturnTo(
      new Request(`https://console.example/api/public/reader-auth/github/callback?state=${state}`, {
        headers: { cookie: start.cookie.split(";")[0] },
      }),
      state as string
    );
    expect(returnTo).toBe("https://blog.example/memos/demo/#comments");
  });

  it("binds a GitHub identity to the current admin and creates a reader session", async () => {
    if (!db) throw new Error("Database has not been initialised");
    const adminUserId = "admin-github-binding-test";
    await db.insert(users).values({
      id: adminUserId,
      email: "admin-github-binding@test.local",
      name: "Binding Admin",
      createdAt: Date.now(),
    });
    const start = await createAdminGithubBindingStart(
      new Request("https://console.example/api/public/reader-auth/github/binding/start"),
      adminUserId,
      "/admin/github-binding"
    );
    const authorize = new URL(start.location);
    const state = authorize.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(authorize.searchParams.get("scope")).toBeNull();
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(start.cookie).toContain("reader_binding_oauth_state=");

    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) return Response.json({ access_token: "transient-token" });
        if (url === "https://api.github.com/user") {
          return Response.json({
            id: 777001,
            login: "bound-admin",
            name: "Bound Admin",
            avatar_url: "https://avatars.example/bound-admin.png",
            html_url: "https://github.com/bound-admin",
          });
        }
        throw new Error(`unexpected OAuth request: ${url}`);
      },
      { preconnect: originalFetch.preconnect }
    ) as typeof fetch;

    const result = await completeAdminGithubBindingOAuth(
      new Request("https://console.example/api/public/reader-auth/github/callback", {
        headers: { cookie: start.cookie.split(";")[0] },
      }),
      state as string,
      "binding-code",
      adminUserId
    );
    expect(result.reader).toMatchObject({ githubId: "777001", githubLogin: "bound-admin" });
    expect(result.cookie).toContain("reader_session_id=");

    const binding = await db
      .select()
      .from(adminGithubBindings)
      .where(eq(adminGithubBindings.adminUserId, adminUserId))
      .get();
    expect(binding).toMatchObject({ adminUserId, githubId: "777001", githubLogin: "bound-admin" });
    const event = await db
      .select()
      .from(adminGithubBindingEvents)
      .where(eq(adminGithubBindingEvents.adminUserId, adminUserId))
      .get();
    expect(event).toMatchObject({ result: "success", action: "bind", githubId: "777001" });
    expect(JSON.stringify(event)).not.toContain("transient-token");

    const sessionToken = result.cookie.match(/reader_session_id=([^;]+)/)?.[1];
    expect(
      await getReaderFromRequest(
        new Request("https://console.example/api/public/reader-auth/me", {
          headers: { cookie: `reader_session_id=${sessionToken}` },
        })
      )
    ).toMatchObject({ githubId: "777001" });

    await expect(
      completeAdminGithubBindingOAuth(
        new Request("https://console.example/api/public/reader-auth/github/callback", {
          headers: { cookie: start.cookie.split(";")[0] },
        }),
        state as string,
        "binding-code",
        adminUserId
      )
    ).rejects.toMatchObject({ code: "replayed" });
  });

  it("audits cancelled, expired, mismatched, and conflicting binding attempts", async () => {
    if (!db) throw new Error("Database has not been initialised");
    const adminUserId = "admin-binding-failure-test";
    const otherAdminId = "other-binding-owner";
    await db.insert(users).values([
      {
        id: adminUserId,
        email: "admin-binding-failure@test.local",
        name: "Binding Admin",
        createdAt: Date.now(),
      },
      {
        id: otherAdminId,
        email: "other-binding-owner@test.local",
        name: "Other Admin",
        createdAt: Date.now(),
      },
    ]);

    const cancelled = await createAdminGithubBindingStart(
      new Request("https://console.example/api/public/reader-auth/github/binding/start"),
      adminUserId,
      "/admin/github-binding"
    );
    const cancelledState = new URL(cancelled.location).searchParams.get("state") as string;
    await cancelAdminGithubBindingOAuth(
      new Request("https://console.example/api/public/reader-auth/github/callback", {
        headers: { cookie: cancelled.cookie.split(";")[0] },
      }),
      cancelledState,
      adminUserId,
      "cancelled"
    );

    const expired = await createAdminGithubBindingStart(
      new Request("https://console.example/api/public/reader-auth/github/binding/start"),
      adminUserId,
      "/admin/github-binding"
    );
    const expiredState = new URL(expired.location).searchParams.get("state") as string;
    await db
      .update(readerOAuthAttempts)
      .set({ expiresAt: Date.now() - 1 })
      .where(
        eq(readerOAuthAttempts.stateHash, createHash("sha256").update(expiredState).digest("hex"))
      );
    await expect(
      completeAdminGithubBindingOAuth(
        new Request("https://console.example/api/public/reader-auth/github/callback", {
          headers: { cookie: expired.cookie.split(";")[0] },
        }),
        expiredState,
        "expired-code",
        adminUserId
      )
    ).rejects.toMatchObject({ code: "expired" });

    const mismatched = await createAdminGithubBindingStart(
      new Request("https://console.example/api/public/reader-auth/github/binding/start"),
      adminUserId,
      "/admin/github-binding"
    );
    const mismatchedState = new URL(mismatched.location).searchParams.get("state") as string;
    await expect(
      completeAdminGithubBindingOAuth(
        new Request("https://console.example/api/public/reader-auth/github/callback", {
          headers: { cookie: mismatched.cookie.split(";")[0] },
        }),
        mismatchedState,
        "mismatched-code",
        "different-admin"
      )
    ).rejects.toMatchObject({ code: "mismatched_session" });

    await db.insert(adminGithubBindings).values({
      id: "existing-binding",
      adminUserId: otherAdminId,
      githubId: "777002",
      githubLogin: "already-bound",
      displayName: "Already Bound",
      avatarUrl: null,
      profileUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const conflict = await createAdminGithubBindingStart(
      new Request("https://console.example/api/public/reader-auth/github/binding/start"),
      adminUserId,
      "/admin/github-binding"
    );
    const conflictState = new URL(conflict.location).searchParams.get("state") as string;
    globalThis.fetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("access_token")) return Response.json({ access_token: "conflict-token" });
        if (url === "https://api.github.com/user") {
          return Response.json({ id: 777002, login: "already-bound" });
        }
        throw new Error(`unexpected OAuth request: ${url}`);
      },
      { preconnect: originalFetch.preconnect }
    ) as typeof fetch;
    await expect(
      completeAdminGithubBindingOAuth(
        new Request("https://console.example/api/public/reader-auth/github/callback", {
          headers: { cookie: conflict.cookie.split(";")[0] },
        }),
        conflictState,
        "conflict-code",
        adminUserId
      )
    ).rejects.toMatchObject({ code: "conflict" });
    const preserved = await db
      .select()
      .from(adminGithubBindings)
      .where(eq(adminGithubBindings.adminUserId, otherAdminId))
      .get();
    expect(preserved?.githubId).toBe("777002");
    const events = await db
      .select()
      .from(adminGithubBindingEvents)
      .where(eq(adminGithubBindingEvents.adminUserId, adminUserId))
      .all();
    expect(events.map((row) => row.errorCode)).toEqual(
      expect.arrayContaining(["cancelled", "expired", "mismatched_session", "conflict"])
    );
    expect(events.every((row) => !JSON.stringify(row).includes("token"))).toBe(true);
  });
});
