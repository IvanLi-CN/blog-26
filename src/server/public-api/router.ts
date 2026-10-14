import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { getActiveLocalBasePath } from "@/config/paths";
import type { SearchSuggestionReason } from "@/lib/ai/search-suggestions";
import { db } from "@/lib/db";
import { getServerLocalMemoRootPath } from "@/lib/memo-paths";
import { getRuntimePlaybookStore } from "@/lib/playbook/cache";
import { appendPublicCorsHeaders, createPublicCorsPreflightResponse } from "@/lib/public-cors";
import { resolveRuntimeContext } from "@/lib/runtime-context";
import { posts, systemShareSubmissions } from "@/lib/schema";
import { normalizeSystemShare, validateSystemShareFiles } from "@/lib/system-share";
import { buildPublicSnapshot, resolvePublicMemoTitle } from "@/public-site/snapshot";
import { handleClippingRequest } from "@/server/clipping/api";
import { isClippingRowPublic } from "@/server/clipping/projection";
import { readAuthoredMemo } from "@/server/clipping/store";
import { createContext } from "@/server/context";
import { handlePublicAssetFacadeRequest } from "@/server/public-media";
import { appRouter } from "@/server/router";
import { suggestPublicSearchTerms } from "@/server/services/search-suggestions";
import { handlePlaybookRequest } from "./playbook";

const PUBLIC_API_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"] as const;
const SEARCH_SUGGESTION_REASONS = new Set<SearchSuggestionReason>([
  "initial",
  "empty",
  "error",
  "filtered_empty",
]);
const SYSTEM_SHARE_PROCESSING_TTL_MS = 15 * 60 * 1000;

function json(request: Request, data: unknown, init: ResponseInit = {}, extraHeaders?: Headers) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  if (extraHeaders) {
    for (const [key, value] of extraHeaders.entries()) {
      headers.set(key, value);
    }
  }
  appendPublicCorsHeaders(headers, request, PUBLIC_API_ALLOWED_METHODS);
  return new Response(JSON.stringify(data), { ...init, headers });
}

function statusFromTrpcError(error: TRPCError) {
  switch (error.code) {
    case "BAD_REQUEST":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_SUPPORTED":
      return 405;
    case "CONFLICT":
      return 409;
    case "SERVICE_UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

async function parseBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    return await request.json();
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid JSON body" });
  }
}

async function createCallerForRequest(request: Request) {
  const resHeaders = new Headers();
  const ctx = await createContext({ req: request, resHeaders });
  return {
    caller: appRouter.createCaller(ctx),
    resHeaders,
    ctx,
  };
}

function methodNotAllowed(request: Request, method: string) {
  return json(request, { error: `Method ${method} not allowed` }, { status: 405 });
}

function normalizeSuggestionReason(value: string | null): SearchSuggestionReason {
  return SEARCH_SUGGESTION_REASONS.has(value as SearchSuggestionReason)
    ? (value as SearchSuggestionReason)
    : "empty";
}

