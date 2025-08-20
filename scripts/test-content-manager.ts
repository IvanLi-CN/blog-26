#!/usr/bin/env bun
process.env.WEBDAV_URL = "http://localhost:8080";

import { resolve } from "node:path";
import { LocalContentSource } from "../src/lib/content-sources/local";
import { ContentSourceManager } from "../src/lib/content-sources/manager";
import { WebDAVContentSource } from "../src/lib/content-sources/webdav";
import { initializeDB } from "../src/lib/db";

console.log("🧪 开始测试内容源管理器...");

async function testContentSourceManager() {
  // 初始化数据库
  console.log("🔧 初始化数据库...");
  await initializeDB();
  console.log("✅ 数据库初始化完成");

  const manager = new ContentSourceManager({
    maxConcurrentSyncs: 2,
    syncTimeout: 60000,
    enableTransactions: true,
    conflictResolution: "priority",
  });

  try {
    console.log("📊 管理器初始状态:");
    const initialStats = manager.getManagerStats();
    console.log(`   - 注册的内容源: ${initialStats.registeredSources}`);
    console.log(`   - 启用的内容源: ${initialStats.enabledSources}`);
    console.log(`   - 当前同步状态: ${initialStats.currentSyncStatus || "无"}`);

    // 注册本地内容源
    console.log("\n1️⃣ 注册本地内容源...");
    const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
      contentPath: resolve("./src/content"),
    });
    const localSource = new LocalContentSource(localConfig);
    await manager.registerSource(localSource);
    console.log("✅ 本地内容源注册成功");

    // 尝试注册 WebDAV 内容源（可能会失败，但不影响测试）
    console.log("\n2️⃣ 尝试注册 WebDAV 内容源...");
    try {
      const webdavConfig = WebDAVContentSource.createDefaultConfig("webdav", 100);
      const webdavSource = new WebDAVContentSource(webdavConfig);
      await manager.registerSource(webdavSource);
      console.log("✅ WebDAV 内容源注册成功");
    } catch (error) {
      console.log(
        "⚠️  WebDAV 内容源注册失败（预期的）:",
        error instanceof Error ? error.message : String(error)
      );
    }

    // 获取注册的内容源
    console.log("\n3️⃣ 获取注册的内容源...");
    const sources = manager.getSources();
    console.log(`   发现 ${sources.length} 个内容源:`);
    sources.forEach((source, index) => {
      console.log(
        `   ${index + 1}. ${source.name} (类型: ${source.type}, 优先级: ${source.priority})`
      );
    });

    // 验证所有连接
    console.log("\n4️⃣ 验证所有内容源连接...");
    const connectionResults = await manager.validateAllConnections();
    for (const [sourceName, isConnected] of connectionResults) {
      console.log(`   ${sourceName}: ${isConnected ? "✅ 连接正常" : "❌ 连接失败"}`);
    }

    // 获取所有内容源状态
    console.log("\n5️⃣ 获取所有内容源状态...");
    const allStatus = await manager.getAllSourcesStatus();
    allStatus.forEach(({ source, status, lastSync }) => {
      console.log(`   ${source.name}:`);
      const statusObj = status as any; // 类型断言
      console.log(`     - 在线: ${statusObj.online ? "✅" : "❌"}`);
      console.log(`     - 文件总数: ${statusObj.totalItems}`);
      console.log(`     - 最后同步: ${lastSync ? new Date(lastSync).toISOString() : "从未同步"}`);
      if (statusObj.error) {
        console.log(`     - 错误: ${statusObj.error}`);
      }
    });

    // 执行同步
    console.log("\n6️⃣ 执行全量同步...");
    const syncResult = await manager.syncAll();

    console.log("📊 同步结果:");
    console.log(`   - 成功: ${syncResult.success ? "✅" : "❌"}`);
    console.log(`   - 耗时: ${syncResult.endTime - syncResult.startTime}ms`);
    console.log(`   - 处理的内容源: ${syncResult.sources.join(", ")}`);
    console.log(`   - 统计信息:`);
    console.log(`     * 总处理: ${syncResult.stats.totalProcessed}`);
    console.log(`     * 新增: ${syncResult.stats.created}`);
    console.log(`     * 更新: ${syncResult.stats.updated}`);
    console.log(`     * 删除: ${syncResult.stats.deleted}`);
    console.log(`     * 跳过: ${syncResult.stats.skipped}`);
    console.log(`     * 错误: ${syncResult.stats.errors}`);

    if (syncResult.errors.length > 0) {
      console.log("\n❌ 同步错误:");
      syncResult.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. [${error.source}] ${error.message}`);
        if (error.filePath) {
          console.log(`      文件: ${error.filePath}`);
        }
      });
    }

    if (syncResult.logs.length > 0) {
      console.log("\n📋 同步日志:");
      syncResult.logs.slice(-5).forEach((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        console.log(`   [${time}] ${log.level.toUpperCase()}: ${log.message}`);
      });
    }

    // 获取数据库中的同步日志
    console.log("\n7️⃣ 获取数据库同步日志...");
    const dbLogs = await manager.getSyncLogs(10);
    console.log(`   数据库中有 ${dbLogs.length} 条日志:`);
    dbLogs.slice(-5).forEach((log) => {
      const logObj = log as any; // 类型断言
      const time = new Date(logObj.createdAt).toLocaleTimeString();
      console.log(`   [${time}] ${logObj.sourceName}: ${logObj.message}`);
    });

    // 获取管理器统计信息
    console.log("\n8️⃣ 获取管理器统计信息...");
    const finalStats = manager.getManagerStats();
    console.log(`   - 注册的内容源: ${finalStats.registeredSources}`);
    console.log(`   - 启用的内容源: ${finalStats.enabledSources}`);
    console.log(`   - 当前同步状态: ${finalStats.currentSyncStatus || "无"}`);
    console.log(
      `   - 最后同步时间: ${finalStats.lastSyncTime ? new Date(finalStats.lastSyncTime).toISOString() : "从未同步"}`
    );
    console.log(`   - 总同步次数: ${finalStats.totalSyncs}`);

    // 清理资源
    console.log("\n9️⃣ 清理资源...");
    await manager.dispose();
    console.log("✅ 资源清理完成");

    console.log("\n🎉 内容源管理器测试完成！");
  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error);

    // 尝试获取管理器日志
    try {
      const logs = await manager.getSyncLogs(20);
      if (logs.length > 0) {
        console.log("\n📋 管理器日志:");
        logs.forEach((log) => {
          const logObj = log as any; // 类型断言
          const time = new Date(logObj.createdAt).toLocaleTimeString();
          console.log(`   [${time}] ${logObj.sourceName}: ${logObj.message}`);
        });
      }
    } catch {
      // 忽略日志获取错误
    }

    process.exit(1);
  }
}

// 运行测试
testContentSourceManager().catch(console.error);
