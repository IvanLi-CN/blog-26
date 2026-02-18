export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 统一文件代理 API
 *
 * 支持多种内容源：webdav 和 local
 * 路径格式：/api/files/<source>/[...path]
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { getLocalPath, isLocalContentEnabled } from "@/config/paths";
import { isWebDAVEnabled } from "@/lib/webdav";

// 支持的内容源类型
type ContentSource = "webdav" | "local";

const WEBDAV_DISABLED_ERROR = {
  error: "ERR_WEBDAV_DISABLED",
  message: "WebDAV 已禁用：请将内容中的 /api/files/webdav/... 链接迁移为相对路径",
} as const;

// 验证内容源是否有效
function isValidContentSource(source: string): source is ContentSource {
  return source === "webdav" || source === "local";
}

function isImageRequest(filePath: string, request: NextRequest): boolean {
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

// 根据文件扩展名获取 Content-Type
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

// WebDAV 文件读取
async function readWebDAVFile(filePath: string): Promise<ArrayBuffer> {
  const baseUrl = process.env.WEBDAV_URL;
  if (!baseUrl) {
    throw new Error("WebDAV 已禁用");
  }
  const cleanPath = filePath.startsWith("/") ? filePath : `/${filePath}`;
  const webdavUrl = `${baseUrl.replace(/\/$/, "")}${cleanPath}`;

  console.log("🌐 [Files API] 请求 WebDAV 文件:", webdavUrl);

  // 准备认证头
  const headers: Record<string, string> = {};

  // 如果配置了用户名和密码，添加基本认证
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

// 本地文件读取
async function readLocalFile(filePath: string): Promise<Buffer> {
  if (!isLocalContentEnabled()) {
    throw new Error("本地内容源未启用，请设置 LOCAL_CONTENT_BASE_PATH");
  }
  // 使用统一配置的本地内容根路径，支持通过环境变量覆盖
  const fullPath = getLocalPath(filePath);

  console.log("📖 [Files API] 读取本地文件:", { filePath, fullPath });

  if (!existsSync(fullPath)) {
    throw new Error("文件不存在");
  }

  return readFile(fullPath);
}

// WebDAV 文件上传
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

  console.log("🌐 [Files API] 上传文件到 WebDAV 服务器:", webdavUrl);

  // 准备认证头
  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };

  // 如果配置了用户名和密码，添加基本认证
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

// 本地文件上传
async function uploadLocalFile(filePath: string, buffer: Buffer): Promise<void> {
  if (!isLocalContentEnabled()) {
    throw new Error("本地内容源未启用，请设置 LOCAL_CONTENT_BASE_PATH");
  }
  // 使用统一配置的本地内容根路径，支持通过环境变量覆盖
  const fullPath = getLocalPath(filePath);
  const dirPath = join(fullPath, "..");

  console.log("💾 [Files API] 上传文件到本地文件系统:", { filePath, fullPath });

  // 确保目录存在
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }

  await writeFile(fullPath, buffer);
}

// GET - 读取文件
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ source: string; path: string[] }> }
) {
  try {
    const { source, path: pathSegments } = await params;
    const filePath = pathSegments?.join("/") || "";

    console.log(`📖 [Files API] 读取文件: ${source}:${filePath}`);

    // 验证内容源
    if (!isValidContentSource(source)) {
      return NextResponse.json({ error: "不支持的内容源" }, { status: 400 });
    }

    // 验证路径安全性
    if (filePath.includes("..") || filePath.includes("~")) {
      return NextResponse.json({ error: "不安全的文件路径" }, { status: 400 });
    }

    // FS-only / whitelist: WebDAV 显式禁用
    if (source === "webdav" && !isWebDAVEnabled()) {
      if (isImageRequest(filePath, request)) {
        const png = await getWebdavDisabledPng();
        return new NextResponse(png, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "no-store",
          },
        });
      }
      return NextResponse.json(WEBDAV_DISABLED_ERROR, { status: 410 });
    }

    let fileBuffer: ArrayBuffer | Buffer;

    // 根据内容源读取文件
    if (source === "webdav") {
      fileBuffer = await readWebDAVFile(filePath);
    } else {
      fileBuffer = await readLocalFile(filePath);
    }

    const contentType = getContentType(filePath);

    console.log(`✅ [Files API] 成功读取文件: ${source}:${filePath}`, {
      contentType,
      size: fileBuffer.byteLength || (fileBuffer as Buffer).length,
    });

    return new NextResponse(fileBuffer as BodyInit, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000", // 缓存1年
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    // 对 404 进行更友好的处理，避免误判为服务器错误
    if (message.includes("404")) {
      console.warn("⚠️ [Files API] 文件不存在:", message);
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    console.error("❌ [Files API] 读取文件失败:", error);
    return NextResponse.json({ error: "读取文件失败" }, { status: 500 });
  }
}

// POST/PUT - 上传文件
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ source: string; path: string[] }> }
) {
  return handleFileUpload(request, params);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ source: string; path: string[] }> }
) {
  return handleFileUpload(request, params);
}

// 统一的文件上传处理函数
async function handleFileUpload(
  request: NextRequest,
  params: Promise<{ source: string; path: string[] }>
) {
  try {
    const { source, path: pathSegments } = await params;
    const filePath = pathSegments?.join("/") || "";

    console.log(`🔄 [Files API] 上传文件: ${source}:${filePath}`, {
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
    });

    // 验证内容源
    if (!isValidContentSource(source)) {
      return NextResponse.json({ error: "不支持的内容源" }, { status: 400 });
    }

    // 验证路径安全性
    if (filePath.includes("..") || filePath.includes("~")) {
      return NextResponse.json({ error: "不安全的文件路径" }, { status: 400 });
    }

    // FS-only / whitelist: WebDAV 显式禁用（读写均禁用）
    if (source === "webdav" && !isWebDAVEnabled()) {
      return NextResponse.json(WEBDAV_DISABLED_ERROR, { status: 410 });
    }

    // 获取文件内容
    const contentType = request.headers.get("content-type") || "";
    let buffer: ArrayBuffer;

    if (contentType.includes("multipart/form-data")) {
      // 处理 multipart/form-data（从前端上传的图片）
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json({ error: "表单中未找到文件" }, { status: 400 });
      }

      buffer = await file.arrayBuffer();
    } else {
      // 处理其他类型的数据（如直接的二进制数据）
      buffer = await request.arrayBuffer();
    }

    const fileBuffer = Buffer.from(buffer);

    // 验证文件大小
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "文件太大。最大支持 10MB" }, { status: 400 });
    }

    const finalContentType = contentType.includes("multipart/form-data")
      ? getContentType(filePath)
      : contentType || getContentType(filePath);

    // 根据内容源上传文件
    if (source === "webdav") {
      await uploadWebDAVFile(filePath, buffer, finalContentType);
    } else {
      await uploadLocalFile(filePath, fileBuffer);
    }

    console.log(`✅ [Files API] 文件上传成功: ${source}:${filePath}`, {
      size: fileBuffer.length,
    });

    return NextResponse.json({
      success: true,
      path: filePath,
      url: `/api/files/${source}/${filePath}`,
    });
  } catch (error) {
    console.error("❌ [Files API] 文件上传失败:", error);
    return NextResponse.json({ error: "文件上传失败" }, { status: 500 });
  }
}
