import { Database } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { unbindAdminGithubBinding } from "@/lib/admin-github-binding";
import type { FrontendPrincipal } from "@/lib/assistant-contracts";
import { COMMENT_MIGRATION_ID } from "@/lib/comment-migration";
import { db, initializeDB } from "@/lib/db";
import { projectCatalog } from "@/lib/project-catalog";
import type { Reader } from "@/lib/reader-auth";
import {
  adminGithubBindingEvents,
  adminGithubBindings,
  commentMigrationState,
  comments,
  frontendIdentityLinks,
  frontendSessions,
  frontendUsers,
  posts,
  readerSessions,
  readers,
  users,
} from "@/lib/schema";
import { appRouter } from "@/server/router";

const TEST_DB_PATH = path.join(process.cwd(), "tmp/comments-router-test.sqlite");
const MIGRATIONS_PATH = path.join(process.cwd(), "drizzle");

const reader: Reader = {
  id: "reader-comments-test",
  githubId: "github-comments-test",
  githubLogin: "comments-test",
  displayName: "Comment Reader",
  avatarUrl: null,
  profileUrl: "https://github.com/comments-test",
};

function createCaller(
  options: { reader?: Reader; isAdmin?: boolean; frontendPrincipal?: FrontendPrincipal } = {}
) {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    isAdmin: options.isAdmin ?? false,
    user: options.isAdmin
      ? { id: "admin-comments-test", nickname: "Admin", email: "admin@example.com" }
      : undefined,
    reader: options.reader,
    frontendPrincipal: options.frontendPrincipal,
  } as never);
}

async function seedPost(slug: string, type: "post" | "memo" | "project" = "post") {
  if (!db) throw new Error("Database has not been initialised");
  const now = Math.floor(Date.now() / 1000);
  await db.insert(posts).values({
    id: `${type}-${slug}`,
    slug,
    type,
    title: slug,
    excerpt: null,
    body: "Public body",
    publishDate: now,
    updateDate: now,
    draft: false,
    public: true,
    category: null,
    tags: null,
    author: "test",
    image: null,
    metadata: null,
    dataSource: "local",
    contentHash: randomUUID(),
  });
}

async function registerReader(nextReader: Reader) {
  if (!db) throw new Error("Database has not been initialised");
  await db.insert(readers).values({ ...nextReader, createdAt: Date.now(), updatedAt: Date.now() });
}

