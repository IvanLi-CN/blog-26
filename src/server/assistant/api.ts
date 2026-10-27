import { z } from "zod";
import type { AssistantGenerationJob, FrontendPrincipal } from "@/lib/assistant-contracts";
import { initializeDB } from "@/lib/db";
import { getFrontendPrincipalFromRequest } from "@/lib/frontend-auth";
import { appendPublicCorsHeaders, hasTrustedPublicOrigin } from "@/lib/public-cors";
import { type AssistantService, AssistantServiceError, getAssistantService } from "./service";

const PUBLIC_API_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"] as const;
const MAX_ASSISTANT_BODY_BYTES = 64 * 1024;
const MAX_ASSISTANT_QUERY_CHARS = 8_192;
const MAX_ACTIVE_EVENT_STREAMS_PER_USER = 4;
const activeEventStreams = new Map<string, number>();
const submitSchema = z
  .object({
    conversationId: z.string().trim().min(1).max(200).nullable().optional(),
    requestId: z.string().trim().min(1).max(200).optional(),
    clientRequestId: z.string().trim().min(1).max(200).nullable().optional(),
    content: z.string().trim().min(1).max(MAX_ASSISTANT_QUERY_CHARS).optional(),
    text: z.string().trim().min(1).max(MAX_ASSISTANT_QUERY_CHARS).optional(),
    message: z.string().trim().min(1).max(MAX_ASSISTANT_QUERY_CHARS).optional(),
    kind: z.enum(["general", "clipping"]).optional(),
    title: z.string().trim().max(300).nullable().optional(),
    clippingMemoId: z.string().trim().max(200).nullable().optional(),
    clippingVersionId: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

class AssistantApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AssistantApiError";
  }
}

function response(
  request: Request,
  data: unknown,
  status: number,
  extraHeaders?: Headers,
  resHeaders?: Headers
) {
  const headers = new Headers(extraHeaders);
  if (resHeaders) {
    for (const [key, value] of resHeaders.entries()) {
      if (key.toLowerCase() === "set-cookie") headers.append(key, value);
      else headers.set(key, value);
    }
  }
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  appendPublicCorsHeaders(headers, request, PUBLIC_API_ALLOWED_METHODS);
  return new Response(JSON.stringify(data), { status, headers });
}

function methodNotAllowed(request: Request) {
  return response(request, { error: "Method not allowed", code: "METHOD_NOT_SUPPORTED" }, 405);
}

function routeError(error: unknown): AssistantApiError {
  if (error instanceof AssistantApiError) return error;
  if (error instanceof AssistantServiceError) {
    const status =
      error.code === "not-found"
        ? 404
        : error.code === "gone"
          ? 410
          : error.code === "conflict"
            ? 409
            : 429;
    return new AssistantApiError(
      status,
      error.code.toUpperCase().replace(/-/gu, "_"),
      error.message
    );
  }
  return new AssistantApiError(500, "INTERNAL_SERVER_ERROR", "Internal server error");
}

async function body(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_ASSISTANT_BODY_BYTES)
    throw new AssistantApiError(413, "PAYLOAD_TOO_LARGE", "Assistant request body is too large");
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("empty request body");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_ASSISTANT_BODY_BYTES) {
          await reader.cancel();
          throw new AssistantApiError(
            413,
            "PAYLOAD_TOO_LARGE",
            "Assistant request body is too large"
          );
        }
        chunks.push(chunk.value);
      }
    } finally {
      reader.releaseLock();
    }
    const total = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      total.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(total));
  } catch (error) {
    if (error instanceof AssistantApiError) throw error;
    throw new AssistantApiError(400, "BAD_REQUEST", "Invalid JSON body");
  }
}

function idFromPath(pathname: string, suffix: string) {
  const match = pathname.match(new RegExp(`^/chat/conversations/([^/]+)${suffix}$`, "u"));
  return match ? decodeURIComponent(match[1]) : null;
}

function conversationIdFromUrl(url: URL) {
  return url.searchParams.get("conversationId") || url.searchParams.get("conversation") || "";
}

