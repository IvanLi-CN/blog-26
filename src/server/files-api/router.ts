export const filesApiRuntime = "nodejs";
export const filesApiDynamic = "force-dynamic";

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getLocalPath, isLocalContentEnabled } from "@/config/paths";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import {
  appendPublicCorsHeaders,
  createPublicCorsPreflightResponse,
  resolveRequestOrigin,
} from "@/lib/public-cors";

const FILES_API_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "OPTIONS"] as const;

function normalizeOrigin(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function isCrossOriginWriteRequest(request: Request) {
  const callerOrigin = normalizeOrigin(request.headers.get("origin"));
  const requestOrigin = resolveRequestOrigin(request);
  return Boolean(callerOrigin && requestOrigin && callerOrigin !== requestOrigin);
}

function json(request: Request, data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  appendPublicCorsHeaders(headers, request, FILES_API_ALLOWED_METHODS);
  return new Response(JSON.stringify(data), { ...init, headers });
}

function withCors(headersInit: HeadersInit | undefined, request: Request) {
  const headers = new Headers(headersInit);
  appendPublicCorsHeaders(headers, request, FILES_API_ALLOWED_METHODS);
  return headers;
}

function isImageRequest(filePath: string, request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("image/")) return true;
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
}

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "md":
      return "text/markdown";
    case "txt":
      return "text/plain";
    case "json":
      return "application/json";
    default:
      return "application/octet-stream";
  }
}

function createMissingFileError(message = "文件不存在") {
  const error = new Error(message) as Error & { code?: string };
  error.code = "ENOENT";
  return error;
}

async function readLocalFile(filePath: string): Promise<Buffer> {
  if (!isLocalContentEnabled()) {
    throw new Error("本地内容源未启用，请设置 LOCAL_CONTENT_BASE_PATH");
  }

  const fullPath = getLocalPath(filePath);

  if (!existsSync(fullPath)) {
    throw createMissingFileError();
  }

  return readFile(fullPath);
}

async function uploadLocalFile(filePath: string, buffer: Buffer): Promise<void> {
  if (!isLocalContentEnabled()) {
    throw new Error("本地内容源未启用，请设置 LOCAL_CONTENT_BASE_PATH");
  }

  const fullPath = getLocalPath(filePath);
  const dirPath = dirname(fullPath);

  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }

  await writeFile(fullPath, buffer);
}

function validateFileRequest(source: string, filePath: string) {
  if (source !== "local") {
    return { error: "仅支持 local 内容源", status: 400 } as const;
  }

  if (filePath.includes("..") || filePath.includes("~")) {
    return { error: "不安全的文件路径", status: 400 } as const;
  }

  return null;
}

function isMissingFileError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeCode = (error as Error & { code?: string }).code;
  return error.message.includes("文件不存在") || maybeCode === "ENOENT";
}

function notFoundResponse(request: Request, filePath: string) {
  if (isImageRequest(filePath, request)) {
    return new Response(request.method === "HEAD" ? null : new Uint8Array(), {
      status: 404,
      headers: withCors(
        {
          "Content-Type": getContentType(filePath),
          "Cache-Control": "no-store",
        },
        request
      ),
    });
  }

  return json(request, { error: "文件不存在" }, { status: 404 });
}

export async function handleFilesApiRequest(
  request: Request,
  params: { source: string; path: string[] }
) {
  if (request.method === "OPTIONS") {
    return createPublicCorsPreflightResponse(request, FILES_API_ALLOWED_METHODS);
  }

  const { source, path: pathSegments } = params;
  const filePath = pathSegments?.join("/") || "";
  const validation = validateFileRequest(source, filePath);

  if (validation) {
    return json(request, { error: validation.error }, { status: validation.status });
  }

  try {
    if (request.method === "GET" || request.method === "HEAD") {
      const content = await readLocalFile(filePath);
      return new Response(request.method === "HEAD" ? null : content, {
        status: 200,
        headers: withCors(
          {
            "Content-Type": getContentType(filePath),
            "Cache-Control": "no-store",
          },
          request
        ),
      });
    }

    if (request.method === "POST" || request.method === "PUT") {
      const auth = await extractAuthFromRequest(request);
      const allowed = auth.isAdmin || !isCrossOriginWriteRequest(request);
      if (!allowed) {
        return json(request, { error: "跨域写入需要管理员身份" }, { status: 403 });
      }

      const body = await request.arrayBuffer();
      await uploadLocalFile(filePath, Buffer.from(body));
      return json(
        request,
        { ok: true, success: true, source: "local", path: filePath },
        { status: 200 }
      );
    }

    return json(request, { error: "不支持的请求方法" }, { status: 405 });
  } catch (error) {
    if (isMissingFileError(error)) {
      return notFoundResponse(request, filePath);
    }

    const message = error instanceof Error ? error.message : "未知错误";
    return json(request, { error: message }, { status: 500 });
  }
}
