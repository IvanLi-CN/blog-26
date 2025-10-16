#!/usr/bin/env bun

import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getAdminEmail } from "@/lib/admin-config";
import { db, initializeDB } from "@/lib/db";
import { users } from "@/lib/schema";
import { createPersonalAccessToken } from "@/server/services/personal-access-tokens";

async function main() {
  await initializeDB();
  const adminEmail = getAdminEmail();
  if (!adminEmail) {
    console.error("ADMIN_EMAIL is not set");
    process.exit(1);
  }

  let user = await db.select().from(users).where(eq(users.email, adminEmail)).get();
  if (!user) {
    const id = uuidv4();
    await db
      .insert(users)
      .values({ id, email: adminEmail, name: adminEmail.split("@")[0], createdAt: Date.now() });
    user = await db.select().from(users).where(eq(users.email, adminEmail)).get();
  }

  if (!user) {
    console.error("Failed to ensure admin user");
    process.exit(1);
  }

  const { token } = await createPersonalAccessToken({ userId: user.id, label: "admin-mcp-test" });
  console.log(token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