async function handleSystemShareRequest(
  request: Request,
  caller: ReturnType<typeof appRouter.createCaller>,
  ctx: Awaited<ReturnType<typeof createContext>>,
  resHeaders: Headers
) {
  if (request.method !== "POST") return methodNotAllowed(request, request.method);
  if (resolveRuntimeContext(request).mode !== "console") {
    return json(request, { error: "Not found" }, { status: 404 });
  }
  if (!ctx.isAdmin)
    throw new TRPCError({ code: "FORBIDDEN", message: "只有管理员可以发布分享内容。" });

  const form = await request.formData();
  const submissionId = String(form.get("submissionId") || "").trim();
  if (!/^[0-9a-f-]{16,80}$/iu.test(submissionId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "分享提交标识无效。" });
  }

  const now = Date.now();
  const existing = await db
    .select()
    .from(systemShareSubmissions)
    .where(eq(systemShareSubmissions.submissionId, submissionId))
    .limit(1)
    .then((rows) => rows[0]);
  if (existing?.state === "completed" && existing.memoId) {
    return json(
      request,
      { ok: true, duplicate: true, memoId: existing.memoId },
      { status: 200 },
      resHeaders
    );
  }
  if (existing && now - existing.updatedAt < SYSTEM_SHARE_PROCESSING_TTL_MS) {
    throw new TRPCError({ code: "CONFLICT", message: "该分享正在处理中，请稍后重试。" });
  }
  if (existing)
    await db
      .delete(systemShareSubmissions)
      .where(eq(systemShareSubmissions.submissionId, submissionId));
  try {
    await db.insert(systemShareSubmissions).values({
      submissionId,
      memoId: null,
      state: "processing",
      createdAt: now,
      updatedAt: now,
    });
  } catch {
    throw new TRPCError({ code: "CONFLICT", message: "该分享正在处理中，请稍后重试。" });
  }

  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  const fileDescriptors = files.map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
  }));
  const fileValidation = validateSystemShareFiles(fileDescriptors);
  if (!fileValidation.ok) {
    await db
      .delete(systemShareSubmissions)
      .where(eq(systemShareSubmissions.submissionId, submissionId));
    throw new TRPCError({ code: "BAD_REQUEST", message: fileValidation.error });
  }

  const rawTags = String(form.get("tags") || "[]");
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(rawTags);
    tags = Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    await db
      .delete(systemShareSubmissions)
      .where(eq(systemShareSubmissions.submissionId, submissionId));
    throw new TRPCError({ code: "BAD_REQUEST", message: "标签格式无效。" });
  }

  const normalized = normalizeSystemShare({
    title: String(form.get("title") || ""),
    text: String(form.get("text") || ""),
    url: String(form.get("url") || ""),
    tags,
    isPublic: String(form.get("isPublic") || "false") === "true",
    files: fileDescriptors,
  });
  const basePath = getActiveLocalBasePath();
  if (!basePath) {
    await db
      .delete(systemShareSubmissions)
      .where(eq(systemShareSubmissions.submissionId, submissionId));
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "本地内容源未启用。" });
  }

  const stagedPaths: string[] = [];
  try {
    const memoRoot = getServerLocalMemoRootPath();
    const attachments = [];
    for (const [index, file] of files.entries()) {
      const originalName = basename(file.name || `file-${index + 1}`);
      const safeName = originalName.replace(/[^a-z0-9._-]+/giu, "_") || `file-${index + 1}`;
      const filename = `system-share-${submissionId.slice(0, 8)}-${index + 1}-${safeName}`;
      const persistedPath = `${memoRoot.replace(/^\/+/, "")}/assets/system-share/${filename}`;
      const fullPath = join(basePath, persistedPath);
      await mkdir(join(basePath, memoRoot.replace(/^\/+/, ""), "assets", "system-share"), {
        recursive: true,
      });
      await writeFile(fullPath, new Uint8Array(await file.arrayBuffer()), { flag: "wx" });
      stagedPaths.push(fullPath);
      attachments.push({
        filename: file.name || filename,
        path: `./assets/system-share/${filename}`,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        isImage: file.type.startsWith("image/"),
      });
    }

    const result = await caller.memos.create({
      content: normalized.classification === "clipping" ? normalized.remarks : normalized.text,
      title: normalized.title || undefined,
      isPublic: normalized.isPublic,
      tags: normalized.tags,
      attachments,
      systemShare: {
        source: "system-share" as const,
        ...(normalized.url ? { targetUrl: normalized.url } : {}),
      },
    });
    const memoId = typeof result === "object" && result && "id" in result ? String(result.id) : "";
    if (!memoId) throw new Error("Memo 创建结果缺少 id");
    await db
      .update(systemShareSubmissions)
      .set({ memoId, state: "completed", updatedAt: Date.now() })
      .where(eq(systemShareSubmissions.submissionId, submissionId));
    return json(request, { ok: true, memo: result }, { status: 201 }, resHeaders);
  } catch (error) {
    await Promise.all(stagedPaths.map((path) => rm(path, { force: true }).catch(() => undefined)));
    await db
      .delete(systemShareSubmissions)
      .where(eq(systemShareSubmissions.submissionId, submissionId));
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "分享内容创建失败，请重试。" });
  }
}

async function normalizePublicSearchTitles<
  T extends { slug: string; type?: string; title?: string | null },
