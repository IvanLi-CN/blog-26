import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, initializeDB } from "@/lib/db";
import {
  generatePersonalAccessTokenValue,
  getPersonalAccessTokenPrefix,
  hashPersonalAccessToken,
} from "@/lib/personal-access-token";
import { type PersonalAccessToken, personalAccessTokens, users } from "@/lib/schema";

type UserRow = typeof users.$inferSelect;

type PersonalAccessTokenRow = PersonalAccessToken;

async function ensureDBReady(): Promise<void> {
  if (!db) {
    await initializeDB();
  }
}

export interface CreatePersonalAccessTokenParams {
  userId: string;
  label?: string | null;
}

export interface CreatePersonalAccessTokenResult {
  token: string;
  record: PersonalAccessTokenRow;
}

export interface PersonalAccessTokenWithUser {
  token: PersonalAccessTokenRow;
  user: Pick<UserRow, "id" | "email" | "name" | "createdAt">;
}

export interface ListPersonalAccessTokensParams {
  userId?: string;
  includeRevoked?: boolean;
}

function ensureLabel(label?: string | null): string | null {
  if (!label) {
    return null;
  }
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function createPersonalAccessToken(
  params: CreatePersonalAccessTokenParams
): Promise<CreatePersonalAccessTokenResult> {
  await ensureDBReady();

  const targetUser = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, params.userId))
    .get();

  if (!targetUser) {
    throw new Error("Target user does not exist");
  }

  const now = Date.now();

  for (let attempt = 0; attempt < 5; attempt++) {
    const prefix = getPersonalAccessTokenPrefix();
    const rawToken = generatePersonalAccessTokenValue(prefix);
    const tokenHash = hashPersonalAccessToken(rawToken);

    const record: PersonalAccessTokenRow = {
      id: uuidv4(),
      userId: params.userId,
      label: ensureLabel(params.label),
      tokenHash,
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      lastUsedAt: null,
    };

    try {
      await db.insert(personalAccessTokens).values(record);
      return { token: rawToken, record };
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to generate a unique personal access token");
}

export async function listPersonalAccessTokens(
  params: ListPersonalAccessTokensParams = {}
): Promise<PersonalAccessTokenWithUser[]> {
  await ensureDBReady();

  const filters: SQL[] = [];

  if (params.userId) {
    filters.push(eq(personalAccessTokens.userId, params.userId));
  }

  if (!params.includeRevoked) {
    filters.push(isNull(personalAccessTokens.revokedAt));
  }

  const whereClause = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      token: personalAccessTokens,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      },
    })
    .from(personalAccessTokens)
    .innerJoin(users, eq(personalAccessTokens.userId, users.id))
    .where(whereClause)
    .orderBy(desc(personalAccessTokens.createdAt));

  return rows.map((row) => ({
    token: row.token,
    user: row.user,
  }));
}

export async function revokePersonalAccessTokenById(tokenId: string): Promise<boolean> {
  await ensureDBReady();
  const now = Date.now();

  const result = await db
    .update(personalAccessTokens)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(personalAccessTokens.id, tokenId), isNull(personalAccessTokens.revokedAt)));

  return result.changes > 0;
}

export interface ResolvedPersonalAccessToken {
  token: PersonalAccessTokenRow;
  user: UserRow;
}

export async function resolveUserByPersonalAccessToken(
  rawToken: string
): Promise<ResolvedPersonalAccessToken | null> {
  if (!rawToken) {
    return null;
  }

  await ensureDBReady();

  const prefix = getPersonalAccessTokenPrefix();
  if (!rawToken.startsWith(prefix)) {
    return null;
  }
  const tokenHash = hashPersonalAccessToken(rawToken);

  const result = await db
    .select({ token: personalAccessTokens, user: users })
    .from(personalAccessTokens)
    .innerJoin(users, eq(personalAccessTokens.userId, users.id))
    .where(
      and(eq(personalAccessTokens.tokenHash, tokenHash), isNull(personalAccessTokens.revokedAt))
    )
    .get();

  if (!result) {
    return null;
  }

  const now = Date.now();
  await db
    .update(personalAccessTokens)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(personalAccessTokens.id, result.token.id));

  return {
    token: result.token,
    user: result.user,
  };
}
