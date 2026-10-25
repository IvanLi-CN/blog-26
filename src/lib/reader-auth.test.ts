import { Database } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, initializeDB } from "@/lib/db";
import {
  completeReaderOAuth,
  createReaderOAuthStart,
  getReaderFromRequest,
  getReaderOAuthReturnTo,
  revokeReaderSession,
} from "@/lib/reader-auth";
import { readerOAuthAttempts, readerSessions, readers } from "@/lib/schema";

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
});
