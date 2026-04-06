#!/usr/bin/env bun

// 设置环境变量
export {}; // 使文件成为模块以支持顶层 await

process.env.WEBDAV_URL = "http://localhost:8080";

console.log("🔍 调试 WebDAV 问题...");
console.log("环境变量:", process.env.WEBDAV_URL);

// 测试原始 WebDAV 客户端
console.log("\n1️⃣ 测试原始 WebDAV 客户端...");
try {
  const { getWebDAVClient } = await import("../src/lib/webdav");
  const client = getWebDAVClient();
  console.log("✅ WebDAV 客户端创建成功");

  const files = await client.listFiles("/blog", true);
  console.log(`✅ 找到 ${files.length} 个文件:`);
  files.forEach((file) => {
    console.log(`   - ${file.filename} (${file.type})`);
  });
} catch (error) {
  console.error("❌ WebDAV 客户端测试失败:", error);
}

// 测试 WebDAV 内容源
console.log("\n2️⃣ 测试 WebDAV 内容源...");
try {
  const { WebDAVContentSource } = await import("../src/lib/content-sources/webdav");

  const config = WebDAVContentSource.createDefaultConfig("debug-webdav", 100);
  console.log("配置:", config);

  const source = new WebDAVContentSource(config);
  await source.initialize();
  console.log("✅ WebDAV 内容源初始化成功");

  const logs = source.getLogs();
  console.log(`📋 日志 (${logs.length} 条):`);
  logs.forEach((log) => {
    console.log(`   [${log.level.toUpperCase()}] ${log.message}`);
    if (log.data) {
      console.log(`   数据:`, log.data);
    }
  });
} catch (error) {
  console.error("❌ WebDAV 内容源测试失败:", error);
}
