/**
 * WebDAV 风格的文件上传 API
 *
 * 完全模仿旧项目的 /api/files/webdav/[...path].ts 实现
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";

// 支持的文件类型
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/markdown",
  "application/pdf",
];

// 最大文件大小 (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    const pathSegments = params.path || [];
    const filePath = pathSegments.join("/");

    console.log("🔄 [WebDAV API] 处理文件上传:", {
      path: filePath,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
    });

    // 验证路径安全性
    if (filePath.includes("..") || filePath.includes("~")) {
      return NextResponse.json({ error: "不安全的文件路径" }, { status: 400 });
    }

    // 获取文件内容
    const buffer = await request.arrayBuffer();
    const fileBuffer = Buffer.from(buffer);

    // 验证文件大小
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "文件太大。最大支持 10MB" }, { status: 400 });
    }

    // 验证文件类型（如果提供了 Content-Type）
    const contentType = request.headers.get("content-type");
    if (contentType && !ALLOWED_TYPES.includes(contentType)) {
      console.warn("⚠️ [WebDAV API] 未知文件类型:", contentType);
      // 不阻止上传，只是警告
    }

    // 确保上传目录存在
    const uploadDir = join(process.cwd(), "public", "uploads");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // 创建完整的文件路径
    const fullFilePath = join(uploadDir, filePath);
    const fileDir = join(fullFilePath, "..");

    // 确保文件目录存在
    if (!existsSync(fileDir)) {
      await mkdir(fileDir, { recursive: true });
    }

    // 保存文件
    await writeFile(fullFilePath, fileBuffer);

    console.log("✅ [WebDAV API] 文件上传成功:", {
      path: filePath,
      size: fileBuffer.length,
      savedTo: fullFilePath,
    });

    // 返回成功响应（模仿旧项目的响应格式）
    return NextResponse.json({
      success: true,
      path: filePath,
      size: fileBuffer.length,
      contentType: contentType || "application/octet-stream",
      url: `/uploads/${filePath}`,
    });
  } catch (error) {
    console.error("❌ [WebDAV API] 文件上传失败:", error);
    return NextResponse.json({ error: "文件上传失败" }, { status: 500 });
  }
}

// 支持 GET 方法用于文件访问（可选）
export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    const pathSegments = params.path || [];
    const filePath = pathSegments.join("/");

    // 验证路径安全性
    if (filePath.includes("..") || filePath.includes("~")) {
      return NextResponse.json({ error: "不安全的文件路径" }, { status: 400 });
    }

    const fullFilePath = join(process.cwd(), "public", "uploads", filePath);

    if (!existsSync(fullFilePath)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // 重定向到静态文件
    return NextResponse.redirect(new URL(`/uploads/${filePath}`, request.url));
  } catch (error) {
    console.error("❌ [WebDAV API] 文件访问失败:", error);
    return NextResponse.json({ error: "文件访问失败" }, { status: 500 });
  }
}
