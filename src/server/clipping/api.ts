import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { FrontendPrincipal } from "@/lib/assistant-contracts";
import {
  buildClippingResourceBaseUrl,
  clippingResourceFilename,
  isSafeClippingResourceMimeType,
} from "@/lib/clipping-resources";
import { db } from "@/lib/db";
import { getFrontendPrincipalFromRequest } from "@/lib/frontend-auth";
import { recognizeMemoClipping } from "@/lib/memo-clipping";
import { resolveRequestOrigin } from "@/lib/public-cors";
import { posts } from "@/lib/schema";
import { AssistantServiceError, type AssistantSnapshot } from "@/server/assistant/service";
import type { TRPCContext } from "@/server/context";
import { getClippingRuntime } from "./runtime";
import { ClippingAssistantUnavailableError, ClippingTargetChangedError } from "./service";
import { ClippingStore, clippingIdForMemo, projectClippingMemo, readAuthoredMemo } from "./store";

const turnSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
});

const MAX_ACTIVE_CLIPPING_EVENT_STREAMS = 4;
const activeClippingEventStreams = new Map<string, number>();

function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", vary: "Cookie, Authorization" },
  });
}

function resourceMimeType(resource: { mimeType: string | null; path: string | null }) {
  if (resource.mimeType && resource.mimeType !== "application/octet-stream")
    return resource.mimeType;
  const extension = resource.path?.split(".").at(-1)?.toLowerCase();
  return (
    (
      {
        avif: "image/avif",
        apng: "image/apng",
        gif: "image/gif",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        svg: "image/svg+xml",
        webp: "image/webp",
        mp3: "audio/mpeg",
        ogg: "audio/ogg",
        wav: "audio/wav",
        mp4: "video/mp4",
        ogv: "video/ogg",
        mov: "video/quicktime",
        mpeg: "video/mpeg",
        webm: "video/webm",
      } as Record<string, string>
    )[extension ?? ""] ?? "application/octet-stream"
  );
}

export async function handleClippingResourceRequest(
  request: Request,
  slug: string,
  versionId: string,
  filename: string,
  ctx: TRPCContext
) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Not Found", { status: 404 });
  const safeFilename = clippingResourceFilename(filename);
  if (!safeFilename) return new Response("Not Found", { status: 404 });
  const store = new ClippingStore();
  const authorized = await access(slug, ctx);
  if (!authorized.manifest) return new Response("Not Found", { status: 404 });
  const projection = await projectClippingMemo(authorized.row.id, store);
  if (!projection || projection.reading.versionId !== versionId)
    return new Response("Not Found", { status: 404 });
  const version = authorized.manifest.versions.find((candidate) => candidate.id === versionId);
  if (!version?.resourcesCaptured) return new Response("Not Found", { status: 404 });
  const resource = version.resources.find(
    (candidate) => candidate.status === "captured" && candidate.path === `assets/${safeFilename}`
  );
  if (!resource) return new Response("Not Found", { status: 404 });
  const contentType = resourceMimeType(resource);
  if (!isSafeClippingResourceMimeType(contentType))
    return new Response("Not Found", { status: 404 });
  const body = await store.readResource(authorized.manifest.id, versionId, resource);
  if (!body) return new Response("Not Found", { status: 404 });
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-length": String(body.byteLength),
      "content-type": contentType,
      "x-content-type-options": "nosniff",
      vary: "Cookie, Authorization",
    },
  });
}
async function input(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new TRPCError({ code: "BAD_REQUEST", message: "Expected JSON input" });
  const reader = request.body?.getReader();
  if (!reader) throw new TRPCError({ code: "BAD_REQUEST", message: "Missing JSON input" });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 64 * 1024) {
        await reader.cancel();
        throw new TRPCError({ code: "BAD_REQUEST", message: "Input is too large" });
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid JSON input" });
  } finally {
    reader.releaseLock();
  }
}

function canManageClipping(ctx: Pick<TRPCContext, "isAdmin" | "user">, creatorId: string | null) {
  return ctx.isAdmin || Boolean(creatorId && ctx.user?.id === creatorId);
}

async function access(
  slug: string,
  ctx: TRPCContext,
  discussion = false,
  discussionPrincipal: FrontendPrincipal | null = null
) {
  const store = new ClippingStore();
  const row = (
    await db
      .select()
      .from(posts)
      .where(and(eq(posts.slug, slug), eq(posts.type, "memo")))
      .limit(1)
  )[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "闪念不存在" });
  const authored = await readAuthoredMemo(row.id);
  const recognition = recognizeMemoClipping(authored.body, authored.frontmatter);
  if (discussion && !recognition.enabled)
    throw new TRPCError({ code: "NOT_FOUND", message: "此闪念没有启用剪藏" });
  const id = clippingIdForMemo(row.id, authored.frontmatter);
  const manifest = await store.manifest(id);
  if (manifest && (manifest.memoId !== row.id || manifest.deleted))
    throw new TRPCError({ code: "NOT_FOUND", message: "剪藏不存在" });
  if (discussion) {
    if (!canManageClipping(ctx, manifest?.creatorId ?? null))
      throw new TRPCError({
        code: ctx.user ? "FORBIDDEN" : "UNAUTHORIZED",
        message: "管理操作仅限创建者和管理员",
      });
  } else if (
    !ctx.isAdmin &&
    !discussionPrincipal?.isAdmin &&
    (!row.public ||
      row.draft ||
      authored.frontmatter.public === false ||
      authored.frontmatter.draft === true)
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: "闪念不存在" });
  }
  return { row, authored, manifest, recognition };
}

