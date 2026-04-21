export const filesApiRuntime = "nodejs";
export const filesApiDynamic = "force-dynamic";

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getLocalPath, isLocalContentEnabled } from "@/config/paths";
import { extractAuthFromRequest } from "@/lib/auth-utils";
import {
  appendPublicCorsHeaders,
  createPublicCorsPreflightResponse,
  resolveRequestOrigin,
} from "@/lib/public-cors";
import { isWebDAVEnabled } from "@/lib/webdav";

type ContentSource = "webdav" | "local";

const FILES_API_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "OPTIONS"] as const;
const WEBDAV_DISABLED_ERROR = {
  error: "ERR_WEBDAV_DISABLED",
  message: "WebDAV 已禁用：请将内容中的 /api/files/webdav/... 链接迁移为相对路径",
} as const;

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

function isValidContentSource(source: string): source is ContentSource {
  return source === "webdav" || source === "local";
}

function isImageRequest(filePath: string, request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  if (accept.includes("image/")) return true;
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext);
}

let webdavDisabledPngCache: Buffer | null = null;
async function getWebdavDisabledPng(): Promise<Buffer> {
  if (webdavDisabledPngCache) return webdavDisabledPngCache;
  const png = await readFile(join(process.cwd(), "public/images/webdav-disabled.png"));
  webdavDisabledPngCache = png;
  return png;
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

async function readWebDAVFile(filePath: string): Promise<ArrayBuffer> {
  const baseUrl = process.env.WEBDAV_URL;
  if (!baseUrl) {
    throw new Error("WebDAV 已禁用");
  }
  const cleanPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
  const webdavUrl = `${baseUrl.replace(/\/$/, "")}${cleanPath}`;

  const headers: Record<string, string> = {};

  if (process.env.WEBDAV_USERNAME && process.env.WEBDAV_PASSWORD) {
    const credentials = Buffer.from(
      `${process.env.WEBDAV_USERNAME}:${process.env.WEBDAV_PASSWORD}`
    ).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }

  const response = await fetch(webdavUrl, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(`WebDAV 服务器返回错误: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

async function readLocalFile(filePath: string): Promise<Buffer> {
  if (!isLocalContentEnabled()) {
    throw new Error("本地内容源未启用，请设置 LOCAL_CONTENT_BASE_PATH");
  }

  const fullPath = getLocalPath(filePath);

  if (!existsSync(fullPath)) {
    throw new Error("文件不存在");
  }

  return readFile(fullPath);
}

async function uploadWebDAVFile(
  filePath: string,
  buffer: ArrayBuffer,
  contentType: string
): Promise<void> {
  const baseUrl = process.env.WEBDAV_URL;
  if (!baseUrl) {
    throw new Error("WebDAV 已禁用");
  }
  const cleanPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
  const webdavUrl = `${baseUrl.replace(/\/$/, "")}${cleanPath}`;

  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };

  if (process.env.WEBDAV_USERNAME && process.env.WEBDAV_PASSWORD) {
    const credentials = Buffer.from(
      `${process.env.WEBDAV_USERNAME}:${process.env.WEBDAV_PASSWORD}`
    ).toString("base64");
    headers.Authorization = `Basic ${credentials}`;
  }

  const response = await fetch(webdavUrl, {
    method: "PUT",
    headers,
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`WebDAV 上传失败: ${response.status}`);
  }
}

async function uploadLocalFile(filePath: string, buffer: Buffer): Promise<void> {
  if (!isLocalContentEnabled()) {
    throw new Error("本地内容源未启用，请设置 LOCAL_CONTENT_BASE_PATH");
  }

  const fullPath = getLocalPath(filePath);
  const dirPath = join(fullPath, "..");

  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }

  await writeFile(fullPath, buffer);
}

function validateFileRequest(source: string, filePath: string) {
  if (!isValidContentSource(source)) {
    return { error: "不支持的内容源", status: 400 } as const;
  }

  if (filePath.includes("..") || filePath.includes("~")) {
    return { error: "不安全的文件路径", status: 400 } as const;
  }

  if (source === "webdav" && !isWebDAVEnabled()) {
    return "webdav-disabled" as const;
  }

  return null;
}

function isMissingFileError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeCode = (error as Error & { code?: string }).code;
  return (
    error.message.includes("文件不存在") || error.message.includes("404") || maybeCode === "ENOENT"
  );
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

  if (validation && validation !== "webdav-disabled") {
    return json(request, { error: validation.error }, { status: validation.status });
  }

  try {
    if (request.method === "GET" || request.method === "HEAD") {
      if (validation === "webdav-disabled") {
        if (isImageRequest(filePath, request)) {
          const png = await getWebdavDisabledPng();
          return new Response(request.method === "HEAD" ? null : png, {
            status: 200,
            headers: withCors(
              {
                "Content-Type": "image/png",
                "Cache-Control": "no-store",
              },
              request
            ),
          });
        }
        return json(request, WEBDAV_DISABLED_ERROR, { status: 410 });
      }

      const fileBuffer =
        source === "webdav" ? await readWebDAVFile(filePath) : await readLocalFile(filePath);
      const contentType = getContentType(filePath);
      return new Response(request.method === "HEAD" ? null : (fileBuffer as BodyInit), {
        headers: withCors(
          {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000",
          },
          request
        ),
      });
    }

    if (request.method === "POST" || request.method === "PUT") {
      if (validation === "webdav-disabled") {
        return json(request, WEBDAV_DISABLED_ERROR, { status: 410 });
      }

      if (isCrossOriginWriteRequest(request)) {
        const auth = await extractAuthFromRequest(request);
        if (!auth.user) {
          return json(request, { error: "Authentication required" }, { status: 401 });
        }
        if (!auth.isAdmin) {
          return json(request, { error: "Admin access required" }, { status: 403 });
        }
      }

      const contentType = request.headers.get("content-type") || "";
      let buffer: ArrayBuffer;

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
          return json(request, { error: "表单中未找到文件" }, { status: 400 });
        }
        buffer = await file.arrayBuffer();
      } else {
        buffer = await request.arrayBuffer();
      }

      const fileBuffer = Buffer.from(buffer);
      if (fileBuffer.length > 10 * 1024 * 1024) {
        return json(request, { error: "文件太大。最大支持 10MB" }, { status: 400 });
      }

      const finalContentType = contentType.includes("multipart/form-data")
        ? getContentType(filePath)
        : contentType || getContentType(filePath);

      if (source === "webdav") {
        await uploadWebDAVFile(filePath, buffer, finalContentType);
      } else {
        await uploadLocalFile(filePath, fileBuffer);
      }

      return json(
        request,
        {
          success: true,
          path: filePath,
          url: `/api/files/${source}/${filePath}`,
        },
        { status: 200 }
      );
    }

    return json(request, { error: `Method ${request.method} not allowed` }, { status: 405 });
  } catch (error: unknown) {
    if (isMissingFileError(error)) {
      return notFoundResponse(request, filePath);
    }
    console.error("❌ [Files API] 请求失败:", error);
    return json(
      request,
      {
        error:
          request.method === "GET" || request.method === "HEAD" ? "读取文件失败" : "文件上传失败",
      },
      { status: 500 }
    );
  }
}
