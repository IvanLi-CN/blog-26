#!/usr/bin/env bun

/**
 * 测试 LocalContentSource 的 memo 识别功能
 */

import { LocalContentSource } from "../src/lib/content-sources/local";

async function testLocalMemoRecognition() {
  console.log("🧪 测试 LocalContentSource memo 识别功能...");

  // 创建本地内容源实例
  const localSource = new LocalContentSource({
    name: "local-test",
    priority: 50,
    enabled: true,
    contentTypes: ["memo", "post", "project"],
    options: {
      contentPath: "./dev-data/local",
      recursive: true,
      excludePatterns: ["node_modules", ".git"],
    },
  });

  try {
    // 初始化内容源
    console.log("📁 初始化本地内容源...");
    await localSource.initialize();

    // 获取所有内容
    console.log("📋 扫描内容文件...");
    const contentItems = await localSource.listContent();

    // 过滤出 memo 类型的内容
    const memoItems = contentItems.filter((item) => item.type === "memo");

    console.log(`\n📊 扫描结果:`);
    console.log(`  总文件数: ${contentItems.length}`);
    console.log(`  Memo 文件数: ${memoItems.length}`);

    if (memoItems.length > 0) {
      console.log(`\n📝 发现的 Memo 文件:`);
      memoItems.forEach((memo, index) => {
        console.log(`\n  ${index + 1}. ${memo.title}`);
        console.log(`     ID: ${memo.id}`);
        console.log(`     Slug: ${memo.slug}`);
        console.log(`     Type: ${memo.type}`);
        console.log(`     Public: ${memo.public}`);
        console.log(`     Tags: ${memo.tags.join(", ")}`);
        console.log(`     Source: ${memo.source}`);
        console.log(`     File Path: ${memo.filePath}`);
      });

      console.log(`\n✅ LocalContentSource 成功识别了 ${memoItems.length} 个 memo 文件！`);
    } else {
      console.log(`\n❌ 没有发现 memo 类型的文件`);
    }

    // 测试特定路径的内容类型推断
    console.log(`\n🔍 测试路径类型推断:`);
    const testPaths = [
      "memos/test-memo-1.md",
      "/memos/test-memo-2.md",
      "posts/test-post.md",
      "projects/test-project.md",
    ];

    const { inferContentTypeFromPath } = await import("../src/lib/content-sources/utils");

    testPaths.forEach((path) => {
      const type = inferContentTypeFromPath(path);
      console.log(`  ${path} -> ${type}`);
    });
  } catch (error) {
    console.error("❌ 测试失败:", error);
    throw error;
  } finally {
    // 清理资源
    await localSource.dispose();
  }
}

// 运行测试
testLocalMemoRecognition().catch((error) => {
  console.error("测试过程中发生错误:", error);
  process.exit(1);
});