async function frontendPrincipal(request: Request) {
  const principal = await getFrontendPrincipalFromRequest(request);
  if (!principal)
    throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录前台账号后再讨论剪藏" });
  return principal;
}

function mapAssistantSnapshot(snapshot: AssistantSnapshot | null) {
  if (!snapshot)
    return { messages: [], generating: false, partial: "", conversationId: null, error: null };
  const active = snapshot.activeGenerationJob;
  const partial = active?.assistantMessageId
    ? (snapshot.messages.find((message) => message.id === active.assistantMessageId)?.content ?? "")
    : "";
  return {
    messages: snapshot.messages
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          message.status !== "pending" &&
          message.status !== "streaming" &&
          (message.role === "user" || Boolean(message.content.trim()))
      )
      .map((message) => ({
        id: message.id,
        role: message.role,
        text: message.content,
        timestamp: message.createdAt,
      })),
    generating: Boolean(active),
    partial,
    conversationId: snapshot.conversation.id,
    error:
      active?.status === "failed"
        ? active.errorCode
        : (snapshot.generationJobs.findLast((job) => job.status === "failed")?.errorCode ?? null),
  };
}

type CurrentDiscussionManifest = NonNullable<Awaited<ReturnType<typeof access>>["manifest"]> & {
  targetUrl: string;
};

function currentDiscussion(current: Awaited<ReturnType<typeof access>>): CurrentDiscussionManifest {
  const { manifest, recognition } = current;
  if (!manifest?.enabled || !recognition.targetUrl || recognition.targetUrl !== manifest.targetUrl)
    throw new TRPCError({ code: "CONFLICT", message: "剪藏目标已变化，请重新打开对话。" });
  return manifest as CurrentDiscussionManifest;
}

async function revalidateDiscussion(
  slug: string,
  ctx: TRPCContext,
  expected: NonNullable<Awaited<ReturnType<typeof access>>["manifest"]>,
  discussionPrincipal: FrontendPrincipal | null = null
) {
  const current = currentDiscussion(await access(slug, ctx, false, discussionPrincipal));
  if (current.id !== expected.id || current.revision !== expected.revision)
    throw new TRPCError({ code: "CONFLICT", message: "剪藏目标已变化，请重新打开对话。" });
}

function runtime() {
  const service = getClippingRuntime();
  if (!service)
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "剪藏处理器已停用；已保存的阅读材料仍可使用。",
    });
  return service;
}

function requireSameOriginMutation(request: Request) {
  const rawOrigin = request.headers.get("origin");
  const requestOrigin = resolveRequestOrigin(request);
  let origin: string | null = null;
  try {
    origin = rawOrigin ? new URL(rawOrigin).origin : null;
  } catch {
    origin = null;
  }
  if (!origin || !requestOrigin || origin !== requestOrigin)
    throw new TRPCError({ code: "FORBIDDEN", message: "拒绝跨来源剪藏操作" });
}

