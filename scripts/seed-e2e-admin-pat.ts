#!/usr/bin/env bun

import { eq } from "drizzle-orm";
import { db, initializeDB } from "@/lib/db";
import { hashPersonalAccessToken } from "@/lib/personal-access-token";
import { personalAccessTokens, users } from "@/lib/schema";

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const rawToken = process.env.MCP_TEST_PAT_TOKEN || "blog-test-pat-mcp-admin-seed-token-e2e";

  await initializeDB(true);

  const now = Date.now();
  const userId = "mcp-e2e-admin-user";

  await db.delete(personalAccessTokens);
  await db.delete(users).where(eq(users.email, adminEmail));
  await db.insert(users).values({
    id: userId,
    email: adminEmail,
    name: "MCP E2E Admin",
    createdAt: now,
  });
  await db.insert(personalAccessTokens).values({
    id: "mcp-e2e-admin-token",
    userId,
    label: "MCP E2E PAT",
    tokenHash: hashPersonalAccessToken(rawToken),
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
    lastUsedAt: null,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
