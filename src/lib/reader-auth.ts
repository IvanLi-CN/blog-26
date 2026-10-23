import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "./db";
import { readerOAuthAttempts, readerSessions, readers } from "./schema";
import { createSessionCookieHeader } from "./session-cookie";

export const READER_SESSION_COOKIE_NAME = "reader_session_id";
const READER_OAUTH_STATE_COOKIE_NAME = "reader_oauth_state";
const READER_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const READER_OAUTH_ATTEMPT_DURATION_MS = 10 * 60 * 1000;

export type Reader = {
  id: string;
  githubId: string;
  githubLogin: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
};

type ReaderAuthConfig = {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};

function base64Url(value: Uint8Array) {
  return Buffer.from(value).toString("base64url");
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(bytes = 32) {
  return base64Url(randomBytes(bytes));
}

function parseCookies(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, ...value]) => [key, value.join("=")])
  );
}

function getConfig(): ReaderAuthConfig | null {
  const clientId = process.env.GITHUB_READER_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_READER_CLIENT_SECRET?.trim();
  const callbackUrl = process.env.GITHUB_READER_CALLBACK_URL?.trim();
  if (!clientId || !clientSecret || !callbackUrl) return null;
  return { clientId, clientSecret, callbackUrl };
}

function normalizeReturnTo(raw: string | null, request: Request) {
  const fallback = "/";
  if (!raw) return fallback;
  try {
    const candidate = new URL(raw, request.url);
    const requestOrigin = new URL(request.url).origin;
    const trustedOrigins = new Set(
      [
        requestOrigin,
        process.env.PUBLIC_SITE_URL,
        process.env.PUBLIC_API_BASE_URL,
        process.env.CONSOLE_URL,
      ]
        .filter(Boolean)
        .map((origin) => new URL(origin as string).origin)
    );
    if (!trustedOrigins.has(candidate.origin)) return fallback;
    const path = `${candidate.pathname}${candidate.search}${candidate.hash}` || fallback;
    return candidate.origin === requestOrigin ? path : candidate.toString();
  } catch {
    return fallback;
  }
}

function readerFromRow(row: typeof readers.$inferSelect): Reader {
  return {
    id: row.id,
    githubId: row.githubId,
    githubLogin: row.githubLogin,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    profileUrl: row.profileUrl,
  };
}

export function readerAuthAvailable() {
  return getConfig() !== null;
}

export function readerOAuthStateCookieHeader(request: Request, state: string) {
  return createSessionCookieHeader(request, READER_OAUTH_STATE_COOKIE_NAME, {
    value: state,
    maxAge: READER_OAUTH_ATTEMPT_DURATION_MS / 1000,
    sameSite: "Lax",
  });
}

export function clearReaderOAuthStateCookieHeader(request: Request) {
  return createSessionCookieHeader(request, READER_OAUTH_STATE_COOKIE_NAME, { maxAge: 0 });
}

export function readerSessionCookieHeader(request: Request, token: string) {
  return createSessionCookieHeader(request, READER_SESSION_COOKIE_NAME, {
    value: token,
    maxAge: READER_SESSION_DURATION_MS / 1000,
    sameSite: "Lax",
  });
}

export function clearReaderSessionCookieHeader(request: Request) {
  return createSessionCookieHeader(request, READER_SESSION_COOKIE_NAME, { maxAge: 0 });
}

export async function createReaderOAuthStart(request: Request, rawReturnTo: string | null) {
  const config = getConfig();
  if (!config) {
    throw new Error("GitHub reader OAuth is not configured");
  }

  const state = randomToken(32);
  const codeVerifier = randomToken(48);
  const now = Date.now();
  await clearExpiredReaderOAuthAttempts(now);
  await db.insert(readerOAuthAttempts).values({
    id: randomUUID(),
    stateHash: hashValue(state),
    codeVerifier,
    returnTo: normalizeReturnTo(rawReturnTo, request),
    expiresAt: now + READER_OAUTH_ATTEMPT_DURATION_MS,
    createdAt: now,
  });

  const challenge = base64Url(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier)))
  );
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.callbackUrl);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return {
    location: authorizeUrl.toString(),
    cookie: readerOAuthStateCookieHeader(request, state),
  };
}