function streamResponse(
  request: Request,
  conversationId: string,
  service: ReturnType<typeof getAssistantService>,
  principal: NonNullable<Awaited<ReturnType<typeof getFrontendPrincipalFromRequest>>>
) {
  const active = activeEventStreams.get(principal.id) ?? 0;
  if (active >= MAX_ACTIVE_EVENT_STREAMS_PER_USER)
    throw new AssistantApiError(429, "TOO_MANY_STREAMS", "Too many assistant event streams");
  activeEventStreams.set(principal.id, active + 1);
  const encoder = new TextEncoder();
  let closed = false;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const remaining = (activeEventStreams.get(principal.id) ?? 1) - 1;
    if (remaining > 0) activeEventStreams.set(principal.id, remaining);
    else activeEventStreams.delete(principal.id);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        release();
        controller.close();
      };
      request.signal.addEventListener("abort", close, { once: true });
      const run = async () => {
        let previous = "";
        let sentTerminal = false;
        const deadline = Date.now() + 60_000;
        try {
          while (!closed && Date.now() < deadline) {
            const currentPrincipal = await getFrontendPrincipalFromRequest(request);
            if (!currentPrincipal || currentPrincipal.id !== principal.id) break;
            try {
              const snapshot = await service.snapshot(principal, conversationId);
              if (closed) break;
              const serialized = JSON.stringify(snapshot);
              if (!closed && serialized !== previous) {
                previous = serialized;
                controller.enqueue(
                  encoder.encode(
                    `id: ${snapshot.eventSequence}\nevent: snapshot\ndata: ${serialized}\n\n`
                  )
                );
              }
              if (!snapshot.activeGenerationJob && previous && sentTerminal) break;
              if (!snapshot.activeGenerationJob) sentTerminal = true;
            } catch (error) {
              const mapped = routeError(error);
              if (mapped.status === 410 || mapped.status === 404) {
                controller.enqueue(
                  encoder.encode(
                    `event: error\ndata: ${JSON.stringify({ code: mapped.code, error: mapped.message })}\n\n`
                  )
                );
              }
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        } finally {
          request.signal.removeEventListener("abort", close);
          close();
        }
      };
      void run();
    },
    cancel() {
      closed = true;
      release();
    },
  });
  const headers = new Headers({
    "cache-control": "no-cache, no-store",
    connection: "keep-alive",
    "content-type": "text/event-stream; charset=utf-8",
    "x-accel-buffering": "no",
  });
  appendPublicCorsHeaders(headers, request, PUBLIC_API_ALLOWED_METHODS);
  return new Response(stream, { status: 200, headers });
}

function normalizeGenerationJob(job: AssistantGenerationJob | null) {
  return job
    ? {
        id: job.id,
        status: job.status,
        attempt: job.attempt,
        cancelRequested: job.cancelRequested,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        errorCode: job.errorCode,
      }
    : null;
}

async function submitAssistantRequest(
  request: Request,
  principal: FrontendPrincipal,
  service: ReturnType<typeof getAssistantService>,
  resHeaders: Headers
) {
  const parsed = submitSchema.safeParse(await body(request));
  if (!parsed.success) throw new AssistantApiError(400, "BAD_REQUEST", "Invalid assistant request");
  const input = parsed.data;
  const content = input.content ?? input.text ?? input.message;
  if (!content) throw new AssistantApiError(400, "BAD_REQUEST", "Message content is required");
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
  const requestId = input.requestId ?? idempotencyKey ?? input.clientRequestId ?? null;
  if (!requestId) throw new AssistantApiError(400, "BAD_REQUEST", "requestId is required");
  if (input.kind === "clipping" || input.clippingMemoId || input.clippingVersionId)
    throw new AssistantApiError(
      404,
      "NOT_FOUND",
      "Clipping discussions must use the clipping route"
    );
  if (input.conversationId) await requireConversation(service, principal, input.conversationId);
  const clientRequestId = input.clientRequestId ?? input.requestId ?? idempotencyKey;
  const result = await service.submit(principal, {
    conversationId: input.conversationId ?? null,
    requestId,
    clientRequestId,
    content,
    kind: input.kind,
    title: input.title,
    clippingMemoId: input.clippingMemoId,
    clippingVersionId: input.clippingVersionId,
  });
  return response(request, result, 202, undefined, resHeaders);
}

