import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, initializeDB } from "../src/lib/db";
import { users } from "../src/lib/schema";
import { createSession, SESSION_COOKIE_NAME } from "../src/lib/session";

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@test.local";
  await initializeDB();

  // ensure user exists
  let user = await db.select().from(users).where(eq(users.email, adminEmail)).get();
  if (!user) {
    const id = uuidv4();
    await db.insert(users).values({ id, email: adminEmail, name: "Admin", createdAt: Date.now() });
    user = await db.select().from(users).where(eq(users.email, adminEmail)).get();
  }
  if (!user) throw new Error("Failed to ensure admin user");

  const session = await createSession({
    userId: user.id,
    deviceInfo: "dev-script",
    ipAddress: "127.0.0.1",
  });

  console.log(
    JSON.stringify(
      { cookieName: SESSION_COOKIE_NAME, sessionId: session.id, email: adminEmail },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
