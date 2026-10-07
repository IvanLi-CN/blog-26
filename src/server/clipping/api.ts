import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import { db } from "@/lib/db";
import { posts } from "@/lib/schema";
import type { TRPCContext } from "@/server/context";
import { getClippingRuntime } from "./runtime";
import { ClippingStore, clippingIdForMemo, projectClippingMemo, readAuthoredMemo } from "./store";

const turnSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
});

function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store", vary: "Cookie, Authorization" },
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

export function canDiscussClipping(
  ctx: Pick<TRPCContext, "isAdmin" | "user">,
  creatorId: string | null
) {
  return ctx.isAdmin || Boolean(creatorId && ctx.user?.id === creatorId);
}

async function access(slug: string, ctx: TRPCContext, discussion = false) {
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
  const id = clippingIdForMemo(row.id, authored.frontmatter);
  const manifest = await store.manifest(id);
  if (manifest && (manifest.memoId !== row.id || manifest.deleted))
    throw new TRPCError({ code: "NOT_FOUND", message: "剪藏不存在" });
  const participant = canDiscussClipping(ctx, manifest?.creatorId ?? null);
  if (discussion) {
    if (!participant)
      throw new TRPCError({
        code: ctx.user ? "FORBIDDEN" : "UNAUTHORIZED",
        message: "对话及管理操作仅限创建者和管理员",
      });
  } else if (
    !ctx.isAdmin &&
    (!row.public ||
      row.draft ||
      authored.frontmatter.public === false ||
      authored.frontmatter.draft === true)
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: "无权阅读此闪念" });
  }
  return { row, authored, manifest, participant };
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

async function routeClippingRequest(
  request: Request,
  slug: string,
  operation: string,
  ctx: TRPCContext
) {
  if (!["", "status", "reprocess", "chat", "chat/events"].includes(operation))
    return response({ error: "Not found" }, 404);
  const store = new ClippingStore();
  const privateOperation = ["reprocess", "chat", "chat/events"].includes(operation);
  const authorized = await access(slug, ctx, privateOperation);
  const { row, manifest, participant } = authorized;
  if (operation === "" || operation === "status") {
    if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
    const projection = await projectClippingMemo(row.id, store, operation === "");
    if (!projection) throw new TRPCError({ code: "NOT_FOUND", message: "此闪念没有启用剪藏" });
    return response({
      reading: projection.reading,
      ...(operation === ""
        ? {
            source: projection.source,
            translation: projection.translation,
            content: projection.content,
            title: projection.title,
          }
        : {}),
      canDiscuss: participant,
      processorEnabled: Boolean(getClippingRuntime()),
    });
  }
  if (!manifest) throw new TRPCError({ code: "NOT_FOUND", message: "剪藏尚未建立，请稍后重试" });
  if (operation === "reprocess") {
    if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
    await runtime().reconcile(row.id, true);
    return response({ accepted: true }, 202);
  }
  if (operation === "chat") {
    if (request.method === "GET") {
      const requested = new URL(request.url).searchParams.get("conversationId");
      const conversationId = manifest.conversationId;
      if (requested && requested !== conversationId)
        throw new TRPCError({ code: "FORBIDDEN", message: "仅能访问当前文章对话" });
      if (!conversationId)
        return response({ messages: [], generating: false, partial: "", conversationId: null });
      return response({
        ...(await runtime().chatSnapshot(conversationId)),
        conversationId,
      });
    }
    if (request.method === "POST") {
      const parsed = turnSchema.safeParse(await input(request));
      if (!parsed.success)
        throw new TRPCError({ code: "BAD_REQUEST", message: "消息为空、过长或缺少幂等标识" });
      return response(await runtime().chat(row.id, parsed.data.text, parsed.data.requestId), 202);
    }
    return response({ error: "Method not allowed" }, 405);
  }
  if (operation === "chat/events") {
    if (request.method !== "GET") return response({ error: "Method not allowed" }, 405);
    const service = runtime();
    const encoder = new TextEncoder();
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let previous = "";
        let sequence = 0;
        const deadline = Date.now() + 60_000;
        while (!cancelled && !request.signal.aborted && Date.now() < deadline) {
          try {
            // Resolve live identity and permissions for every private event, including revocation.
            const identity = await extractAuthFromRequest(request);
            const currentContext: TRPCContext = {
              ...ctx,
              user: identity.user,
              isAdmin: identity.isAdmin,
            };
            const current = await access(slug, currentContext, true);
            if (!current.manifest?.enabled || !current.manifest.conversationId) break;
            const snapshot = await service.chatSnapshot(current.manifest.conversationId);
            const data = JSON.stringify({
              ...snapshot,
              conversationId: current.manifest.conversationId,
            });
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
        if (!cancelled) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
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
    if (error instanceof Error && /^[\u3400-\u9fff]/u.test(error.message))
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    throw error;
  }
}