async function requireConversation(
  service: ReturnType<typeof getAssistantService>,
  principal: FrontendPrincipal,
  conversationId: string
) {
  const conversation = await service.storage.getConversation(conversationId, principal.id);
  if (!conversation)
    throw new AssistantApiError(404, "NOT_FOUND", "Assistant conversation not found");
  return conversation;
}

async function requireGeneralTurn(
  service: ReturnType<typeof getAssistantService>,
  principal: FrontendPrincipal,
  turnId: string
) {
  const job = await service.storage.getGenerationJob(turnId, principal.id);
  if (!job) throw new AssistantApiError(404, "NOT_FOUND", "Assistant turn not found");
  await requireConversation(service, principal, job.conversationId);
  return job;
}

export async function handleAssistantRequest(
  request: Request,
  pathname: string,
  resHeaders = new Headers(),
  serviceOverride?: AssistantService
) {
  try {
    await initializeDB();
    const principal = await getFrontendPrincipalFromRequest(request);
    if (!principal) throw new AssistantApiError(401, "UNAUTHORIZED", "Authentication is required");
    if (request.method !== "GET" && request.method !== "HEAD" && !hasTrustedPublicOrigin(request))
      throw new AssistantApiError(403, "FORBIDDEN", "Request origin is not trusted");
    const service = serviceOverride ?? getAssistantService();
    await service.runtime.start();
    const url = new URL(request.url);

    if (pathname === "/chat" || pathname === "/chat/conversations") {
      if (request.method === "GET") {
        if (conversationIdFromUrl(url)) {
          const conversationId = conversationIdFromUrl(url);
          await requireConversation(service, principal, conversationId);
          const snapshot = await service.snapshot(principal, conversationId);
          return response(request, snapshot, 200, undefined, resHeaders);
        }
        return response(request, await service.list(principal), 200, undefined, resHeaders);
      }
      if (request.method !== "POST") return methodNotAllowed(request);
      return await submitAssistantRequest(request, principal, service, resHeaders);
    }

    if (pathname === "/chat/quota") {
      if (request.method !== "GET") return methodNotAllowed(request);
      return response(request, await service.quota(principal), 200, undefined, resHeaders);
    }

    if (pathname === "/chat/snapshot") {
      if (request.method !== "GET") return methodNotAllowed(request);
      const conversationId = conversationIdFromUrl(url);
      if (!conversationId)
        throw new AssistantApiError(400, "BAD_REQUEST", "conversationId is required");
      await requireConversation(service, principal, conversationId);
      return response(
        request,
        await service.snapshot(principal, conversationId),
        200,
        undefined,
        resHeaders
      );
    }

    if (pathname === "/chat/events") {
      if (request.method !== "GET") return methodNotAllowed(request);
      const conversationId = conversationIdFromUrl(url);
      if (!conversationId)
        throw new AssistantApiError(400, "BAD_REQUEST", "conversationId is required");
      await requireConversation(service, principal, conversationId);
      await service.snapshot(principal, conversationId);
      return streamResponse(request, conversationId, service, principal);
    }

    if (pathname === "/chat/messages") {
      if (request.method === "POST")
        return await submitAssistantRequest(request, principal, service, resHeaders);
      if (request.method !== "GET") return methodNotAllowed(request);
      const conversationId = conversationIdFromUrl(url);
      if (!conversationId)
        throw new AssistantApiError(400, "BAD_REQUEST", "conversationId is required");
      await requireConversation(service, principal, conversationId);
      return response(
        request,
        await service.messages(principal, conversationId),
        200,
        undefined,
        resHeaders
      );
    }

    if (pathname === "/chat/stop") {
      if (request.method !== "POST") return methodNotAllowed(request);
      const parsed = z
        .object({
          conversationId: z.string().optional(),
          turnId: z.string().optional(),
          generationJobId: z.string().optional(),
        })
        .strict()
        .safeParse(await body(request));
      if (!parsed.success) throw new AssistantApiError(400, "BAD_REQUEST", "Invalid stop request");
      if (parsed.data.conversationId && (parsed.data.turnId || parsed.data.generationJobId)) {
        const job = await requireGeneralTurn(
          service,
          principal,
          parsed.data.turnId ?? parsed.data.generationJobId ?? ""
        );
        if (job.conversationId !== parsed.data.conversationId)
          throw new AssistantApiError(
            409,
            "CONFLICT",
            "conversationId does not match the assistant turn"
          );
      } else if (parsed.data.conversationId) {
        await requireConversation(service, principal, parsed.data.conversationId);
      } else if (parsed.data.turnId || parsed.data.generationJobId)
        await requireGeneralTurn(
          service,
          principal,
          parsed.data.turnId ?? parsed.data.generationJobId ?? ""
        );
      const result = await service.stop(principal, {
        conversationId: parsed.data.conversationId,
        turnId: parsed.data.turnId ?? parsed.data.generationJobId,
      });
      return response(
        request,
        { ...result, generationJob: normalizeGenerationJob(result.generationJob) },
        200,
        undefined,
        resHeaders
      );
    }

    const eventConversationId = idFromPath(pathname, "/events");
    if (eventConversationId) {
      if (request.method !== "GET") return methodNotAllowed(request);
      await requireConversation(service, principal, eventConversationId);
      await service.snapshot(principal, eventConversationId);
      return streamResponse(request, eventConversationId, service, principal);
    }

    const messageConversationId = idFromPath(pathname, "/messages");
    if (messageConversationId) {
      if (request.method !== "GET") return methodNotAllowed(request);
      await requireConversation(service, principal, messageConversationId);
      return response(
        request,
        await service.messages(principal, messageConversationId),
        200,
        undefined,
        resHeaders
      );
    }

    const stopConversationId = idFromPath(pathname, "/stop");
    if (stopConversationId) {
      if (request.method !== "POST") return methodNotAllowed(request);
      await requireConversation(service, principal, stopConversationId);
      const result = await service.stop(principal, { conversationId: stopConversationId });
      return response(
        request,
        { ...result, generationJob: normalizeGenerationJob(result.generationJob) },
        200,
        undefined,
        resHeaders
      );
    }

    const turnStopMatch = pathname.match(/^\/chat\/turns\/([^/]+)\/stop$/u);
    if (turnStopMatch) {
      if (request.method !== "POST") return methodNotAllowed(request);
      await requireGeneralTurn(service, principal, decodeURIComponent(turnStopMatch[1]));
      const result = await service.stop(principal, {
        turnId: decodeURIComponent(turnStopMatch[1]),
      });
      return response(
        request,
        { ...result, generationJob: normalizeGenerationJob(result.generationJob) },
        200,
        undefined,
        resHeaders
      );
    }

    const conversationId = idFromPath(pathname, "");
    if (conversationId) {
      await requireConversation(service, principal, conversationId);
      if (request.method === "GET")
        return response(
          request,
          await service.snapshot(principal, conversationId),
          200,
          undefined,
          resHeaders
        );
      if (request.method === "DELETE")
        return response(
          request,
          await service.delete(principal, conversationId),
          200,
          undefined,
          resHeaders
        );
      return methodNotAllowed(request);
    }

    throw new AssistantApiError(404, "NOT_FOUND", "Assistant route not found");
  } catch (error) {
    const mapped = routeError(error);
    if (mapped.status === 500) console.error("[assistant-api] unexpected error", error);
    return response(
      request,
      { error: mapped.message, code: mapped.code },
      mapped.status,
      undefined,
      resHeaders
    );
  }
}
