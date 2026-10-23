import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  or,
} from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getAvatarUrl } from "../../lib/avatar";
import { assertCommentMigrationReady } from "../../lib/comment-migration";
import { db } from "../../lib/db";
import { projectCatalog } from "../../lib/project-catalog";
import { comments, posts, readers, users } from "../../lib/schema";
import { toMsTimestamp } from "../../lib/utils";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";

const commentsPublicProcedure = publicProcedure.use(async ({ next }) => {
  await assertCommentMigrationReady();
  return next();
});

const commentsAdminProcedure = adminProcedure.use(async ({ next }) => {
  await assertCommentMigrationReady();
  return next();
});

const targetTypeSchema = z.enum(["article", "memo", "project"]);
const targetSchema = z.object({ type: targetTypeSchema, key: z.string().trim().min(1).max(300) });

const postCommentSchema = z
  .object({
    target: targetSchema.optional(),
    postSlug: z.string().trim().min(1).max(300).optional(),
    content: z.string().min(1).max(1000),
    parentId: z.string().optional(),
    replyToId: z.string().optional(),
    submissionKey: z.string().trim().min(1).max(128).optional(),
  })
  .refine((input) => input.target || input.postSlug, {
    message: "评论目标不能为空",
    path: ["target"],
  });

const getCommentsSchema = z
  .object({
    target: targetSchema.optional(),
    slug: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .refine((input) => input.target || input.slug, {
    message: "评论目标不能为空",
    path: ["target"],
  });

const getCommentRepliesSchema = z.object({
  commentId: z.string(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

const moderateCommentSchema = z.object({
  commentId: z.string(),
  status: z.enum(["approved", "rejected", "pending"]),
  expectedRevision: z.number().int().positive().optional(),
});

const editCommentSchema = z.object({
  commentId: z.string(),
  content: z.string().trim().min(1).max(1000),
  expectedRevision: z.number().int().positive().optional(),
});

const deleteCommentSchema = z.object({
  commentId: z.string(),
  expectedRevision: z.number().int().positive().optional(),
});

const restoreCommentSchema = z.object({
  commentId: z.string(),
  expectedRevision: z.number().int().positive().optional(),
});

const getCommentCountsSchema = z.object({ slugs: z.array(z.string()).max(50) });

const getAdminCommentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "approved", "rejected", "deleted", "all"]).default("all"),
  search: z.string().optional(),
  postSlug: z.string().optional(),
  targetType: targetTypeSchema.optional(),
  includeDeleted: z.boolean().default(true),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(["createdAt", "postSlug", "author"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const batchModerateSchema = z.object({
  commentIds: z.array(z.string()).min(1),
  status: z.enum(["approved", "rejected", "pending"]),
});

const batchDeleteSchema = z.object({ commentIds: z.array(z.string()).min(1) });

type Target = z.infer<typeof targetSchema>;

type PublicComment = {
  id: string;
  content: string;
  createdAt: number;
  parentId: string | null;
  rootId: string | null;
  target: Target;
  status: "pending" | "approved" | "rejected";
  deleted: boolean;
  placeholder: boolean;
  revision: number;
  authorEmail: string | null;
  author: {
    id: string;
    nickname: string | null;
    avatarUrl: string;
    profileUrl?: string | null;
  };
  canDelete: boolean;
  canModerate: boolean;
  replies: PublicComment[];
  repliesNextCursor: string | null;
};

const rateBuckets = new Map<
  string,
  { minuteStart: number; minute: number; hourStart: number; hour: number }
>();

function normalizeTarget(input: { target?: Target; postSlug?: string }): Target {
  if (input.target) return input.target;
  return { type: "article", key: input.postSlug?.trim() || "" };
}

function targetCondition(target: Target) {
  return and(eq(comments.targetType, target.type), eq(comments.targetKey, target.key));
}

type ReplyCursor = { createdAt: number; id: string };

function encodeReplyCursor(cursor: ReplyCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeReplyCursor(value: string | undefined): ReplyCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<ReplyCursor>;
    if (typeof parsed.createdAt !== "number" || typeof parsed.id !== "string") return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

async function assertPublicTarget(target: Target) {
  if (target.type === "project") {
    if (!projectCatalog.some((project) => project.slug === target.key)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "评论目标不存在" });
    }
    return;
  }
  const expectedType = target.type === "article" ? "post" : target.type;
  const row = await db
    .select({ type: posts.type, draft: posts.draft, public: posts.public })
    .from(posts)
    .where(and(eq(posts.slug, target.key), eq(posts.type, expectedType)))
    .get();
  if (!row || row.draft || !row.public) {
    throw new TRPCError({ code: "NOT_FOUND", message: "评论目标不存在" });
  }
}

function enforceRateLimit(readerId: string) {
  const now = Date.now();
  const existing = rateBuckets.get(readerId);
  if (!existing || now - existing.hourStart >= 60 * 60 * 1000) {
    rateBuckets.set(readerId, { minuteStart: now, minute: 1, hourStart: now, hour: 1 });
    return;
  }
  const minuteStart = now - existing.minuteStart >= 60 * 1000 ? now : existing.minuteStart;
  const minute = minuteStart === now ? 1 : existing.minute + 1;
  const hour = existing.hour + 1;
  if (minute > 5 || hour > 30) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "评论提交过于频繁，请稍后再试" });
  }
  rateBuckets.set(readerId, { minuteStart, minute, hourStart: existing.hourStart, hour });
}

async function loadAuthorMaps(rows: Array<typeof comments.$inferSelect>) {
  const readerIds = [...new Set(rows.flatMap((row) => (row.readerId ? [row.readerId] : [])))];
  const emails = [...new Set(rows.flatMap((row) => (row.authorEmail ? [row.authorEmail] : [])))];
  const readerRows = readerIds.length
    ? await db.select().from(readers).where(inArray(readers.id, readerIds)).all()
    : [];
  const userRows = emails.length
    ? await db.select().from(users).where(inArray(users.email, emails)).all()
    : [];
  return {
    readers: new Map(readerRows.map((row) => [row.id, row])),
    users: new Map(userRows.map((row) => [row.email, row])),
  };
}

async function buildPublicComments(
  target: Target,
  readerId: string | undefined,
  isAdmin: boolean,
  options: {
    rootOffset?: number;
    rootLimit?: number;
    replyRootId?: string;
    replyCursor?: ReplyCursor | null;
    replyLimit?: number;
  } = {}
) {
  const visibleReplyRoots = isAdmin
    ? []
    : (
        await db
          .select({ rootId: comments.rootId })
          .from(comments)
          .where(
            and(
              targetCondition(target),
              isNotNull(comments.parentId),
              eq(comments.status, "approved"),
              isNull(comments.deletedAt),
              isNotNull(comments.rootId)
            )
          )
          .groupBy(comments.rootId)
          .all()
      ).flatMap((row) => (row.rootId ? [row.rootId] : []));
  const ownReplyRoots = readerId
    ? (
        await db
          .select({ rootId: comments.rootId })
          .from(comments)
          .where(
            and(
              targetCondition(target),
              isNotNull(comments.parentId),
              eq(comments.readerId, readerId),
              isNull(comments.deletedAt),
              isNotNull(comments.rootId)
            )
          )
          .groupBy(comments.rootId)
          .all()
      ).flatMap((row) => (row.rootId ? [row.rootId] : []))
    : [];
  const ownRootCondition = readerId ? eq(comments.readerId, readerId) : undefined;
  const rootsWithVisibleReplies =
    visibleReplyRoots.length || ownReplyRoots.length
      ? or(
          visibleReplyRoots.length
            ? and(eq(comments.status, "approved"), inArray(comments.id, visibleReplyRoots))
            : undefined,
          visibleReplyRoots.length
            ? and(
                eq(comments.status, "pending"),
                isNull(comments.deletedAt),
                inArray(comments.id, visibleReplyRoots)
              )
            : undefined,
          ownReplyRoots.length ? inArray(comments.id, ownReplyRoots) : undefined
        )
      : undefined;
  const visibilityCondition = isAdmin
    ? undefined
    : or(
        and(eq(comments.status, "approved"), isNull(comments.deletedAt)),
        ownRootCondition,
        rootsWithVisibleReplies
      );
  const rootWhere = and(targetCondition(target), isNull(comments.parentId), visibilityCondition);
  const totalRoots = options.replyRootId
    ? 1
    : ((await db.select({ count: count() }).from(comments).where(rootWhere).get())?.count ?? 0);
  const rootRows = await db
    .select()
    .from(comments)
    .where(options.replyRootId ? and(rootWhere, eq(comments.id, options.replyRootId)) : rootWhere)
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(options.replyRootId ? 1 : (options.rootLimit ?? 10))
    .offset(options.replyRootId ? 0 : (options.rootOffset ?? 0))
    .all();
  const replyLimit = options.replyLimit ?? 20;
  const replyRowsByRoot = new Map<string, Array<typeof comments.$inferSelect>>();
  await Promise.all(
    rootRows.map(async (root) => {
      const replyVisibility = isAdmin
        ? undefined
        : or(
            and(eq(comments.status, "approved"), isNull(comments.deletedAt)),
            readerId ? eq(comments.readerId, readerId) : undefined
          );
      const cursorCondition = options.replyCursor
        ? or(
            gt(comments.createdAt, options.replyCursor.createdAt),
            and(
              eq(comments.createdAt, options.replyCursor.createdAt),
              gt(comments.id, options.replyCursor.id)
            )
          )
        : undefined;
      const rows = await db
        .select()
        .from(comments)
        .where(
          and(
            targetCondition(target),
            eq(comments.rootId, root.id),
            isNotNull(comments.parentId),
            replyVisibility,
            options.replyRootId === root.id ? cursorCondition : undefined
          )
        )
        .orderBy(asc(comments.createdAt), asc(comments.id))
        .limit(replyLimit + 1)
        .all();
      replyRowsByRoot.set(root.id, rows);
    })
  );
  const visibleRows = rootRows.flatMap((root) => [root, ...(replyRowsByRoot.get(root.id) ?? [])]);
  const maps = await loadAuthorMaps(visibleRows);
  const mapped = new Map<string, PublicComment>();
  for (const row of visibleRows) {
    const reader = row.readerId ? maps.readers.get(row.readerId) : undefined;
    const legacyUser = row.authorEmail ? maps.users.get(row.authorEmail) : undefined;
    const deleted = Boolean(row.deletedAt);
    const own = Boolean(readerId && row.readerId === readerId);
    const placeholder = !isAdmin && !own && !deleted && row.status !== "approved";
    const authorName =
      reader?.displayName || reader?.githubLogin || legacyUser?.name || row.authorName;
    const rootId = row.rootId || (row.parentId ? null : row.id);
    mapped.set(row.id, {
      id: row.id,
      content: deleted && !isAdmin ? "" : placeholder ? "" : row.content,
      createdAt: toMsTimestamp(row.createdAt),
      parentId: row.parentId,
      rootId,
      target: { type: row.targetType, key: row.targetKey },
      status: placeholder ? "approved" : row.status,
      deleted,
      revision: row.revision,
      authorEmail: isAdmin ? row.authorEmail : null,
      author: {
        id:
          deleted && !isAdmin
            ? row.id
            : placeholder
              ? row.id
              : reader?.id || legacyUser?.id || (isAdmin ? row.authorEmail : null) || row.id,
        nickname: deleted && !isAdmin ? "已删除" : placeholder ? "评论暂不可见" : authorName,
        avatarUrl:
          (deleted || placeholder) && !isAdmin
            ? "/site-assets/default-avatar.svg"
            : reader?.avatarUrl || "/site-assets/default-avatar.svg",
        profileUrl: deleted || placeholder ? null : reader?.profileUrl,
      },
      canDelete: isAdmin || own,
      canModerate: isAdmin,
      replies: [],
      repliesNextCursor: null,
      placeholder,
    });
  }
  const roots: PublicComment[] = [];
  for (const rootRow of rootRows) {
    const root = mapped.get(rootRow.id);
    if (!root) continue;
    const replyRows = replyRowsByRoot.get(rootRow.id) ?? [];
    root.replies = replyRows.slice(0, replyLimit).flatMap((row) => {
      const reply = mapped.get(row.id);
      return reply ? [reply] : [];
    });
    const lastReply = replyRows[replyLimit - 1];
    if (replyRows.length > replyLimit && lastReply) {
      root.repliesNextCursor = encodeReplyCursor({
        createdAt: lastReply.createdAt,
        id: lastReply.id,
      });
    }
    roots.push(root);
  }
  return { roots, totalRoots };
}

async function updateWithRevision(
  commentId: string,
  expectedRevision: number | undefined,
  values: Partial<typeof comments.$inferInsert>
) {
  const existing = await db.select().from(comments).where(eq(comments.id, commentId)).get();
  if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
  if (expectedRevision !== undefined && existing.revision !== expectedRevision) {
    throw new TRPCError({ code: "CONFLICT", message: "评论已被其他操作更新，请刷新后重试" });
  }
  const updated = await db
    .update(comments)
    .set({ ...values, revision: existing.revision + 1 })
    .where(and(eq(comments.id, commentId), eq(comments.revision, existing.revision)))
    .returning()
    .get();
  if (!updated) {
    throw new TRPCError({ code: "CONFLICT", message: "评论已被其他操作更新，请刷新后重试" });
  }
  return updated;
}

export const commentsRouter = createTRPCRouter({
  getComments: commentsPublicProcedure.input(getCommentsSchema).query(async ({ input, ctx }) => {
    const target = input.target || { type: "article" as const, key: input.slug as string };
    try {
      await assertPublicTarget(target);
    } catch (error) {
      // Keep the legacy slug-only read contract usable for old pages whose content
      // is absent from the current database; explicit target reads stay strict.
      if (!input.target && error instanceof TRPCError && error.code === "NOT_FOUND") {
        return {
          comments: [],
          totalPages: 1,
          isAdmin: ctx.isAdmin,
          target,
        };
      }
      throw error;
    }
    const { roots, totalRoots } = await buildPublicComments(target, ctx.reader?.id, ctx.isAdmin, {
      rootOffset: (input.page - 1) * input.limit,
      rootLimit: input.limit,
    });
    return {
      comments: roots,
      totalPages: Math.max(1, Math.ceil(totalRoots / input.limit)),
      isAdmin: ctx.isAdmin,
      target,
    };
  }),

  getCommentReplies: commentsPublicProcedure
    .input(getCommentRepliesSchema)
    .query(async ({ input, ctx }) => {
      const comment = await db
        .select()
        .from(comments)
        .where(eq(comments.id, input.commentId))
        .get();
      if (!comment) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
      const target = { type: comment.targetType, key: comment.targetKey } as Target;
      await assertPublicTarget(target);
      let rootId = comment.rootId || comment.id;
      const seen = new Set<string>();
      let current = comment;
      while (!comment.rootId && current.parentId && !seen.has(current.id)) {
        seen.add(current.id);
        const parent = await db
          .select()
          .from(comments)
          .where(eq(comments.id, current.parentId))
          .get();
        if (!parent || parent.targetType !== target.type || parent.targetKey !== target.key) break;
        rootId = parent.id;
        current = parent;
      }
      const cursor = decodeReplyCursor(input.cursor);
      if (input.cursor && !cursor) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "回复游标无效" });
      }
      const { roots } = await buildPublicComments(target, ctx.reader?.id, ctx.isAdmin, {
        replyRootId: rootId,
        replyCursor: cursor,
        replyLimit: input.limit,
      });
      const root = roots.find((item) => item.id === rootId);
      if (!root) throw new TRPCError({ code: "NOT_FOUND", message: "评论不可见" });
      const requestedIsVisible =
        root.id === comment.id || root.replies.some((reply) => reply.id === comment.id);
      if (!requestedIsVisible) {
        throw new TRPCError({ code: "NOT_FOUND", message: "评论不可见" });
      }
      return { replies: root.replies, nextCursor: root.repliesNextCursor };
    }),

  getCommentCounts: commentsPublicProcedure
    .input(getCommentCountsSchema)
    .query(async ({ input }) => {
      if (input.slugs.length === 0) return {};
      const publicPosts = await db
        .select({ slug: posts.slug })
        .from(posts)
        .where(
          and(
            inArray(posts.slug, input.slugs),
            eq(posts.type, "post"),
            eq(posts.draft, false),
            eq(posts.public, true)
          )
        )
        .all();
      const publicSlugs = publicPosts.map((row) => row.slug);
      if (publicSlugs.length === 0) return {};
      const rows = await db
        .select({ postSlug: comments.targetKey, count: count() })
        .from(comments)
        .where(
          and(
            inArray(comments.targetKey, publicSlugs),
            eq(comments.targetType, "article"),
            eq(comments.status, "approved"),
            isNull(comments.deletedAt)
          )
        )
        .groupBy(comments.targetKey)
        .all();
      return Object.fromEntries(rows.map((row) => [row.postSlug, row.count]));
    }),

  createComment: commentsPublicProcedure
    .input(postCommentSchema)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.reader) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "请先使用 GitHub 登录" });
      }
      const target = normalizeTarget(input);
      await assertPublicTarget(target);
      const content = input.content.trim();
      if (!content) throw new TRPCError({ code: "BAD_REQUEST", message: "评论内容不能为空" });
      const parentId = input.replyToId || input.parentId || null;
      const submissionKey = input.submissionKey || uuidv4();
      const existingSubmission = await db
        .select()
        .from(comments)
        .where(and(eq(comments.readerId, ctx.reader.id), eq(comments.submissionKey, submissionKey)))
        .get();
      if (existingSubmission) {
        if (
          existingSubmission.content !== content ||
          existingSubmission.targetType !== target.type ||
          existingSubmission.targetKey !== target.key ||
          existingSubmission.parentId !== parentId
        ) {
          throw new TRPCError({ code: "CONFLICT", message: "submissionKey 已用于另一条评论" });
        }
        return {
          success: true,
          commentId: existingSubmission.id,
          message: "评论已提交，正在等待审核",
        };
      }
      enforceRateLimit(ctx.reader.id);
      let rootId: string | null = null;
      if (parentId) {
        const parent = await db.select().from(comments).where(eq(comments.id, parentId)).get();
        if (
          !parent ||
          parent.targetType !== target.type ||
          parent.targetKey !== target.key ||
          parent.status !== "approved" ||
          parent.deletedAt
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "只能回复当前目标下已通过且未删除的评论",
          });
        }
        rootId = parent.rootId || parent.id;
      }
      const now = Math.floor(Date.now() / 1000);
      const commentId = uuidv4();
      try {
        await db.insert(comments).values({
          id: commentId,
          content,
          postSlug: target.key,
          targetType: target.type,
          targetKey: target.key,
          authorName: ctx.reader.displayName || ctx.reader.githubLogin,
          authorEmail: null,
          readerId: ctx.reader.id,
          parentId,
          rootId,
          status: "pending",
          revision: 1,
          submissionKey,
          createdAt: now,
        });
      } catch (error) {
        const concurrentSubmission = await db
          .select()
          .from(comments)
          .where(
            and(eq(comments.readerId, ctx.reader.id), eq(comments.submissionKey, submissionKey))
          )
          .get();
        if (!concurrentSubmission) throw error;
        if (
          concurrentSubmission.content !== content ||
          concurrentSubmission.targetType !== target.type ||
          concurrentSubmission.targetKey !== target.key ||
          concurrentSubmission.parentId !== parentId
        ) {
          throw new TRPCError({ code: "CONFLICT", message: "submissionKey 已用于另一条评论" });
        }
        return {
          success: true,
          commentId: concurrentSubmission.id,
          message: "评论已提交，正在等待审核",
        };
      }
      return { success: true, commentId, message: "评论已提交，正在等待审核" };
    }),

  moderateComment: commentsAdminProcedure
    .input(moderateCommentSchema)
    .mutation(async ({ input }) => {
      const existing = await db
        .select()
        .from(comments)
        .where(eq(comments.id, input.commentId))
        .get();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
      if (existing.deletedAt) {
        throw new TRPCError({ code: "CONFLICT", message: "已删除评论不能直接通过" });
      }
      await updateWithRevision(input.commentId, input.expectedRevision, { status: input.status });
      return { success: true, message: "评论状态已更新" };
    }),

  restoreComment: commentsAdminProcedure.input(restoreCommentSchema).mutation(async ({ input }) => {
    const existing = await db.select().from(comments).where(eq(comments.id, input.commentId)).get();
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
    if (!existing.deletedAt) return { success: true, message: "评论无需恢复" };
    await updateWithRevision(input.commentId, input.expectedRevision, {
      deletedAt: null,
      status: "pending",
    });
    return { success: true, message: "评论已恢复并进入待审" };
  }),

  editComment: commentsAdminProcedure.input(editCommentSchema).mutation(async ({ input }) => {
    await updateWithRevision(input.commentId, input.expectedRevision, { content: input.content });
    return { success: true, message: "评论已更新" };
  }),

  deleteComment: commentsPublicProcedure
    .input(deleteCommentSchema)
    .mutation(async ({ input, ctx }) => {
      const existing = await db
        .select()
        .from(comments)
        .where(eq(comments.id, input.commentId))
        .get();
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "评论不存在" });
      const canDelete =
        ctx.isAdmin || Boolean(ctx.reader?.id && existing.readerId === ctx.reader.id);
      if (!canDelete) throw new TRPCError({ code: "FORBIDDEN", message: "没有权限删除此评论" });
      if (!ctx.isAdmin) {
        await assertPublicTarget({ type: existing.targetType, key: existing.targetKey } as Target);
      }
      if (existing.deletedAt) {
        if (input.expectedRevision !== undefined && existing.revision !== input.expectedRevision) {
          throw new TRPCError({ code: "CONFLICT", message: "评论已被其他操作更新，请刷新后重试" });
        }
      } else {
        await updateWithRevision(input.commentId, input.expectedRevision, {
          deletedAt: Date.now(),
        });
      }
      return { success: true, message: "评论已删除" };
    }),

  getAdminComments: commentsAdminProcedure
    .input(getAdminCommentsSchema)
    .query(async ({ input }) => {
      const conditions = [];
      if (input.status === "deleted") conditions.push(isNotNull(comments.deletedAt));
      else if (input.status !== "all") {
        conditions.push(eq(comments.status, input.status));
        conditions.push(isNull(comments.deletedAt));
      }
      if (input.postSlug) conditions.push(eq(comments.postSlug, input.postSlug));
      if (input.targetType) conditions.push(eq(comments.targetType, input.targetType));
      if (input.status === "all" && !input.includeDeleted)
        conditions.push(isNull(comments.deletedAt));
      if (input.search) {
        conditions.push(
          or(
            like(comments.content, `%${input.search}%`),
            like(comments.authorName, `%${input.search}%`)
          )
        );
      }
      if (input.startDate)
        conditions.push(
          gte(comments.createdAt, Math.floor(new Date(input.startDate).getTime() / 1000))
        );
      if (input.endDate)
        conditions.push(
          lte(comments.createdAt, Math.floor(new Date(input.endDate).getTime() / 1000))
        );
      const whereClause = conditions.length ? and(...conditions) : undefined;
      const sort =
        input.sortBy === "createdAt"
          ? comments.createdAt
          : input.sortBy === "postSlug"
            ? comments.postSlug
            : comments.authorName;
      const rows = await db
        .select()
        .from(comments)
        .where(whereClause)
        .orderBy(input.sortOrder === "asc" ? asc(sort) : desc(sort))
        .limit(input.limit)
        .offset((input.page - 1) * input.limit)
        .all();
      const total =
        (await db.select({ count: count() }).from(comments).where(whereClause).get())?.count || 0;
      return {
        comments: rows.map((row) => ({
          ...row,
          createdAt: toMsTimestamp(row.createdAt),
          deleted: Boolean(row.deletedAt),
          author: {
            id: row.readerId || row.authorEmail || row.id,
            nickname: row.authorName,
            email: row.authorEmail,
            avatarUrl: row.authorEmail
              ? getAvatarUrl(row.authorEmail)
              : "/site-assets/default-avatar.svg",
          },
        })),
        totalCount: total,
        totalPages: Math.max(1, Math.ceil(total / input.limit)),
        currentPage: input.page,
      };
    }),

  getCommentStats: commentsAdminProcedure.query(async () => {
    const now = Math.floor(Date.now() / 1000);
    const active = isNull(comments.deletedAt);
    const statusStats = await db
      .select({ status: comments.status, count: count() })
      .from(comments)
      .where(active)
      .groupBy(comments.status)
      .all();
    const total =
      (await db.select({ count: count() }).from(comments).where(active).get())?.count || 0;
    const today =
      (
        await db
          .select({ count: count() })
          .from(comments)
          .where(and(active, gte(comments.createdAt, now - 24 * 60 * 60)))
          .get()
      )?.count || 0;
    const thisWeek =
      (
        await db
          .select({ count: count() })
          .from(comments)
          .where(and(active, gte(comments.createdAt, now - 7 * 24 * 60 * 60)))
          .get()
      )?.count || 0;
    const pending = statusStats.find((item) => item.status === "pending")?.count || 0;
    return {
      total,
      today,
      thisWeek,
      pending,
      byStatus: Object.fromEntries(statusStats.map((item) => [item.status, item.count])),
    };
  }),

  batchModerate: commentsAdminProcedure.input(batchModerateSchema).mutation(async ({ input }) => {
    const results = [];
    for (const id of new Set(input.commentIds)) {
      const row = await db.select().from(comments).where(eq(comments.id, id)).get();
      if (!row) results.push({ id, result: "failed", reason: "not_found" });
      else if (row.deletedAt) results.push({ id, result: "skipped", reason: "deleted" });
      else {
        try {
          await updateWithRevision(id, row.revision, { status: input.status });
          results.push({ id, result: "success" });
        } catch (error) {
          results.push({
            id,
            result: "failed",
            reason: error instanceof TRPCError ? error.code.toLowerCase() : "error",
          });
        }
      }
    }
    return { success: true, results };
  }),

  batchDelete: commentsAdminProcedure.input(batchDeleteSchema).mutation(async ({ input }) => {
    const results = [];
    for (const id of new Set(input.commentIds)) {
      const row = await db.select().from(comments).where(eq(comments.id, id)).get();
      if (!row) results.push({ id, result: "failed", reason: "not_found" });
      else if (row.deletedAt) results.push({ id, result: "skipped", reason: "deleted" });
      else {
        try {
          await updateWithRevision(id, row.revision, { deletedAt: Date.now() });
          results.push({ id, result: "success" });
        } catch (error) {
          results.push({
            id,
            result: "failed",
            reason: error instanceof TRPCError ? error.code.toLowerCase() : "error",
          });
        }
      }
    }
    return { success: true, results };
  }),
});
