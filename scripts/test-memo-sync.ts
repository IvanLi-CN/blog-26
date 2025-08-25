#!/usr/bin/env bun

import { LocalContentSource } from "../src/lib/content-sources/local";
import { ContentSourceManager } from "../src/lib/content-sources/manager";
import { contentItemToMemo, memoToContentItem } from "../src/lib/content-sources/memo-adapter";
import { WebDAVContentSource } from "../src/lib/content-sources/webdav";
import { db } from "../src/lib/db";
import { memos } from "../src/lib/schema";

async function testMemoSync() {
  console.log("🔄 测试 memo 多源数据同步机制...");

  try {
    // 创建内容源管理器
    const _manager = new ContentSourceManager();

    // 添加本地内容源
    const localSource = new LocalContentSource({
      name: "local",
      priority: 50,
      enabled: true,
      contentTypes: ["memo"],
      options: {
        contentPath: "./dev-data/local",
        recursive: true,
      },
    });

    // 添加 WebDAV 内容源（如果可用）
    let webdavSource: WebDAVContentSource | null = null;
    try {
      console.log("🔧 创建 WebDAV 内容源...");
      webdavSource = new WebDAVContentSource({
        name: "webdav",
        priority: 100,
        enabled: true,
        contentTypes: ["memo"],
        options: {
          pathMappings: {
            posts: ["/blog"],
            projects: ["/blog/projects"],
            memos: ["/Memos"],
          },
        },
      });
      console.log("✅ WebDAV 内容源创建成功");
    } catch (error) {
      console.log("⚠️  WebDAV 内容源创建失败:", error);
      webdavSource = null;
    }

    // 初始化内容源
    console.log("📁 初始化内容源...");
    await localSource.initialize();
    console.log("✅ 本地内容源初始化成功");

    if (webdavSource) {
      try {
        console.log("🔧 初始化 WebDAV 内容源...");
        await webdavSource.initialize();
        console.log("✅ WebDAV 内容源初始化成功");
      } catch (error) {
        console.log("⚠️  WebDAV 初始化失败:", error);
        webdavSource = null;
      }
    }

    // 获取所有 memo 内容
    console.log("📋 从所有内容源获取 memo...");
    const allContent: any[] = [];

    // 从本地源获取内容
    const localContent = await localSource.listContent();
    allContent.push(...localContent);

    // 从 WebDAV 源获取内容（如果可用）
    if (webdavSource) {
      try {
        console.log("📋 从 WebDAV 获取内容...");
        const webdavContent = await webdavSource.listContent();
        console.log(`📂 WebDAV 获取到 ${webdavContent.length} 个内容项`);
        allContent.push(...webdavContent);
      } catch (error) {
        console.log("⚠️  WebDAV 内容获取失败:", error);
      }
    }

    const memoContent = allContent.filter((item) => item.type === "memo");

    console.log(`\n📊 内容源扫描结果:`);
    console.log(`  总内容数: ${allContent.length}`);
    console.log(`  Memo 数量: ${memoContent.length}`);

    // 按内容源分组显示
    const contentBySource = memoContent.reduce(
      (acc, item) => {
        if (!acc[item.source]) {
          acc[item.source] = [];
        }
        acc[item.source].push(item);
        return acc;
      },
      {} as Record<string, typeof memoContent>
    );

    Object.entries(contentBySource).forEach(([source, items]) => {
      const itemsArray = items as any[]; // 类型断言
      console.log(`\n  📂 ${source} 源: ${itemsArray.length} 个 memo`);
      itemsArray.forEach((item, index) => {
        console.log(`    ${index + 1}. ${item.title} (${item.id})`);
      });
    });

    // 测试数据库同步
    console.log(`\n💾 测试数据库同步...`);

    // 清空现有的 memo 数据
    await db.delete(memos);
    console.log("🗑️  清空现有 memo 数据");

    // 同步每个 memo 到数据库
    let syncedCount = 0;
    for (const contentItem of memoContent) {
      try {
        // 调试：检查 ContentItem 的结构
        if (syncedCount === 0) {
          console.log("📋 ContentItem 结构示例:");
          console.log("  ID:", contentItem.id);
          console.log("  Title:", contentItem.title);
          console.log("  Metadata keys:", Object.keys(contentItem.metadata));
          console.log("  Metadata.content length:", contentItem.metadata.content?.length || 0);
        }

        // 转换为数据库记录
        const memoRecord = contentItemToMemo(contentItem, "test@example.com");

        // 确保必需字段有值
        const completeRecord = {
          ...memoRecord,
          source: memoRecord.source || "unknown",
          id: memoRecord.id || `memo-${Date.now()}`,
          createdAt: memoRecord.createdAt || Date.now(),
        };

        // 插入数据库
        await db.insert(memos).values(completeRecord as any);
        syncedCount++;

        console.log(`✅ 同步成功: ${contentItem.title}`);
      } catch (error) {
        console.error(`❌ 同步失败: ${contentItem.title}`, error);
      }
    }

    console.log(`\n📈 同步统计:`);
    console.log(`  待同步: ${memoContent.length}`);
    console.log(`  已同步: ${syncedCount}`);
    console.log(`  失败: ${memoContent.length - syncedCount}`);

    // 验证数据库中的数据
    console.log(`\n🔍 验证数据库数据...`);
    const dbMemos = await db.select().from(memos);
    console.log(`数据库中的 memo 数量: ${dbMemos.length}`);

    // 测试数据转换的一致性
    console.log(`\n🔄 测试数据转换一致性...`);
    for (const dbMemo of dbMemos) {
      try {
        // 从数据库记录转换回 ContentItem
        const convertedItem = memoToContentItem(dbMemo);

        // 找到原始的 ContentItem
        const originalItem = memoContent.find((item) => item.id === dbMemo.id);

        if (originalItem) {
          // 比较关键字段
          const fieldsMatch =
            convertedItem.id === originalItem.id &&
            convertedItem.type === originalItem.type &&
            convertedItem.title === originalItem.title &&
            convertedItem.public === originalItem.public;

          if (fieldsMatch) {
            console.log(`✅ 数据一致性验证通过: ${convertedItem.title}`);
          } else {
            console.log(`❌ 数据一致性验证失败: ${convertedItem.title}`);
            console.log("  原始:", {
              id: originalItem.id,
              type: originalItem.type,
              title: originalItem.title,
              public: originalItem.public,
            });
            console.log("  转换:", {
              id: convertedItem.id,
              type: convertedItem.type,
              title: convertedItem.title,
              public: convertedItem.public,
            });
          }
        }
      } catch (error) {
        console.error(`❌ 转换失败: ${dbMemo.id}`, error);
      }
    }

    console.log(`\n🎉 多源数据同步测试完成！`);
  } catch (error) {
    console.error("❌ 测试失败:", error);
    throw error;
  }
}

// 运行测试
testMemoSync().catch((error) => {
  console.error("测试过程中发生错误:", error);
  process.exit(1);
});
