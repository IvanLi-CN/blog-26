import { TRPCError } from "@trpc/server";
import { appendPublicCorsHeaders, createPublicCorsPreflightResponse } from "@/lib/public-cors";
import { createContext } from "@/server/context";
import { appRouter } from "@/server/router";

const PUBLIC_API_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"] as const;

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

export async function handlePublicApiRequest(request: Request, subPath: string) {
  try {
    if (request.method === "OPTIONS") {
      return createPublicCorsPreflightResponse(request, PUBLIC_API_ALLOWED_METHODS);
    }

    const url = new URL(request.url);
    const pathname = subPath.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
    const { caller, resHeaders } = await createCallerForRequest(request);

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
        const result = await caller.memos.update({
          id: existing.id,
          content: typeof body.content === "string" ? body.content : existing.content,
          title: body.title ?? existing.title,
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
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) {
        return json(request, [], { status: 200 }, resHeaders);
      }
      const result = await caller.search.ai.enhanced({
        q,
        topK: Number(url.searchParams.get("topK") || 20),
      });
      return json(request, result, { status: 200 }, resHeaders);
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