async function consumeOAuthAttempt(request: Request, state: string) {
  const cookieState = parseCookies(request)[READER_OAUTH_STATE_COOKIE_NAME];
  if (!cookieState || cookieState !== state) return null;
  const now = Date.now();
  const attempt = await db
    .select()
    .from(readerOAuthAttempts)
    .where(
      and(
        eq(readerOAuthAttempts.stateHash, hashValue(state)),
        gt(readerOAuthAttempts.expiresAt, now),
        isNull(readerOAuthAttempts.consumedAt)
      )
    )
    .get();
  if (!attempt) return null;
  const consumed = await db
    .update(readerOAuthAttempts)
    .set({ consumedAt: now })
    .where(
      and(
        eq(readerOAuthAttempts.id, attempt.id),
        isNull(readerOAuthAttempts.consumedAt),
        gt(readerOAuthAttempts.expiresAt, now)
      )
    )
    .returning()
    .get();
  return consumed ?? null;
}

export async function getReaderOAuthReturnTo(request: Request, state: string) {
  const cookieState = parseCookies(request)[READER_OAUTH_STATE_COOKIE_NAME];
  if (!cookieState || cookieState !== state) return null;
  const attempt = await db
    .select({ returnTo: readerOAuthAttempts.returnTo })
    .from(readerOAuthAttempts)
    .where(
      and(
        eq(readerOAuthAttempts.stateHash, hashValue(state)),
        gt(readerOAuthAttempts.expiresAt, Date.now())
      )
    )
    .get();
  return attempt?.returnTo ?? null;
}

async function exchangeGithubCode(config: ReaderAuthConfig, code: string, verifier: string) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("GitHub authorization code exchange failed");
  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (!payload.access_token) throw new Error(payload.error || "GitHub authorization was rejected");
  return payload.access_token;
}

async function readGithubProfile(accessToken: string) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": "blog-reader-auth",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("GitHub profile lookup failed");
  const payload = (await response.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    avatar_url?: string | null;
    html_url?: string | null;
  };
  if (!payload.id || !payload.login) throw new Error("GitHub profile is incomplete");
  return {
    githubId: String(payload.id),
    githubLogin: payload.login,
    displayName: payload.name?.trim() || payload.login,
    avatarUrl: payload.avatar_url || null,
    profileUrl: payload.html_url || null,
  };
}

export async function completeReaderOAuth(request: Request, state: string, code: string) {
  const config = getConfig();
  if (!config) throw new Error("GitHub reader OAuth is not configured");
  const attempt = await consumeOAuthAttempt(request, state);
  if (!attempt) throw new Error("GitHub authorization state is invalid or expired");
  const accessToken = await exchangeGithubCode(config, code, attempt.codeVerifier);
  const profile = await readGithubProfile(accessToken);
  const now = Date.now();
  const readerRow = await db
    .insert(readers)
    .values({ id: randomUUID(), ...profile, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: readers.githubId,
      set: { ...profile, updatedAt: now },
    })
    .returning()
    .get();
  if (!readerRow) throw new Error("Reader profile could not be saved");

  const rawToken = randomToken(48);
  await db.insert(readerSessions).values({
    id: randomUUID(),
    readerId: readerRow.id,
    tokenHash: hashValue(rawToken),
    expiresAt: now + READER_SESSION_DURATION_MS,
    createdAt: now,
  });
  return {
    reader: readerFromRow(readerRow),
    returnTo: attempt.returnTo,
    cookie: readerSessionCookieHeader(request, rawToken),
  };
}

export async function getReaderFromRequest(request: Request): Promise<Reader | null> {
  const token = parseCookies(request)[READER_SESSION_COOKIE_NAME];
  if (!token) return null;
  const row = await db
    .select({ reader: readers })
    .from(readerSessions)
    .innerJoin(readers, eq(readerSessions.readerId, readers.id))
    .where(
      and(
        eq(readerSessions.tokenHash, hashValue(token)),
        isNull(readerSessions.revokedAt),
        gt(readerSessions.expiresAt, Date.now())
      )
    )
    .get();
  return row ? readerFromRow(row.reader) : null;
}

export async function revokeReaderSession(request: Request) {
  const token = parseCookies(request)[READER_SESSION_COOKIE_NAME];
  if (token) {
    await db
      .update(readerSessions)
      .set({ revokedAt: Date.now() })
      .where(and(eq(readerSessions.tokenHash, hashValue(token)), isNull(readerSessions.revokedAt)));
  }
}

export function getReaderReturnTo(request: Request, rawReturnTo: string | null) {
  return normalizeReturnTo(rawReturnTo, request);
}

export function clearExpiredReaderOAuthAttempts(now = Date.now()) {
  return db.delete(readerOAuthAttempts).where(lt(readerOAuthAttempts.expiresAt, now));
}
