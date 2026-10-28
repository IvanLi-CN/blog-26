import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type {
  FrontendAuthSession,
  FrontendAuthState,
  FrontendGithubIdentity,
  FrontendPrincipal,
} from "@/lib/assistant-contracts";
import {
  FRONTEND_LOGOUT_COOKIE_NAME,
  FRONTEND_SESSION_COOKIE_NAME,
  FRONTEND_SESSION_DURATION_MS,
} from "@/lib/assistant-contracts";
import { type AuthResult, extractAuthFromRequest } from "@/lib/auth-utils";
import { db, initializeDB } from "@/lib/db";
import { getReaderFromRequest, type Reader } from "@/lib/reader-auth";
import {
  adminGithubBindings,
  frontendIdentityLinks,
  frontendSessions,
  frontendUsers,
  readers,
  users,
} from "@/lib/schema";
import { createSessionCookieHeader } from "@/lib/session-cookie";

const STATION_AVATAR_URL = "/site-assets/avatar.jpg";

type FrontendDatabase = NonNullable<typeof db>;

type FrontendSessionResult = {
  principal: FrontendPrincipal;
  session: FrontendAuthSession;
  token: string;
};

type FrontendAuthMutation = FrontendAuthState & {
  setCookies: string[];
  bootstrapped?: boolean;
};

function requireDatabase(): FrontendDatabase {
  if (!db) throw new Error("Database has not been initialized");
  return db;
}

async function ensureDatabase(): Promise<FrontendDatabase> {
  if (!db) await initializeDB();
  return requireDatabase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return randomBytes(48).toString("base64url");
}

function parseCookies(request: Request) {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => name && value)
      .map(([name, ...value]) => [name, value.join("=")])
  );
}

function toGithubIdentity(input: {
  githubId: string;
  githubLogin: string;
  displayName: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
}): FrontendGithubIdentity {
  return {
    id: input.githubId,
    login: input.githubLogin,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    profileUrl: input.profileUrl,
  };
}

export function frontendSessionCookieHeader(request: Request, token: string) {
  return createSessionCookieHeader(request, FRONTEND_SESSION_COOKIE_NAME, {
    value: token,
    maxAge: FRONTEND_SESSION_DURATION_MS / 1000,
    sameSite: "Lax",
  });
}

export function clearFrontendSessionCookieHeader(request: Request) {
  return createSessionCookieHeader(request, FRONTEND_SESSION_COOKIE_NAME, { maxAge: 0 });
}

export function frontendLogoutCookieHeader(request: Request) {
  return createSessionCookieHeader(request, FRONTEND_LOGOUT_COOKIE_NAME, {
    value: "1",
    maxAge: FRONTEND_SESSION_DURATION_MS / 1000,
    sameSite: "Lax",
  });
}

export function clearFrontendLogoutCookieHeader(request: Request) {
  return createSessionCookieHeader(request, FRONTEND_LOGOUT_COOKIE_NAME, { maxAge: 0 });
}

async function loadPrincipal(
  frontendUserId: string,
  authSource: FrontendAuthSession["authSource"] = "admin"
): Promise<FrontendPrincipal | null> {
  const database = await ensureDatabase();
  const row = await database
    .select()
    .from(frontendUsers)
    .where(eq(frontendUsers.id, frontendUserId))
    .get();
  if (!row) return null;

  const links = await database
    .select()
    .from(frontendIdentityLinks)
    .where(eq(frontendIdentityLinks.frontendUserId, row.id))
    .all();
  const githubLink = links.find((link) => link.provider === "github") ?? null;
  let readerId: string | null = null;
  let github: FrontendGithubIdentity | null = null;
  let binding: typeof adminGithubBindings.$inferSelect | null = null;

  if (row.isAdmin && row.adminUserId) {
    binding =
      (await database
        .select()
        .from(adminGithubBindings)
        .where(eq(adminGithubBindings.adminUserId, row.adminUserId))
        .get()) ?? null;
    if (authSource === "github" && !binding) return null;
    if (binding) {
      const reader = await database
        .select({ id: readers.id })
        .from(readers)
        .where(eq(readers.githubId, binding.githubId))
        .get();
      github = toGithubIdentity(binding);
      readerId = reader?.id ?? null;
    }
  } else if (authSource === "github" && row.isAdmin) {
    return null;
  } else if (!row.isAdmin && githubLink) {
    readerId = githubLink.readerId;
    github = toGithubIdentity({
      githubId: githubLink.providerSubject,
      githubLogin: githubLink.providerLogin ?? githubLink.displayName ?? githubLink.providerSubject,
      displayName: githubLink.displayName,
      avatarUrl: githubLink.avatarUrl,
      profileUrl: githubLink.profileUrl,
    });
  }

  return {
    id: row.id,
    kind: row.isAdmin ? "admin" : "reader",
    isAdmin: row.isAdmin,
    displayName: row.displayName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    profileUrl: row.profileUrl,
    adminUserId: row.adminUserId,
    readerId,
    github,
  };
}

