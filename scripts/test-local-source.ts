#!/usr/bin/env bun

/**
 * 本地内容源测试脚本
 *
 * 验证本地内容源的功能是否正常工作
 */

import { resolve } from "node:path";
import { LocalContentSource } from "../src/lib/content-sources/local";

console.log("🧪 开始测试本地内容源...");

async function testLocalContentSource() {
  // 创建本地内容源配置
  const config = LocalContentSource.createDefaultConfig("test-local", resolve("./src/content"), 50);

  console.log(`📁 内容路径: ${config.options.contentPath}`);

  // 验证配置
  try {
    LocalContentSource.validateConfig(config);
    console.log("✅ 配置验证通过");
  } catch (error) {
    console.error("❌ 配置验证失败:", error);
    return;
  }

  // 创建内容源实例
  const localSource = new LocalContentSource(config);

  try {
    // 初始化
    console.log("\n1️⃣ 初始化内容源...");
    await localSource.initialize();
    console.log("✅ 初始化成功");

    // 验证连接
    console.log("\n2️⃣ 验证连接...");
    const isConnected = await localSource.validateConnection();
    console.log(`   连接状态: ${isConnected ? "✅ 正常" : "❌ 失败"}`);

    // 获取状态
    console.log("\n3️⃣ 获取状态信息...");
    const status = await localSource.getStatus();
    console.log(`   内容源: ${status.name}`);
    console.log(`   在线状态: ${status.online ? "✅" : "❌"}`);
    console.log(`   文件总数: ${status.totalItems}`);
    console.log(
      `   最后同步: ${status.lastSyncTime ? new Date(status.lastSyncTime).toISOString() : "从未同步"}`
    );

    // 列出内容
    console.log("\n4️⃣ 扫描内容文件...");
    const contentItems = await localSource.listContent();
    console.log(`   发现 ${contentItems.length} 个内容项:`);

    contentItems.forEach((item, index) => {
      console.log(`   ${index + 1}. [${item.type}] ${item.title}`);
      console.log(`      - ID: ${item.id}`);
      console.log(`      - Slug: ${item.slug}`);
      console.log(`      - 分类: ${item.category || "无"}`);
      console.log(`      - 标签: ${item.tags.join(", ") || "无"}`);
      console.log(`      - 草稿: ${item.draft ? "是" : "否"}`);
      console.log(`      - 公开: ${item.public ? "是" : "否"}`);
      console.log(`      - 哈希: ${item.contentHash.substring(0, 8)}...`);
      console.log(`      - 修改时间: ${new Date(item.lastModified).toISOString()}`);
      console.log("");
    });

    // 测试获取具体内容
    if (contentItems.length > 0) {
      console.log("5️⃣ 测试获取文件内容...");
      const firstItem = contentItems[0];
      const content = await localSource.getContent(firstItem.filePath);
      console.log(`   文件: ${firstItem.filePath}`);
      console.log(`   内容长度: ${content.length} 字符`);
      console.log(`   内容预览: ${content.substring(0, 100)}...`);
    }

    // 测试变更检测
    console.log("\n6️⃣ 测试变更检测...");
    const changeSet = await localSource.detectChanges();
    console.log(`   变更源: ${changeSet.sourceName}`);
    console.log(`   检测时间: ${new Date(changeSet.detectedAt).toISOString()}`);
    console.log(`   变更统计:`);
    console.log(`     - 总计: ${changeSet.stats.total}`);
    console.log(`     - 新增: ${changeSet.stats.created}`);
    console.log(`     - 更新: ${changeSet.stats.updated}`);
    console.log(`     - 删除: ${changeSet.stats.deleted}`);
    console.log(`     - 跳过: ${changeSet.stats.skipped}`);

    // 获取日志
    console.log("\n7️⃣ 获取操作日志...");
    const logs = localSource.getLogs();
    console.log(`   日志条数: ${logs.length}`);

    if (logs.length > 0) {
      console.log("   最近的日志:");
      logs.slice(-5).forEach((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        console.log(`     [${time}] ${log.level.toUpperCase()}: ${log.message}`);
      });
    }

    // 清理资源
    console.log("\n8️⃣ 清理资源...");
    await localSource.dispose();
    console.log("✅ 资源清理完成");

    console.log("\n🎉 本地内容源测试全部通过！");
  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error);

    // 显示详细的日志信息
    const logs = localSource.getLogs();
    if (logs.length > 0) {
      console.log("\n📋 错误日志:");
      logs
        .filter((log) => log.level === "error")
        .forEach((log) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          console.log(`   [${time}] ${log.message}`);
          if (log.data) {
            console.log(`   数据:`, log.data);
          }
        });
    }

    process.exit(1);
  }
}

// 运行测试
testLocalContentSource().catch(console.error);