>(results: T[]) {
  const memoSlugs = Array.from(
    new Set(results.filter((result) => result.type === "memo").map((result) => result.slug))
  );
  if (memoSlugs.length === 0) return results;

  const memoRows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.type, "memo"), inArray(posts.slug, memoSlugs)));
  const publicBySlug = new Map(
    await Promise.all(
      memoRows.map(async (row) => [row.slug, await isClippingRowPublic(row)] as const)
    )
  );
  const titleBySlug = new Map(
    await Promise.all(
      memoRows
        .filter((row) => publicBySlug.get(row.slug) ?? false)
        .map(async (row) => [row.slug, await resolvePublicMemoTitle(row)] as const)
    )
  );

  return results
    .map((result) =>
      result.type === "memo" && titleBySlug.has(result.slug)
        ? { ...result, title: titleBySlug.get(result.slug) ?? null }
        : result
    )
    .filter((result) => result.type !== "memo" || (publicBySlug.get(result.slug) ?? false));
}

export async function handlePublicApiRequest(request: Request, subPath: string) {
  try {
    if (request.method === "OPTIONS") {
      return createPublicCorsPreflightResponse(request, PUBLIC_API_ALLOWED_METHODS);
    }

    const url = new URL(request.url);
    const pathname = subPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

    const assetMatch = pathname.match(
      /^\/assets\/(post|memo)\/([^/]+)\/([0-9a-f]+)\/(card|cover|content|full|social|poster|play)\.([a-z0-9]+)$/iu
    );
    if (assetMatch) {
      return handlePublicAssetFacadeRequest(request, {
        kind: assetMatch[1],
        slug: decodeURIComponent(assetMatch[2]),
        mediaHash: assetMatch[3],
        variant: assetMatch[4],
        ext: assetMatch[5],
      });
    }

    if (pathname === "/snapshot") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const snapshot = await buildPublicSnapshot();
      return json(request, snapshot, {
        status: 200,
        headers: {
          "cache-control": "no-store",
        },
      });
    }

    if (pathname === "/playbook/search-index" || pathname === "/playbook/resource") {
      const response = await handlePlaybookRequest(request, pathname, getRuntimePlaybookStore());
      appendPublicCorsHeaders(response.headers, request, PUBLIC_API_ALLOWED_METHODS);
      return response;
    }

    const { caller, resHeaders, ctx } = await createCallerForRequest(request);
    if (pathname === "/system-share") {
      return await handleSystemShareRequest(request, caller, ctx, resHeaders);
    }
    const clippingMatch = pathname.match(
      /^\/memos\/([^/]+)\/clipping(?:\/(status|reprocess|chat(?:\/events)?))?$/
    );
    if (clippingMatch) {
      const result = await handleClippingRequest(
        request,
        decodeURIComponent(clippingMatch[1]),
        clippingMatch[2] ?? "",
        ctx
      );
      appendPublicCorsHeaders(result.headers, request, PUBLIC_API_ALLOWED_METHODS);
      return result;
    }

    if (pathname === "/auth/me") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const result = await caller.auth.me();
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/auth/logout") {
      if (request.method !== "POST") return methodNotAllowed(request, request.method);
      const result = await caller.auth.logout();
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/posts") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const result = await caller.posts.list({
        page: Number(url.searchParams.get("page") || 1),
        limit: Number(url.searchParams.get("limit") || 10),
        search: url.searchParams.get("search") || undefined,
        category: url.searchParams.get("category") || undefined,
        tag: url.searchParams.get("tag") || undefined,
        published: url.searchParams.get("published") !== "false",
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/memos") {
      if (request.method === "GET") {
        const result = await caller.memos.list({
          cursor: url.searchParams.get("cursor") || undefined,
          direction: url.searchParams.get("direction") === "newer" ? "newer" : "older",
          limit: Number(url.searchParams.get("limit") || 20),
          search: url.searchParams.get("search") || undefined,
          tag: url.searchParams.get("tag") || undefined,
          publicOnly: url.searchParams.get("publicOnly") !== "false",
        });
        return json(request, result, { status: 200 }, resHeaders);
      }

      if (request.method === "POST") {
        const body = ((await parseBody(request)) || {}) as {
          content?: string;
          title?: string;
          isPublic?: boolean;
          tags?: string[];
          attachments?: Array<{ path: string }>;
        };
        const result = await caller.memos.create({
          content: body.content || "",
          title: body.title,
          isPublic: body.isPublic ?? true,
          tags: Array.isArray(body.tags) ? body.tags : [],
          attachments: Array.isArray(body.attachments) ? body.attachments : [],
        });
        return json(request, result, { status: 200 }, resHeaders);
      }

      return methodNotAllowed(request, request.method);
    }

    const memoMatch = pathname.match(/^\/memos\/([^/]+)$/);
    if (memoMatch) {
      const slug = decodeURIComponent(memoMatch[1]);
      if (request.method === "GET") {
        const result = await caller.memos.bySlug({ slug });
        return json(request, result, { status: 200 }, resHeaders);
      }
      if (request.method === "PATCH") {
        const body = ((await parseBody(request)) || {}) as {
          content?: string;
          title?: string;
          isPublic?: boolean;
          tags?: string[];
          attachments?: Array<{ path: string }>;
        };
        const existing = await caller.memos.bySlug({ slug });
        const rawExisting = await db
          .select()
          .from(posts)
          .where(eq(posts.id, existing.id))
          .limit(1)
          .then((rows) => rows[0]);
        if (rawExisting?.type !== "memo") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Memo 不存在" });
        }
        const authoredExisting = await readAuthoredMemo(rawExisting.id).catch(() => ({
          body: rawExisting.body,
          frontmatter: {} as Record<string, unknown>,
        }));
        const result = await caller.memos.update({
          id: existing.id,
          content: typeof body.content === "string" ? body.content : authoredExisting.body.trim(),
          title:
            body.title ??
            (typeof authoredExisting.frontmatter.title === "string"
              ? authoredExisting.frontmatter.title
              : ""),
          isPublic: body.isPublic ?? existing.isPublic,
          tags: Array.isArray(body.tags) ? body.tags : (existing.tags ?? []),
          attachments: Array.isArray(body.attachments)
            ? body.attachments
            : ((existing as { attachments?: Array<{ path: string }> }).attachments ?? []),
        });
        return json(request, result, { status: 200 }, resHeaders);
      }
      if (request.method === "DELETE") {
        const existing = await caller.memos.bySlug({ slug });
        const result = await caller.memos.delete({ id: existing.id });
        return json(request, result, { status: 200 }, resHeaders);
      }
      return methodNotAllowed(request, request.method);
    }

    if (pathname === "/tags/timeline") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const tagPath = url.searchParams.get("tagPath") || "";
      const result = await caller.tags.timeline({
        tagPath,
        cursor: url.searchParams.get("cursor") || undefined,
        limit: Number(url.searchParams.get("limit") || 20),
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/search") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const allowed = new Set([
        "q",
        "mode",
        "topK",
        "source",
        "type",
        "edition",
        "sourceReleaseId",
        "sourceTag",
      ]);
      if ([...url.searchParams.keys()].some((key) => !allowed.has(key)))
        throw new TRPCError({ code: "BAD_REQUEST", message: "unsupported-parameter" });
      const result = await caller.search.content({
        q: (url.searchParams.get("q") || "").trim(),
        mode: (url.searchParams.get("mode") ?? "keyword") as "rag" | "rewrite" | "keyword",
        topK: Number(url.searchParams.get("topK") ?? 20),
        source: (url.searchParams.get("source") ?? "all") as "all" | "blog" | "playbook",
        type: (url.searchParams.get("type") ?? "all") as
          | "all"
          | "post"
          | "memo"
          | "clipping"
          | "topic"
          | "experience"
          | "policy",
        ...(url.searchParams.get("edition")
          ? { edition: url.searchParams.get("edition") ?? undefined }
          : {}),
        ...(url.searchParams.get("sourceReleaseId")
          ? { sourceReleaseId: url.searchParams.get("sourceReleaseId") ?? undefined }
          : {}),
        ...(url.searchParams.get("sourceTag")
          ? { sourceTag: url.searchParams.get("sourceTag") ?? undefined }
          : {}),
      });
      resHeaders.set("Search-Requested-Mode", result.requestedMode);
      resHeaders.set("Search-Effective-Mode", result.effectiveMode);
      if (result.reason) resHeaders.set("Search-Reason", result.reason);
      if (result.playbook) {
        resHeaders.set("Search-Playbook-Edition", result.playbook.edition);
        resHeaders.set("Search-Playbook-Source-Release-Id", result.playbook.sourceReleaseId);
        resHeaders.set("Search-Playbook-Source-Tag", result.playbook.sourceTag);
      }
      if (result.incompleteSources?.length)
        resHeaders.set("Search-Incomplete-Sources", result.incompleteSources.join(","));
      if (result.ragIncompleteSources?.length)
        resHeaders.set("Search-RAG-Incomplete-Sources", result.ragIncompleteSources.join(","));
      resHeaders.set(
        "access-control-expose-headers",
        "Search-Requested-Mode, Search-Effective-Mode, Search-Reason, Search-Playbook-Edition, Search-Playbook-Source-Release-Id, Search-Playbook-Source-Tag, Search-Incomplete-Sources, Search-RAG-Incomplete-Sources"
      );
      resHeaders.set("cache-control", "no-store");
      return json(
        request,
        await normalizePublicSearchTitles(result.results),
        { status: 200 },
        resHeaders
      );
    }

    if (pathname === "/search/suggestions") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const q = (url.searchParams.get("q") || "").trim();
      const reason = normalizeSuggestionReason(url.searchParams.get("reason"));
      const requestedLimit = Number(url.searchParams.get("limit") || 5);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(5, requestedLimit)) : 5;
      if (!q) {
        return json(
          request,
          { suggestions: [], source: "fallback", reason },
          {
            status: 200,
            headers: {
              "cache-control": "no-store",
            },
          },
          resHeaders
        );
      }
      const strategy = url.searchParams.get("strategy") ?? "auto";
      if (strategy !== "auto" && strategy !== "deterministic")
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid suggestion strategy" });
      const result = await suggestPublicSearchTerms({ query: q, reason, limit, strategy });
      return json(
        request,
        result,
        {
          status: 200,
          headers: {
            "cache-control": "no-store",
          },
        },
        resHeaders
      );
    }

    if (pathname === "/comments") {
      if (request.method === "GET") {
        const result = await caller.comments.getComments({
          slug: url.searchParams.get("slug") || "",
          page: Number(url.searchParams.get("page") || 1),
          limit: Number(url.searchParams.get("limit") || 10),
        });
        return json(request, result, { status: 200 }, resHeaders);
      }
      if (request.method === "POST") {
        const body = (await parseBody(request)) || {};
        const result = await caller.comments.createComment(body as never);
        return json(request, result, { status: 200 }, resHeaders);
      }
      return methodNotAllowed(request, request.method);
    }

    const commentMatch = pathname.match(/^\/comments\/([^/]+)$/);
    if (commentMatch) {
      const commentId = decodeURIComponent(commentMatch[1]);
      if (request.method === "PATCH") {
        const body = ((await parseBody(request)) || {}) as { content?: string };
        const result = await caller.comments.editComment({
          commentId,
          content: body.content || "",
        });
        return json(request, result, { status: 200 }, resHeaders);
      }
      if (request.method === "DELETE") {
        const result = await caller.comments.deleteComment({ commentId });
        return json(request, result, { status: 200 }, resHeaders);
      }
      return methodNotAllowed(request, request.method);
    }

    const moderateMatch = pathname.match(/^\/comments\/([^/]+)\/moderate$/);
    if (moderateMatch) {
      if (request.method !== "POST") return methodNotAllowed(request, request.method);
      const commentId = decodeURIComponent(moderateMatch[1]);
      const body = ((await parseBody(request)) || {}) as { status?: "approved" | "rejected" };
      const result = await caller.comments.moderateComment({
        commentId,
        status: body.status || "approved",
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/reactions") {
      if (request.method !== "GET") return methodNotAllowed(request, request.method);
      const targetType = url.searchParams.get("targetType") as "post" | "comment" | null;
      const targetId = url.searchParams.get("targetId") || "";
      const result = await caller.reactions.getReactions({
        targetType: targetType || "post",
        targetId,
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    if (pathname === "/reactions/toggle") {
      if (request.method !== "POST") return methodNotAllowed(request, request.method);
      const body = ((await parseBody(request)) || {}) as {
        targetType?: "post" | "comment";
        targetId?: string;
        emoji?: string;
      };
      const result = await caller.reactions.toggle({
        targetType: body.targetType || "post",
        targetId: body.targetId || "",
        emoji: body.emoji || "👍",
      });
      return json(request, result, { status: 200 }, resHeaders);
    }

    return json(request, { error: "Not found" }, { status: 404 }, resHeaders);
  } catch (error) {
    if (error instanceof TRPCError) {
      return json(
        request,
        { error: error.message, code: error.code },
        { status: statusFromTrpcError(error) }
      );
    }

    console.error("[public-api] unexpected error", error);
    return json(request, { error: "Internal server error" }, { status: 500 });
  }
}
