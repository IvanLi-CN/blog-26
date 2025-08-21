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

// 支持的内容源类型
type ContentSource = "webdav" | "local";

// 验证内容源是否有效
function isValidContentSource(source: string): source is ContentSource {
  return source === "webdav" || source === "local";
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
  // 支持 memos/Memos 目录大小写兼容
  const normalizedPath = filePath.startsWith("memos/")
    ? `memos/${filePath.substring(6)}`
    : filePath.startsWith("Memos/")
      ? `memos/${filePath.substring(6)}`
      : filePath;

  const webdavUrl = `${process.env.WEBDAV_URL || "http://localhost:8080"}/${normalizedPath}`;

  console.log("🌐 [Files API] 请求 WebDAV 文件:", webdavUrl);

  const response = await fetch(webdavUrl, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`WebDAV 服务器返回错误: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

// 本地文件读取
async function readLocalFile(filePath: string): Promise<Buffer> {
  const fullPath = join(process.cwd(), "dev-data", "local", filePath);

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
  const webdavUrl = `${process.env.NEXT_PUBLIC_WEBDAV_URL || "http://localhost:8080"}/${filePath}`;

  console.log("🌐 [Files API] 上传文件到 WebDAV 服务器:", webdavUrl);

  const response = await fetch(webdavUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`WebDAV 上传失败: ${response.status}`);
  }
}

// 本地文件上传
async function uploadLocalFile(filePath: string, buffer: Buffer): Promise<void> {
  const fullPath = join(process.cwd(), "dev-data", "local", filePath);
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
  _request: NextRequest,
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
  } catch (error) {
    console.error("❌ [Files API] 读取文件失败:", error);
    return NextResponse.json({ error: "读取文件失败" }, { status: 500 });
  }
}

// POST - 上传文件
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ source: string; path: string[] }> }
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