async function routeClippingRequest(
  request: Request,
  slug: string,
  operation: string,
  ctx: TRPCContext
) {
  if (!["", "status", "reprocess", "chat", "chat/events"].includes(operation))
    return response({ error: "Not found" }, 404);
  const store = new ClippingStore();
  const privateOperation = operation === "reprocess";
  const discussionPrincipal =
    operation === "chat" || operation === "chat/events" ? await frontendPrincipal(request) : null;
  const authorized = await access(slug, ctx, privateOperation, discussionPrincipal);
  const { row, manifest } = authorized;
  if (operation === "" || operation === "status") {
    if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
    const projection = await projectClippingMemo(row.id, store, operation === "", operation === "");
    if (!projection) throw new TRPCError({ code: "NOT_FOUND", message: "此闪念没有启用剪藏" });
    return response({
      reading: projection.reading,
      ...(operation === ""
        ? {
            source: projection.source,
            translation: projection.translation,
            content: projection.content,
            title: projection.title,
            resourceBaseUrl:
              projection.resourcesCaptured && projection.reading.versionId
                ? buildClippingResourceBaseUrl(slug, projection.reading.versionId)
                : null,
          }
        : {}),
      canDiscuss:
        Boolean(await getFrontendPrincipalFromRequest(request)) &&
        Boolean(getClippingRuntime()?.assistantChatEnabled()),
      processorEnabled: Boolean(getClippingRuntime()),
    });
  }
  if (!manifest) throw new TRPCError({ code: "NOT_FOUND", message: "剪藏尚未建立，请稍后重试" });
  if (operation === "reprocess") {
    if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
    requireSameOriginMutation(request);
    await runtime().reconcile(row.id, true);
    return response({ accepted: true }, 202);
  }
  if (operation === "chat") {
    if (!authorized.recognition.enabled)
      throw new TRPCError({ code: "NOT_FOUND", message: "此闪念没有启用剪藏" });
    const currentManifest = currentDiscussion(authorized);
    const principal = discussionPrincipal;
    if (!principal) throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录前台账号" });
    if (request.method === "GET") {
      const requested = new URL(request.url).searchParams.get("conversationId");
      const snapshot = await runtime().assistantSnapshot(row.id, principal);
      if (requested && requested !== snapshot?.conversation.id)
        throw new TRPCError({ code: "FORBIDDEN", message: "仅能访问当前文章对话" });
      await revalidateDiscussion(slug, ctx, currentManifest, principal);
      return response(mapAssistantSnapshot(snapshot));
    }
    if (request.method === "POST") {
      requireSameOriginMutation(request);
      const parsed = turnSchema.safeParse(await input(request));
      if (!parsed.success)
        throw new TRPCError({ code: "BAD_REQUEST", message: "消息为空、过长或缺少幂等标识" });
      const submission = await runtime().assistantChat(
        row.id,
        principal,
        parsed.data.text,
        parsed.data.requestId,
        { revision: currentManifest.revision, targetUrl: currentManifest.targetUrl }
      );
      try {
        await revalidateDiscussion(slug, ctx, currentManifest, principal);
      } catch (error) {
        await runtime()
          .assistantStop(principal, submission.turnId)
          .catch(() => undefined);
        throw error;
      }
      return response(submission, 202);
    }
    return response({ error: "Method not allowed" }, 405);
  }
  if (operation === "chat/events") {
    if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
    if (!authorized.recognition.enabled)
      throw new TRPCError({ code: "NOT_FOUND", message: "此闪念没有启用剪藏" });
    const principal = discussionPrincipal;
    if (!principal) throw new TRPCError({ code: "UNAUTHORIZED", message: "请先登录前台账号" });
    const service = runtime();
    if (!service.assistantChatEnabled())
      throw new ClippingAssistantUnavailableError("assistant-discussion-migration-required");
    const active = activeClippingEventStreams.get(principal.id) ?? 0;
    if (active >= MAX_ACTIVE_CLIPPING_EVENT_STREAMS)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "剪藏讨论连接数已达上限，请关闭重复页面后重试。",
      });
    activeClippingEventStreams.set(principal.id, active + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const current = activeClippingEventStreams.get(principal.id) ?? 0;
      if (current <= 1) activeClippingEventStreams.delete(principal.id);
      else activeClippingEventStreams.set(principal.id, current - 1);
    };
    const encoder = new TextEncoder();
    let cancelled = false;
    let stream: ReadableStream<Uint8Array>;
    try {
      stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            let previous = "";
            let sequence = 0;
            const deadline = Date.now() + 60_000;
            while (!cancelled && !request.signal.aborted && Date.now() < deadline) {
              try {
                const current = await access(slug, ctx, false, principal);
                const before = currentDiscussion(current);
                await frontendPrincipal(request);
                const snapshot = await service.assistantSnapshot(current.row.id, principal);
                if (!snapshot) break;
                const after = currentDiscussion(await access(slug, ctx, false, principal));
                if (
                  after.id !== before.id ||
                  after.revision !== before.revision ||
                  after.targetUrl !== before.targetUrl
                )
                  break;
                await frontendPrincipal(request);
                if (cancelled || request.signal.aborted) break;
                const data = JSON.stringify(mapAssistantSnapshot(snapshot));
                if (data !== previous) {
                  controller.enqueue(
                    encoder.encode(`id: ${++sequence}\nevent: snapshot\ndata: ${data}\n\n`)
                  );
                  previous = data;
                } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
              } catch {
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 700));
            }
            if (!cancelled && !request.signal.aborted) controller.close();
          } finally {
            release();
          }
        },
        cancel() {
          cancelled = true;
          release();
        },
      });
    } catch (error) {
      release();
      throw error;
    }
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        "x-accel-buffering": "no",
        vary: "Cookie, Authorization",
      },
    });
  }
  return response({ error: "Not found" }, 404);
}

export async function handleClippingRequest(
  request: Request,
  slug: string,
  operation: string,
  ctx: TRPCContext
) {
  try {
    return await routeClippingRequest(request, slug, operation, ctx);
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (error instanceof ClippingAssistantUnavailableError)
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "剪藏讨论尚未启用；请先完成旧讨论迁移校验。",
      });
    if (error instanceof ClippingTargetChangedError)
      throw new TRPCError({ code: "CONFLICT", message: error.message });
    if (error instanceof AssistantServiceError) {
      const code =
        error.code === "quota"
          ? "TOO_MANY_REQUESTS"
          : error.code === "conflict"
            ? "CONFLICT"
            : error.code === "not-found" || error.code === "gone"
              ? "NOT_FOUND"
              : "INTERNAL_SERVER_ERROR";
      throw new TRPCError({ code, message: error.message });
    }
    if (error instanceof Error && /^[\u3400-\u9fff]/u.test(error.message))
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw error;
  }
}