async function saveAdminIdentityLink(
  frontendUserId: string,
  user: NonNullable<AuthResult["user"]>,
  now: number
) {
  const database = await ensureDatabase();
  const existing = await database
    .select()
    .from(frontendIdentityLinks)
    .where(
      and(
        eq(frontendIdentityLinks.provider, "admin"),
        eq(frontendIdentityLinks.providerSubject, user.id)
      )
    )
    .get();
  const values = {
    frontendUserId,
    provider: "admin" as const,
    providerSubject: user.id,
    providerLogin: null,
    adminUserId: user.id,
    readerId: null,
    displayName: user.nickname,
    email: user.email,
    avatarUrl: STATION_AVATAR_URL,
    profileUrl: null,
    updatedAt: now,
  };
  if (existing) {
    await database
      .update(frontendIdentityLinks)
      .set(values)
      .where(eq(frontendIdentityLinks.id, existing.id));
  } else {
    await database.insert(frontendIdentityLinks).values({
      id: randomUUID(),
      ...values,
      createdAt: now,
    });
  }
}

export async function ensureAdminFrontendUser(user: NonNullable<AuthResult["user"]>) {
  const database = await ensureDatabase();
  const now = Date.now();
  const existingLink = await database
    .select()
    .from(frontendIdentityLinks)
    .where(
      and(
        eq(frontendIdentityLinks.provider, "admin"),
        eq(frontendIdentityLinks.providerSubject, user.id)
      )
    )
    .get();
  const existingUser =
    (existingLink
      ? await database
          .select()
          .from(frontendUsers)
          .where(eq(frontendUsers.id, existingLink.frontendUserId))
          .get()
      : null) ??
    (await database
      .select()
      .from(frontendUsers)
      .where(eq(frontendUsers.adminUserId, user.id))
      .get());

  const frontendUserId = existingUser?.id ?? `frontend-${randomUUID()}`;
  if (existingUser) {
    await database
      .update(frontendUsers)
      .set({
        adminUserId: user.id,
        isAdmin: true,
        displayName: user.nickname,
        email: user.email,
        avatarUrl: STATION_AVATAR_URL,
        profileUrl: null,
        updatedAt: now,
      })
      .where(eq(frontendUsers.id, existingUser.id));
  } else {
    await database.insert(frontendUsers).values({
      id: frontendUserId,
      adminUserId: user.id,
      isAdmin: true,
      displayName: user.nickname,
      email: user.email,
      avatarUrl: STATION_AVATAR_URL,
      profileUrl: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  await saveAdminIdentityLink(frontendUserId, user, now);
  const principal = await loadPrincipal(frontendUserId);
  if (!principal) throw new Error("Frontend admin identity could not be loaded");
  return principal;
}

async function saveGithubIdentityLink(frontendUserId: string, reader: Reader, now: number) {
  const database = await ensureDatabase();
  const existing = await database
    .select()
    .from(frontendIdentityLinks)
    .where(
      and(
        eq(frontendIdentityLinks.provider, "github"),
        eq(frontendIdentityLinks.providerSubject, reader.githubId)
      )
    )
    .get();
  const values = {
    frontendUserId,
    provider: "github" as const,
    providerSubject: reader.githubId,
    providerLogin: reader.githubLogin,
    adminUserId: null,
    readerId: reader.id,
    displayName: reader.displayName,
    email: null,
    avatarUrl: reader.avatarUrl,
    profileUrl: reader.profileUrl,
    updatedAt: now,
  };
  if (existing) {
    await database
      .update(frontendIdentityLinks)
      .set(values)
      .where(eq(frontendIdentityLinks.id, existing.id));
  } else {
    await database.insert(frontendIdentityLinks).values({
      id: randomUUID(),
      ...values,
      createdAt: now,
    });
  }
}

async function ensureReaderFrontendUser(reader: Reader) {
  const database = await ensureDatabase();
  const now = Date.now();
  const binding = await database
    .select()
    .from(adminGithubBindings)
    .where(eq(adminGithubBindings.githubId, reader.githubId))
    .get();

  if (binding) {
    const adminUser = await database
      .select()
      .from(users)
      .where(eq(users.id, binding.adminUserId))
      .get();
    if (adminUser) {
      const principal = await ensureAdminFrontendUser({
        id: adminUser.id,
        nickname: adminUser.name || adminUser.email.split("@")[0],
        email: adminUser.email,
        avatarUrl: undefined,
      });
      await saveGithubIdentityLink(principal.id, reader, now);
      return (await loadPrincipal(principal.id)) as FrontendPrincipal;
    }
  }

  const existingLink = await database
    .select()
    .from(frontendIdentityLinks)
    .where(
      and(
        eq(frontendIdentityLinks.provider, "github"),
        eq(frontendIdentityLinks.providerSubject, reader.githubId)
      )
    )
    .get();
  const existingUser = existingLink
    ? await database
        .select()
        .from(frontendUsers)
        .where(eq(frontendUsers.id, existingLink.frontendUserId))
        .get()
    : null;
  const frontendUserId =
    existingUser && !existingUser.isAdmin ? existingUser.id : `frontend-${randomUUID()}`;
  if (existingUser && !existingUser.isAdmin) {
    await database
      .update(frontendUsers)
      .set({
        displayName: reader.displayName || reader.githubLogin,
        email: null,
        avatarUrl: reader.avatarUrl || "/site-assets/default-avatar.svg",
        profileUrl: reader.profileUrl,
        updatedAt: now,
      })
      .where(eq(frontendUsers.id, existingUser.id));
  } else {
    await database.insert(frontendUsers).values({
      id: frontendUserId,
      adminUserId: null,
      isAdmin: false,
      displayName: reader.displayName || reader.githubLogin,
      email: null,
      avatarUrl: reader.avatarUrl || "/site-assets/default-avatar.svg",
      profileUrl: reader.profileUrl,
      createdAt: now,
      updatedAt: now,
    });
  }
  await saveGithubIdentityLink(frontendUserId, reader, now);
  const principal = await loadPrincipal(frontendUserId);
  if (!principal) throw new Error("Frontend reader identity could not be loaded");
  return principal;
}

async function createFrontendSession(
  frontendUserId: string,
  authSource: FrontendAuthSession["authSource"],
  now = Date.now()
) {
  const database = await ensureDatabase();
  const token = randomToken();
  const session = {
    id: randomUUID(),
    principalId: frontendUserId,
    authSource,
    expiresAt: now + FRONTEND_SESSION_DURATION_MS,
    createdAt: now,
  } satisfies FrontendAuthSession;
  await database.insert(frontendSessions).values({
    id: session.id,
    frontendUserId,
    authSource: session.authSource,
    tokenHash: hashToken(token),
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
  });
  const principal = await loadPrincipal(frontendUserId, authSource);
  if (!principal) throw new Error("Frontend session principal could not be loaded");
  return { principal, session, token } satisfies FrontendSessionResult;
}

async function getFrontendSession(request: Request) {
  const token = parseCookies(request)[FRONTEND_SESSION_COOKIE_NAME];
  if (!token) return null;
  const database = await ensureDatabase();
  const row = await database
    .select()
    .from(frontendSessions)
    .where(
      and(
        eq(frontendSessions.tokenHash, hashToken(token)),
        isNull(frontendSessions.revokedAt),
        gt(frontendSessions.expiresAt, Date.now())
      )
    )
    .get();
  if (!row) return null;
  const principal = await loadPrincipal(row.frontendUserId, row.authSource);
  if (!principal) {
    await database
      .update(frontendSessions)
      .set({ revokedAt: Date.now() })
      .where(eq(frontendSessions.id, row.id));
    return null;
  }
  return {
    principal,
    session: {
      id: row.id,
      principalId: row.frontendUserId,
      authSource: row.authSource,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    } satisfies FrontendAuthSession,
  };
}

export async function getFrontendPrincipalFromRequest(request: Request) {
  return (await getFrontendSession(request))?.principal ?? null;
}

function stateFromSession(
  session: Awaited<ReturnType<typeof getFrontendSession>>,
  loggedOut: boolean
): FrontendAuthState {
  return {
    authenticated: Boolean(session),
    principal: session?.principal ?? null,
    expiresAt: session?.session.expiresAt ?? null,
    loggedOut,
  };
}

export async function frontendAuthMe(request: Request): Promise<FrontendAuthState> {
  const session = await getFrontendSession(request);
  return stateFromSession(session, parseCookies(request)[FRONTEND_LOGOUT_COOKIE_NAME] === "1");
}

export async function bootstrapFrontendAuth(request: Request): Promise<FrontendAuthMutation> {
  const current = await getFrontendSession(request);
  if (current) return { ...stateFromSession(current, false), setCookies: [], bootstrapped: false };
  if (parseCookies(request)[FRONTEND_LOGOUT_COOKIE_NAME] === "1") {
    return {
      ...stateFromSession(null, true),
      setCookies: [clearFrontendSessionCookieHeader(request)],
      bootstrapped: false,
    };
  }

  const auth = await extractAuthFromRequest(request);
  let principal: FrontendPrincipal | null = null;
  let authSource: FrontendAuthSession["authSource"] = "github";
  if (auth.user && auth.isAdmin) {
    principal = await ensureAdminFrontendUser(auth.user);
    authSource = "admin";
  } else {
    const reader = await getReaderFromRequest(request);
    if (reader) principal = await ensureReaderFrontendUser(reader);
  }
  if (!principal) {
    return { ...stateFromSession(null, false), setCookies: [], bootstrapped: false };
  }
  const created = await createFrontendSession(principal.id, authSource);
  return {
    authenticated: true,
    principal: created.principal,
    expiresAt: created.session.expiresAt,
    loggedOut: false,
    setCookies: [
      frontendSessionCookieHeader(request, created.token),
      clearFrontendLogoutCookieHeader(request),
    ],
    bootstrapped: true,
  };
}

export async function startAdminFrontendAuth(request: Request): Promise<FrontendAuthMutation> {
  const auth = await extractAuthFromRequest(request);
  if (!auth.user || !auth.isAdmin) {
    return {
      authenticated: false,
      principal: null,
      expiresAt: null,
      loggedOut: false,
      setCookies: [],
      bootstrapped: false,
    };
  }
  const current = await getFrontendSession(request);
  const principal = await ensureAdminFrontendUser(auth.user);
  const database = await ensureDatabase();
  if (current && current.principal.id !== principal.id) {
    await database
      .update(frontendSessions)
      .set({ revokedAt: Date.now() })
      .where(eq(frontendSessions.id, current.session.id));
  }
  const created = await createFrontendSession(principal.id, "admin");
  return {
    authenticated: true,
    principal: created.principal,
    expiresAt: created.session.expiresAt,
    loggedOut: false,
    setCookies: [
      frontendSessionCookieHeader(request, created.token),
      clearFrontendLogoutCookieHeader(request),
    ],
    bootstrapped: true,
  };
}

export async function logoutFrontendAuth(request: Request): Promise<FrontendAuthMutation> {
  const current = await getFrontendSession(request);
  if (current) {
    const database = await ensureDatabase();
    await database
      .update(frontendSessions)
      .set({ revokedAt: Date.now() })
      .where(eq(frontendSessions.id, current.session.id));
  }
  return {
    authenticated: false,
    principal: null,
    expiresAt: null,
    loggedOut: true,
    setCookies: [clearFrontendSessionCookieHeader(request), frontendLogoutCookieHeader(request)],
    bootstrapped: false,
  };
}
