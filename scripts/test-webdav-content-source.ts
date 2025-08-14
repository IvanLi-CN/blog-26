#!/usr/bin/env bun

/**
 * 专门测试 WebDAV 内容源
 */

import { WebDAVContentSource } from "../src/lib/content-sources/webdav";

async function testWebDAVContentSource() {
  console.log("🧪 测试 WebDAV 内容源...");

  try {
    // 创建 WebDAV 内容源
    const webdavSource = new WebDAVContentSource({
      name: "webdav-test",
      priority: 100,
      enabled: true,
      contentTypes: ["memo", "post", "project"],
      options: {
        pathMappings: {
          posts: "/blog",
          projects: "/blog/projects",
          memos: "/Memos",
        },
        enableETagCache: true,
      },
    });

    console.log("✅ WebDAV 内容源创建成功");

    // 初始化
    console.log("🔧 初始化 WebDAV 内容源...");
    await webdavSource.initialize();
    console.log("✅ WebDAV 内容源初始化成功");

    // 获取状态
    const status = await webdavSource.getStatus();
    console.log("📊 WebDAV 内容源状态:", {
      name: status.name,
      online: status.online,
      totalItems: status.totalItems,
      error: status.error,
    });

    // 获取所有内容
    console.log("📋 获取所有内容...");
    const allContent = await webdavSource.listContent();
    console.log(`📂 总共获取到 ${allContent.length} 个内容项`);

    // 按类型分组
    const contentByType = allContent.reduce(
      (acc, item) => {
        if (!acc[item.type]) {
          acc[item.type] = [];
        }
        acc[item.type].push(item);
        return acc;
      },
      {} as Record<string, typeof allContent>
    );

    Object.entries(contentByType).forEach(([type, items]) => {
      console.log(`\n📝 ${type} 类型: ${items.length} 个`);
      items.slice(0, 3).forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.title} (${item.id})`);
      });
      if (items.length > 3) {
        console.log(`  ... 还有 ${items.length - 3} 个`);
      }
    });

    // 特别检查 memo 类型
    const memoItems = allContent.filter((item) => item.type === "memo");
    console.log(`\n🎯 Memo 内容详情:`);
    console.log(`  数量: ${memoItems.length}`);

    if (memoItems.length > 0) {
      console.log(`  示例:`);
      memoItems.slice(0, 2).forEach((memo, index) => {
        console.log(`    ${index + 1}. ${memo.title}`);
        console.log(`       ID: ${memo.id}`);
        console.log(`       Source: ${memo.source}`);
        console.log(`       File Path: ${memo.filePath}`);
        console.log(`       Public: ${memo.public}`);
        console.log(`       Tags: ${memo.tags.join(", ")}`);
      });
    }

    // 清理
    await webdavSource.dispose();
    console.log("🧹 资源清理完成");
  } catch (error) {
    console.error("❌ 测试失败:", error);
    throw error;
  }
}

// 运行测试
testWebDAVContentSource().catch((error) => {
  console.error("测试过程中发生错误:", error);
  process.exit(1);
});
