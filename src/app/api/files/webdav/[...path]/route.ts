/**
 * WebDAV 风格的文件 API
 * 支持文件的读取和上传
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";

// GET - 读取文件
export async function GET(_request: NextRequest, { params }: { params: { path: string[] } }) {
  try {
    const pathSegments = params.path || [];
    const filePath = pathSegments.join("/");

    console.log("📖 [WebDAV API] 读取文件:", filePath);

    // 验证路径安全性
    if (filePath.includes("..") || filePath.includes("~")) {
      return NextResponse.json({ error: "不安全的文件路径" }, { status: 400 });
    }

    // 构建完整文件路径
    const fullPath = join(process.cwd(), "public", "uploads", filePath);

    // 检查文件是否存在
    if (!existsSync(fullPath)) {
      console.log("❌ [WebDAV API] 文件不存在:", fullPath);
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    // 读取文件
    const fileBuffer = await readFile(fullPath);

    // 根据文件扩展名设置 Content-Type
    const ext = filePath.split(".").pop()?.toLowerCase();
    let contentType = "application/octet-stream";

    switch (ext) {
      case "png":
        contentType = "image/png";
        break;
      case "jpg":
      case "jpeg":
        contentType = "image/jpeg";
        break;
      case "gif":
        contentType = "image/gif";
        break;
      case "webp":
        contentType = "image/webp";
        break;
      case "svg":
        contentType = "image/svg+xml";
        break;
      case "md":
        contentType = "text/markdown";
        break;
      case "txt":
        contentType = "text/plain";
        break;
      case "json":
        contentType = "application/json";
        break;
    }

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000", // 缓存1年
      },
    });
  } catch (error) {
    console.error("❌ [WebDAV API] 读取文件失败:", error);
    return NextResponse.json({ error: "读取文件失败" }, { status: 500 });
  }
}

// POST - 上传文件
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
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "文件太大。最大支持 10MB" }, { status: 400 });
    }

    // 构建完整文件路径
    const fullPath = join(process.cwd(), "public", "uploads", filePath);
    const dirPath = join(fullPath, "..");

    // 确保目录存在
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    // 写入文件
    await writeFile(fullPath, fileBuffer);

    console.log("✅ [WebDAV API] 文件上传成功:", {
      path: filePath,
      size: fileBuffer.length,
      fullPath,
    });

    return NextResponse.json({
      success: true,
      path: filePath,
      url: `/uploads/${filePath}`,
    });
  } catch (error) {
    console.error("❌ [WebDAV API] 文件上传失败:", error);
    return NextResponse.json({ error: "文件上传失败" }, { status: 500 });
  }
}