describe("comments reader lifecycle", () => {
  beforeAll(async () => {
    process.env.DB_PATH = TEST_DB_PATH;
    fs.mkdirSync(path.dirname(TEST_DB_PATH), { recursive: true });
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);
    const sqlite = new Database(TEST_DB_PATH);
    migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS_PATH });
    sqlite.close();
    await initializeDB(true);
    await db
      .update(commentMigrationState)
      .set({ status: "complete", updatedAt: Date.now(), lastError: null })
      .where(eq(commentMigrationState.id, COMMENT_MIGRATION_ID));
  });

  beforeEach(async () => {
    if (!db) throw new Error("Database has not been initialised");
    await db.delete(comments);
    await db.delete(frontendSessions);
    await db.delete(frontendIdentityLinks);
    await db.delete(frontendUsers);
    await db.delete(readerSessions);
    await db.delete(posts);
    await db.delete(readers);
    await db.delete(adminGithubBindingEvents);
    await db.delete(adminGithubBindings);
    await db.insert(readers).values({
      ...reader,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  afterAll(() => {
    if (fs.existsSync(TEST_DB_PATH)) fs.rmSync(TEST_DB_PATH);
  });

  it("keeps pending comments private, supports idempotency, and soft deletes", async () => {
    await seedPost("reader-comments");
    const input = {
      target: { type: "article" as const, key: "reader-comments" },
      content: "A pending comment",
      submissionKey: "submission-1",
    };
    const created = await createCaller({ reader }).comments.createComment(input);
    const retried = await createCaller({ reader }).comments.createComment(input);
    expect(retried.commentId).toBe(created.commentId);

    const guest = await createCaller().comments.getComments({
      slug: "reader-comments",
      target: input.target,
    });
    expect(guest.comments).toHaveLength(0);

    const targetOnly = await createCaller().comments.getComments({ target: input.target });
    expect(targetOnly.comments).toHaveLength(0);

    const own = await createCaller({ reader }).comments.getComments({
      slug: "reader-comments",
      target: input.target,
    });
    expect(own.comments[0]).toMatchObject({
      id: created.commentId,
      status: "pending",
      authorEmail: null,
    });

    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: created.commentId,
      status: "approved",
      expectedRevision: 1,
    });
    const publicComments = await createCaller().comments.getComments({
      slug: "reader-comments",
      target: input.target,
    });
    expect(publicComments.comments[0]?.content).toBe(input.content);

    await createCaller({ reader }).comments.deleteComment({
      commentId: created.commentId,
      expectedRevision: 2,
    });
    const hidden = await createCaller().comments.getComments({
      slug: "reader-comments",
      target: input.target,
    });
    expect(hidden.comments).toHaveLength(0);

    await createCaller({ isAdmin: true }).comments.restoreComment({
      commentId: created.commentId,
      expectedRevision: 3,
    });
    const restored = await createCaller({ isAdmin: true }).comments.getComments({
      slug: "reader-comments",
      target: input.target,
    });
    expect(restored.comments[0]).toMatchObject({ status: "pending", deleted: false });
  });

  it("publishes an unbound native admin comment through the frontend identity", async () => {
    await seedPost("frontend-admin-comments");
    const principal: FrontendPrincipal = {
      id: "frontend-native-admin",
      kind: "admin",
      isAdmin: true,
      displayName: "Station Admin",
      email: "admin@example.com",
      avatarUrl: "/site-assets/avatar.jpg",
      profileUrl: null,
      adminUserId: "native-admin-user",
      readerId: null,
      github: null,
    };
    await db?.insert(frontendUsers).values({
      id: principal.id,
      adminUserId: null,
      isAdmin: true,
      displayName: principal.displayName,
      email: principal.email,
      avatarUrl: principal.avatarUrl,
      profileUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const created = await createCaller({ frontendPrincipal: principal }).comments.createComment({
      target: { type: "article", key: "frontend-admin-comments" },
      content: "Native admin comment",
      submissionKey: "frontend-admin-submission",
    });
    expect(created).toMatchObject({ authorRole: "admin", status: "approved" });
    const row = await db?.select().from(comments).where(eq(comments.id, created.commentId)).get();
    expect(row).toMatchObject({
      frontendUserId: principal.id,
      readerId: null,
      authorRole: "admin",
      authorGithubId: null,
      status: "approved",
    });

    const visible = await createCaller().comments.getComments({
      target: { type: "article", key: "frontend-admin-comments" },
    });
    expect(visible.comments[0]).toMatchObject({
      authorRole: "admin",
      author: { avatarUrl: "/site-assets/avatar.jpg" },
    });
  });

  it("publishes bound admin comments, preserves their marker, and gates new comments after unbind", async () => {
    await seedPost("admin-comment-lifecycle");
    if (!db) throw new Error("Database has not been initialised");
    await db.insert(users).values({
      id: "admin-comments-test",
      email: "admin-comments-test@example.com",
      name: "Admin",
      createdAt: Date.now(),
    });
    const adminReader: Reader = {
      ...reader,
      id: "reader-admin-comments",
      githubId: "github-admin-comments",
      githubLogin: "admin-comments",
      displayName: "Admin Comments",
    };
    await registerReader(adminReader);
    await db.insert(adminGithubBindings).values({
      id: "admin-comments-binding",
      adminUserId: "admin-comments-test",
      githubId: adminReader.githubId,
      githubLogin: adminReader.githubLogin,
      displayName: adminReader.displayName,
      avatarUrl: null,
      profileUrl: adminReader.profileUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      createCaller({ isAdmin: true }).comments.createComment({
        target: { type: "article", key: "admin-comment-lifecycle" },
        content: "Admin session alone must not comment",
        submissionKey: "admin-session-only",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    const created = await createCaller({ reader: adminReader }).comments.createComment({
      target: { type: "article", key: "admin-comment-lifecycle" },
      content: "Published by the bound admin",
      submissionKey: "admin-comment-root",
    });
    expect(created).toMatchObject({
      authorRole: "admin",
      status: "approved",
      message: "管理员评论已公开",
    });
    const publicRoot = await createCaller().comments.getComments({
      target: { type: "article", key: "admin-comment-lifecycle" },
    });
    expect(publicRoot.comments[0]).toMatchObject({
      id: created.commentId,
      status: "approved",
      authorRole: "admin",
      canDelete: false,
    });

    const reply = await createCaller({ reader: adminReader }).comments.createComment({
      target: { type: "article", key: "admin-comment-lifecycle" },
      parentId: created.commentId,
      content: "Published admin reply",
      submissionKey: "admin-comment-reply",
    });
    expect(reply).toMatchObject({ authorRole: "admin", status: "approved" });

    await expect(
      createCaller({ isAdmin: true }).comments.moderateComment({
        commentId: created.commentId,
        status: "rejected",
        expectedRevision: 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const repeatedModeration = await createCaller({ isAdmin: true }).comments.batchModerate({
      commentIds: [created.commentId],
      status: "approved",
    });
    expect(repeatedModeration.results[0]).toMatchObject({
      result: "skipped",
      reason: "already_status",
    });
    const rejectedModeration = await createCaller({ isAdmin: true }).comments.batchModerate({
      commentIds: [created.commentId],
      status: "rejected",
    });
    expect(rejectedModeration.results[0]).toMatchObject({
      result: "skipped",
      reason: "admin_always_approved",
    });
    const unchangedAdmin = await db
      .select()
      .from(comments)
      .where(eq(comments.id, created.commentId))
      .get();
    expect(unchangedAdmin).toMatchObject({ status: "approved", revision: 1 });

    await expect(
      createCaller({ isAdmin: true }).admin.comments.update({
        id: created.commentId,
        status: "pending",
        expectedRevision: 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const repeatedAdminBatch = await createCaller({ isAdmin: true }).admin.comments.batchUpdate({
      ids: [created.commentId],
      action: "approve",
      expectedRevisions: { [created.commentId]: 1 },
    });
    expect(repeatedAdminBatch.results[0]).toMatchObject({
      result: "skipped",
      reason: "already_status",
    });

    await expect(
      createCaller({ reader: adminReader }).comments.deleteComment({
        commentId: created.commentId,
        expectedRevision: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await createCaller({ isAdmin: true }).comments.deleteComment({
      commentId: created.commentId,
      expectedRevision: 1,
    });
    await createCaller({ isAdmin: true }).comments.restoreComment({
      commentId: created.commentId,
      expectedRevision: 2,
    });
    const restored = await createCaller().comments.getComments({
      target: { type: "article", key: "admin-comment-lifecycle" },
    });
    expect(restored.comments[0]).toMatchObject({ status: "approved", authorRole: "admin" });

    const unbound = await unbindAdminGithubBinding("admin-comments-test");
    expect(unbound).toMatchObject({
      id: "admin-comments-binding",
      githubId: adminReader.githubId,
    });
    const unbindEvent = await db
      .select()
      .from(adminGithubBindingEvents)
      .where(eq(adminGithubBindingEvents.adminUserId, "admin-comments-test"))
      .get();
    expect(unbindEvent).toMatchObject({
      action: "unbind",
      result: "success",
      githubId: adminReader.githubId,
    });
    const afterUnbind = await createCaller({ reader: adminReader }).comments.createComment({
      target: { type: "article", key: "admin-comment-lifecycle" },
      content: "This comment needs review after unbind",
      submissionKey: "reader-comment-after-unbind",
    });
    expect(afterUnbind).toMatchObject({ authorRole: "reader", status: "pending" });
    const ownAfterUnbind = await createCaller({ reader: adminReader }).comments.getComments({
      target: { type: "article", key: "admin-comment-lifecycle" },
    });
    expect(
      ownAfterUnbind.comments.find((comment) => comment.id === afterUnbind.commentId)
    ).toMatchObject({ authorRole: "reader", status: "pending" });
    const publicAfterUnbind = await createCaller().comments.getComments({
      target: { type: "article", key: "admin-comment-lifecycle" },
    });
    expect(publicAfterUnbind.comments.some((comment) => comment.id === created.commentId)).toBe(
      true
    );
    expect(publicAfterUnbind.comments.some((comment) => comment.id === afterUnbind.commentId)).toBe(
      false
    );
  });

  it("does not expose orphaned legacy author emails in public identity fields", async () => {
    await seedPost("legacy-orphan-author");
    if (!db) throw new Error("Database has not been initialised");
    const createdAt = Math.floor(Date.now() / 1000);
    await db.insert(users).values({
      id: "legacy-known-user",
      email: "known@example.com",
      name: "Known Legacy Author",
      createdAt,
    });
    await db.insert(comments).values({
      id: "legacy-orphan-comment",
      content: "Legacy approved comment",
      postSlug: "legacy-orphan-author",
      targetType: "article",
      targetKey: "legacy-orphan-author",
      authorName: "Legacy Author",
      authorEmail: "orphan@example.com",
      readerId: null,
      parentId: null,
      rootId: "legacy-orphan-comment",
      status: "approved",
      deletedAt: null,
      revision: 1,
      submissionKey: null,
      createdAt,
    });
    await db.insert(comments).values({
      id: "legacy-known-comment",
      content: "Legacy known comment",
      postSlug: "legacy-orphan-author",
      targetType: "article",
      targetKey: "legacy-orphan-author",
      authorName: "Known Legacy Author",
      authorEmail: "known@example.com",
      readerId: null,
      parentId: null,
      rootId: "legacy-known-comment",
      status: "approved",
      deletedAt: null,
      revision: 1,
      submissionKey: null,
      createdAt: createdAt + 1,
    });

    const publicComments = await createCaller().comments.getComments({
      slug: "legacy-orphan-author",
      target: { type: "article", key: "legacy-orphan-author" },
    });
    const orphanPublic = publicComments.comments.find(
      (comment) => comment.id === "legacy-orphan-comment"
    );
    const knownPublic = publicComments.comments.find(
      (comment) => comment.id === "legacy-known-comment"
    );
    expect(orphanPublic).toMatchObject({
      id: "legacy-orphan-comment",
      authorEmail: null,
      author: { id: "legacy-orphan-comment" },
    });
    expect(orphanPublic?.author.avatarUrl).toBe("/site-assets/default-avatar.svg");
    expect(knownPublic).toMatchObject({
      id: "legacy-known-comment",
      authorEmail: null,
      author: { id: "legacy-known-user" },
    });
    expect(knownPublic?.author.avatarUrl).toBe("/site-assets/default-avatar.svg");

    const adminComments = await createCaller({ isAdmin: true }).comments.getComments({
      slug: "legacy-orphan-author",
      target: { type: "article", key: "legacy-orphan-author" },
    });
    expect(adminComments.comments[0]).toMatchObject({
      authorEmail: "orphan@example.com",
      author: { id: "orphan@example.com" },
    });
  });

  it("fails closed while the historical comment backfill is incomplete", async () => {
    await db
      .update(commentMigrationState)
      .set({ status: "blocked", updatedAt: Date.now(), lastError: "fixture" })
      .where(eq(commentMigrationState.id, COMMENT_MIGRATION_ID));
    try {
      await expect(
        createCaller().comments.getComments({ slug: "reader-comments" })
      ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    } finally {
      await db
        .update(commentMigrationState)
        .set({ status: "complete", updatedAt: Date.now(), lastError: null })
        .where(eq(commentMigrationState.id, COMMENT_MIGRATION_ID));
    }
  });

  it("rechecks public target access before a reader deletes a comment", async () => {
    await seedPost("reader-delete-target");
    const target = { type: "article" as const, key: "reader-delete-target" };
    const deleteReader = {
      ...reader,
      id: "reader-delete-target",
      githubId: "github-delete-target",
      githubLogin: "delete-target",
    };
    await registerReader(deleteReader);
    const created = await createCaller({ reader: deleteReader }).comments.createComment({
      target,
      content: "Keep this while the target is public",
      submissionKey: "reader-delete-target",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: created.commentId,
      status: "approved",
    });
    if (!db) throw new Error("Database has not been initialised");
    await db.update(posts).set({ public: false }).where(eq(posts.slug, target.key));

    await expect(
      createCaller({ reader: deleteReader }).comments.deleteComment({
        commentId: created.commentId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows multi-round replies while keeping a two-level presentation and target isolation", async () => {
    await seedPost("same-slug", "post");
    await seedPost("same-slug", "memo");
    const article = { type: "article" as const, key: "same-slug" };
    const memo = { type: "memo" as const, key: "same-slug" };
    const root = await createCaller({ reader }).comments.createComment({
      target: article,
      content: "Root",
      submissionKey: "root",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: root.commentId,
      status: "approved",
    });
    const reply = await createCaller({ reader }).comments.createComment({
      target: article,
      content: "Reply",
      parentId: root.commentId,
      submissionKey: "reply",
    });
    expect(reply.commentId).not.toBe(root.commentId);
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: reply.commentId,
      status: "approved",
    });
    const nested = await createCaller({ reader }).comments.createComment({
      target: article,
      content: "Nested reply",
      parentId: reply.commentId,
      submissionKey: "nested",
    });
    expect(nested.commentId).not.toBe(reply.commentId);

    const memoComment = await createCaller({ reader }).comments.createComment({
      target: memo,
      content: "Memo discussion",
      submissionKey: "memo",
    });
    expect(memoComment.commentId).not.toBe(root.commentId);
    const articleComments = await createCaller({ reader }).comments.getComments({
      slug: "same-slug",
      target: article,
    });
    const memoComments = await createCaller({ reader }).comments.getComments({
      slug: "same-slug",
      target: memo,
    });
    expect(articleComments.comments[0]?.replies).toHaveLength(2);
    expect(memoComments.comments[0]?.content).toBe("Memo discussion");
  });

  it("rejects missing content targets but accepts a catalog-only project", async () => {
    await expect(
      createCaller({ reader }).comments.createComment({
        target: { type: "article", key: "missing-article" },
        content: "Should fail",
        submissionKey: "missing-article",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createCaller({ reader }).comments.createComment({
        target: { type: "memo", key: "missing-memo" },
        content: "Should fail",
        submissionKey: "missing-memo",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const projectKey = projectCatalog[0]?.slug;
    expect(projectKey).toBeTruthy();
    const catalogReader = {
      ...reader,
      id: "reader-catalog-project",
      githubId: "github-catalog-project",
    };
    await registerReader(catalogReader);
    const created = await createCaller({ reader: catalogReader }).comments.createComment({
      target: { type: "project", key: projectKey as string },
      content: "Catalog discussion",
      submissionKey: "catalog-project",
    });
    expect(created.success).toBe(true);
  });

  it("rejects private and draft content targets", async () => {
    await seedPost("private-article");
    await seedPost("draft-memo", "memo");
    await seedPost("private-clipping", "memo");
    if (!db) throw new Error("Database has not been initialised");
    await db.update(posts).set({ public: false }).where(eq(posts.slug, "private-article"));
    await db.update(posts).set({ draft: true }).where(eq(posts.slug, "draft-memo"));
    await db
      .update(posts)
      .set({ metadata: JSON.stringify({ authoredClipping: { sourceUrl: "https://example.com" } }) })
      .where(eq(posts.slug, "private-clipping"));
    await db.insert(comments).values({
      id: "private-admin-comment",
      content: "Private Memo comment for administrator review",
      postSlug: "private-article",
      targetType: "article",
      targetKey: "private-article",
      authorName: "Legacy reader",
      authorEmail: null,
      readerId: null,
      parentId: null,
      rootId: "private-admin-comment",
      status: "pending",
      deletedAt: null,
      revision: 1,
      submissionKey: null,
      createdAt: Math.floor(Date.now() / 1000),
    });

    await expect(
      createCaller({ reader }).comments.createComment({
        target: { type: "article", key: "private-article" },
        content: "Should fail",
        submissionKey: "private-article",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "评论目标不存在" });
    await expect(
      createCaller({ reader }).comments.createComment({
        target: { type: "memo", key: "draft-memo" },
        content: "Should fail",
        submissionKey: "draft-memo",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "评论目标不存在" });
    await expect(
      createCaller({ reader }).comments.createComment({
        target: { type: "memo", key: "private-clipping" },
        content: "Should fail",
        submissionKey: "private-clipping",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "评论目标不存在" });

    await expect(
      createCaller({ isAdmin: true }).comments.getComments({
        target: { type: "article", key: "private-article" },
      })
    ).resolves.toMatchObject({
      totalPages: 1,
      isAdmin: true,
      comments: [{ content: "Private Memo comment for administrator review" }],
    });
    await expect(
      createCaller().comments.getComments({
        target: { type: "article", key: "private-article" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "评论目标不存在" });
    await expect(
      createCaller({ isAdmin: true }).comments.getComments({
        target: { type: "memo", key: "draft-memo" },
      })
    ).resolves.toMatchObject({ comments: [], totalPages: 1, isAdmin: true });
    await expect(
      createCaller({ isAdmin: true }).comments.getComments({
        target: { type: "memo", key: "private-clipping" },
      })
    ).resolves.toMatchObject({ comments: [], totalPages: 1, isAdmin: true });
  });

  it("keeps legacy slug-only reads compatible when the article is absent", async () => {
    const result = await createCaller().comments.getComments({ slug: "legacy-missing-article" });
    expect(result).toMatchObject({ comments: [], totalPages: 1, isAdmin: false });
    await expect(
      createCaller().comments.getComments({
        slug: "legacy-missing-article",
        target: { type: "article", key: "legacy-missing-article" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("hides deleted reader identity while preserving visible replies", async () => {
    await seedPost("deleted-thread");
    const target = { type: "article" as const, key: "deleted-thread" };
    const deletedReader = {
      ...reader,
      id: "reader-deleted-thread",
      githubId: "github-deleted-thread",
    };
    await registerReader(deletedReader);
    const root = await createCaller({ reader: deletedReader }).comments.createComment({
      target,
      content: "Root",
      submissionKey: "deleted-root",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: root.commentId,
      status: "approved",
    });
    const reply = await createCaller({ reader: deletedReader }).comments.createComment({
      target,
      content: "Visible reply",
      parentId: root.commentId,
      submissionKey: "deleted-reply",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: reply.commentId,
      status: "approved",
    });
    await createCaller({ reader: deletedReader }).comments.deleteComment({
      commentId: root.commentId,
    });
    const visible = await createCaller().comments.getComments({ slug: target.key, target });
    expect(visible.comments[0]).toMatchObject({
      id: root.commentId,
      deleted: true,
      content: "",
      author: { id: root.commentId, profileUrl: null },
    });

    await createCaller({ isAdmin: true }).comments.restoreComment({
      commentId: root.commentId,
      expectedRevision: 3,
    });
    const pendingRestored = await createCaller().comments.getComments({
      slug: target.key,
      target,
    });
    expect(pendingRestored.comments[0]).toMatchObject({
      id: root.commentId,
      content: "",
      placeholder: true,
      status: "approved",
      author: { nickname: "评论暂不可见", profileUrl: null },
    });
    expect(pendingRestored.comments[0]?.replies[0]?.content).toBe("Visible reply");
    await createCaller({ isAdmin: true }).comments.deleteComment({ commentId: root.commentId });
    const pendingDeleted = await createCaller().comments.getComments({ slug: target.key, target });
    expect(pendingDeleted.comments).toHaveLength(0);
  });

  it("keeps an author's pending reply visible after its parent is soft-deleted", async () => {
    await seedPost("deleted-pending-reply");
    const target = { type: "article" as const, key: "deleted-pending-reply" };
    const rootReader = {
      ...reader,
      id: "reader-pending-root",
      githubId: "github-pending-root",
      githubLogin: "pending-root",
    };
    const replyReader = {
      ...reader,
      id: "reader-pending-reply",
      githubId: "github-pending-reply",
      githubLogin: "pending-reply",
    };
    await registerReader(rootReader);
    await registerReader(replyReader);
    const root = await createCaller({ reader: rootReader }).comments.createComment({
      target,
      content: "Approved root",
      submissionKey: "pending-root",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: root.commentId,
      status: "approved",
    });
    const pendingReply = await createCaller({ reader: replyReader }).comments.createComment({
      target,
      content: "My pending reply",
      parentId: root.commentId,
      submissionKey: "pending-reply",
    });
    await createCaller({ isAdmin: true }).comments.deleteComment({ commentId: root.commentId });

    const visible = await createCaller({ reader: replyReader }).comments.getComments({
      slug: target.key,
      target,
    });
    expect(visible.comments[0]).toMatchObject({ id: root.commentId, deleted: true });
    expect(visible.comments[0]?.replies[0]).toMatchObject({
      id: pendingReply.commentId,
      content: "My pending reply",
      status: "pending",
    });
  });

  it("hides deleted own comments without visible descendants", async () => {
    await seedPost("deleted-orphan-comments");
    const target = { type: "article" as const, key: "deleted-orphan-comments" };
    const ownRootReader = {
      ...reader,
      id: "reader-deleted-orphan-root",
      githubId: "github-deleted-orphan-root",
      githubLogin: "deleted-orphan-root",
    };
    await registerReader(ownRootReader);
    const ownRoot = await createCaller({ reader: ownRootReader }).comments.createComment({
      target,
      content: "Deleted root without replies",
      submissionKey: "deleted-orphan-root",
    });
    await createCaller({ reader: ownRootReader }).comments.deleteComment({
      commentId: ownRoot.commentId,
    });
    const ownRootVisible = await createCaller({ reader: ownRootReader }).comments.getComments({
      slug: target.key,
      target,
    });
    expect(ownRootVisible.comments).toHaveLength(0);

    const parentReader = {
      ...reader,
      id: "reader-deleted-orphan-parent",
      githubId: "github-deleted-orphan-parent",
      githubLogin: "deleted-orphan-parent",
    };
    const replyReader = {
      ...reader,
      id: "reader-deleted-orphan-reply",
      githubId: "github-deleted-orphan-reply",
      githubLogin: "deleted-orphan-reply",
    };
    await registerReader(parentReader);
    await registerReader(replyReader);
    const parent = await createCaller({ reader: parentReader }).comments.createComment({
      target,
      content: "Parent without visible descendants",
      submissionKey: "deleted-orphan-parent",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: parent.commentId,
      status: "approved",
    });
    const reply = await createCaller({ reader: replyReader }).comments.createComment({
      target,
      content: "Reply that is also deleted",
      parentId: parent.commentId,
      submissionKey: "deleted-orphan-reply",
    });
    await createCaller({ isAdmin: true }).comments.deleteComment({
      commentId: parent.commentId,
    });
    await createCaller({ reader: replyReader }).comments.deleteComment({
      commentId: reply.commentId,
    });
    const deletedThread = await createCaller({ reader: replyReader }).comments.getComments({
      slug: target.key,
      target,
    });
    expect(deletedThread.comments).toHaveLength(0);
  });

  it("keeps an author's pending reply visible when its parent is rejected", async () => {
    await seedPost("rejected-pending-reply");
    const target = { type: "article" as const, key: "rejected-pending-reply" };
    const rootReader = {
      ...reader,
      id: "reader-rejected-root",
      githubId: "github-rejected-root",
      githubLogin: "rejected-root",
    };
    const replyReader = {
      ...reader,
      id: "reader-rejected-reply",
      githubId: "github-rejected-reply",
      githubLogin: "rejected-reply",
    };
    await registerReader(rootReader);
    await registerReader(replyReader);
    const root = await createCaller({ reader: rootReader }).comments.createComment({
      target,
      content: "Root that will be rejected",
      submissionKey: "rejected-root",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: root.commentId,
      status: "approved",
    });
    const pendingReply = await createCaller({ reader: replyReader }).comments.createComment({
      target,
      content: "My pending reply survives the rejection",
      parentId: root.commentId,
      submissionKey: "rejected-reply",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: root.commentId,
      status: "rejected",
    });

    const visible = await createCaller({ reader: replyReader }).comments.getComments({
      slug: target.key,
      target,
    });
    expect(visible.comments[0]).toMatchObject({ id: root.commentId, status: "approved" });
    expect(visible.comments[0]?.replies[0]).toMatchObject({
      id: pendingReply.commentId,
      content: "My pending reply survives the rejection",
      status: "pending",
    });
  });

  it("only counts approved comments for publicly readable articles", async () => {
    await seedPost("public-counts");
    await seedPost("private-counts");
    if (!db) throw new Error("Database has not been initialised");
    await db.update(posts).set({ public: false }).where(eq(posts.slug, "private-counts"));
    await db.insert(comments).values([
      {
        id: "public-count-comment",
        content: "Public",
        postSlug: "public-counts",
        targetType: "article",
        targetKey: "public-counts",
        authorName: "Legacy",
        authorEmail: "legacy@example.com",
        parentId: null,
        rootId: "public-count-comment",
        status: "approved",
        revision: 1,
        submissionKey: null,
        createdAt: 1,
      },
      {
        id: "private-count-comment",
        content: "Private",
        postSlug: "private-counts",
        targetType: "article",
        targetKey: "private-counts",
        authorName: "Legacy",
        authorEmail: "legacy@example.com",
        parentId: null,
        rootId: "private-count-comment",
        status: "approved",
        revision: 1,
        submissionKey: null,
        createdAt: 1,
      },
    ]);

    await expect(
      createCaller().comments.getCommentCounts({
        slugs: ["public-counts", "private-counts"],
      })
    ).resolves.toEqual({ "public-counts": 1 });
  });

  it("paginates long reply threads with an opaque cursor", async () => {
    await seedPost("long-thread");
    const target = { type: "article" as const, key: "long-thread" };
    const longReader = { ...reader, id: "reader-long-thread", githubId: "github-long-thread" };
    if (!db) throw new Error("Database has not been initialised");
    await db
      .insert(readers)
      .values({ ...longReader, createdAt: Date.now(), updatedAt: Date.now() });
    const root = await createCaller({ reader: longReader }).comments.createComment({
      target,
      content: "Root",
      submissionKey: "long-root",
    });
    await createCaller({ isAdmin: true }).comments.moderateComment({
      commentId: root.commentId,
      status: "approved",
    });
    const now = Math.floor(Date.now() / 1000);
    await db.insert(comments).values(
      Array.from({ length: 21 }, (_, index) => ({
        id: `long-reply-${index}`,
        content: `Reply ${index}`,
        postSlug: target.key,
        targetType: target.type,
        targetKey: target.key,
        authorName: reader.githubLogin,
        authorEmail: null,
        readerId: reader.id,
        parentId: root.commentId,
        rootId: root.commentId,
        status: "approved" as const,
        revision: 1,
        submissionKey: `long-reply-${index}`,
        createdAt: now + index,
      }))
    );

    const first = await createCaller({ reader: longReader }).comments.getComments({
      slug: target.key,
      target,
    });
    expect(first.comments[0]?.replies).toHaveLength(20);
    expect(first.comments[0]?.repliesNextCursor).toBeTruthy();

    const next = await createCaller({ reader: longReader }).comments.getCommentReplies({
      commentId: root.commentId,
      cursor: first.comments[0]?.repliesNextCursor ?? undefined,
    });
    expect(next.replies).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
  });
});
