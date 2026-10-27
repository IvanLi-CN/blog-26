import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import {
  adminGithubBindingEvents,
  adminGithubBindings,
  frontendSessions,
  frontendUsers,
} from "./schema";

export type AdminGithubBinding = typeof adminGithubBindings.$inferSelect;
export type AdminGithubBindingEventRow = typeof adminGithubBindingEvents.$inferSelect;
type BindingEventAction = "bind" | "unbind";
type BindingEventResult = "success" | "cancelled" | "conflict" | "failure";

export type AdminGithubBindingStatus = {
  binding: AdminGithubBinding | null;
  lastEvent: AdminGithubBindingEventRow | null;
};

export async function getAdminGithubBinding(adminUserId: string) {
  return (
    (await db
      .select()
      .from(adminGithubBindings)
      .where(eq(adminGithubBindings.adminUserId, adminUserId))
      .get()) ?? null
  );
}

export async function getAdminGithubBindingByGithubId(githubId: string) {
  return (
    (await db
      .select()
      .from(adminGithubBindings)
      .where(eq(adminGithubBindings.githubId, githubId))
      .get()) ?? null
  );
}

export async function isAdminGithubId(githubId: string) {
  return Boolean(await getAdminGithubBindingByGithubId(githubId));
}

export async function getAdminGithubBindingStatus(
  adminUserId: string
): Promise<AdminGithubBindingStatus> {
  const [binding, lastEvent] = await Promise.all([
    getAdminGithubBinding(adminUserId),
    db
      .select()
      .from(adminGithubBindingEvents)
      .where(eq(adminGithubBindingEvents.adminUserId, adminUserId))
      .orderBy(desc(adminGithubBindingEvents.createdAt))
      .limit(1)
      .get(),
  ]);
  return { binding, lastEvent: lastEvent ?? null };
}

export async function recordAdminGithubBindingEvent(input: {
  adminUserId: string;
  githubId?: string | null;
  action: BindingEventAction;
  result: BindingEventResult;
  errorCode?: string | null;
  createdAt?: number;
}) {
  await db.insert(adminGithubBindingEvents).values({
    id: randomUUID(),
    adminUserId: input.adminUserId,
    githubId: input.githubId ?? null,
    action: input.action,
    result: input.result,
    errorCode: input.errorCode ?? null,
    createdAt: input.createdAt ?? Date.now(),
  });
}

export async function unbindAdminGithubBinding(adminUserId: string) {
  return db.transaction(async (tx) => {
    const binding =
      (await tx
        .select()
        .from(adminGithubBindings)
        .where(eq(adminGithubBindings.adminUserId, adminUserId))
        .get()) ?? null;
    if (!binding) return null;

    const deleted = await tx
      .delete(adminGithubBindings)
      .where(eq(adminGithubBindings.id, binding.id))
      .returning()
      .get();
    if (!deleted) return null;

    const frontendUser = await tx
      .select({ id: frontendUsers.id })
      .from(frontendUsers)
      .where(eq(frontendUsers.adminUserId, adminUserId))
      .get();
    if (frontendUser) {
      await tx
        .update(frontendSessions)
        .set({ revokedAt: Date.now() })
        .where(
          and(
            eq(frontendSessions.frontendUserId, frontendUser.id),
            eq(frontendSessions.authSource, "github"),
            isNull(frontendSessions.revokedAt)
          )
        );
    }

    await tx.insert(adminGithubBindingEvents).values({
      id: randomUUID(),
      adminUserId,
      githubId: deleted.githubId,
      action: "unbind",
      result: "success",
      errorCode: null,
      createdAt: Date.now(),
    });
    return deleted;
  });
}
