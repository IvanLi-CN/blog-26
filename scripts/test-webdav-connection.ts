#!/usr/bin/env bun

/**
 * 测试 WebDAV 连接
 */

import { getWebDAVClient, isWebDAVEnabled } from "../src/lib/webdav";

async function testWebDAVConnection() {
  console.log("🔗 测试 WebDAV 连接...");

  console.log("环境变量:");
  console.log("  WEBDAV_URL:", process.env.WEBDAV_URL);
  console.log("  WEBDAV_USERNAME:", process.env.WEBDAV_USERNAME);
  console.log("  WEBDAV_PASSWORD:", process.env.WEBDAV_PASSWORD ? "***" : "未设置");

  if (!isWebDAVEnabled()) {
    console.log("❌ WebDAV 未启用");
    return;
  }

  try {
    const client = getWebDAVClient();
    console.log("✅ WebDAV 客户端创建成功");

    // 测试获取根目录
    console.log("📁 测试根目录...");
    const rootFiles = await client.listFiles("/");
    console.log(`📝 根目录发现 ${rootFiles.length} 个文件`);

    rootFiles.slice(0, 10).forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.filename} (${file.type})`);
    });

    // 测试获取 memos 目录（非递归）
    console.log("\n📁 测试 memos 目录（非递归）...");
    try {
      const memoFiles = await client.listFiles("/memos", false);
      console.log(`📝 memos 目录发现 ${memoFiles.length} 个文件`);

      memoFiles.slice(0, 5).forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.filename} (${file.type})`);
      });
    } catch (error) {
      console.error("❌ memos 目录访问失败（非递归）:", error);
    }

    // 测试获取 memos 目录（递归）
    console.log("\n📁 测试 Memos 目录（递归）...");
    try {
      const memoFilesRecursive = await client.listFiles("/memos", true);
      console.log(`📝 memos 目录发现 ${memoFilesRecursive.length} 个文件（递归）`);

      memoFilesRecursive.slice(0, 5).forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.filename} (${file.type})`);
      });
    } catch (error) {
      console.error("❌ memos 目录访问失败（递归）:", error);
    }
  } catch (error) {
    console.error("❌ WebDAV 连接测试失败:", error);
  }
}

testWebDAVConnection();
