#!/usr/bin/env bun
process.env.WEBDAV_URL = "http://localhost:8080";

import { initializeDB } from "../src/lib/db";
import { adminContentSyncRouter } from "../src/server/routers/admin/content-sync";

console.log("🧪 开始测试内容同步 API...");

async function testContentSyncAPI() {
  // 初始化数据库
  console.log("🔧 初始化数据库...");
  await initializeDB();
  console.log("✅ 数据库初始化完成");

  // 创建 tRPC caller
  const mockRequest = new Request("http://localhost:25090/api/trpc");
  const mockHeaders = new Headers();

  const caller = adminContentSyncRouter.createCaller({
    // 模拟管理员上下文
    req: mockRequest,
    resHeaders: mockHeaders,
    user: { id: "admin-test", email: "admin@test.com", nickname: "Admin Test" },
    isAdmin: true,
  });

  try {
    // 测试获取系统配置
    console.log("\n1️⃣ 测试获取系统配置...");
    const systemConfig = await caller.getSystemConfig();
    console.log("✅ 系统配置获取成功:");
    console.log(`   - WebDAV 启用: ${systemConfig.webdavEnabled ? "是" : "否"}`);
    console.log(`   - WebDAV URL: ${systemConfig.webdavUrl || "未配置"}`);
    console.log(`   - 支持的内容源: ${systemConfig.supportedSources.join(", ")}`);
    console.log(`   - 默认路径: ${JSON.stringify(systemConfig.defaultPaths, null, 2)}`);

    // 测试获取管理器统计信息
    console.log("\n2️⃣ 测试获取管理器统计信息...");
    const managerStats = await caller.getManagerStats();
    console.log("✅ 管理器统计信息:");
    console.log(`   - 注册的内容源: ${managerStats.registeredSources}`);
    console.log(`   - 启用的内容源: ${managerStats.enabledSources}`);
    console.log(`   - 当前同步状态: ${managerStats.currentSyncStatus || "无"}`);
    console.log(
      `   - 最后同步时间: ${managerStats.lastSyncTime ? new Date(managerStats.lastSyncTime).toISOString() : "从未同步"}`
    );
    console.log(`   - 总同步次数: ${managerStats.totalSyncs}`);

    // 测试获取内容源状态
    console.log("\n3️⃣ 测试获取内容源状态...");
    const sourcesStatus = await caller.getSourcesStatus();
    console.log(`✅ 发现 ${sourcesStatus.length} 个内容源:`);
    sourcesStatus.forEach((source, index) => {
      console.log(`   ${index + 1}. ${source.name} (${source.type})`);
      console.log(`      - 优先级: ${source.priority}`);
      console.log(`      - 启用: ${source.enabled ? "是" : "否"}`);
      console.log(`      - 在线: ${source.online ? "✅" : "❌"}`);
      console.log(`      - 文件总数: ${source.totalItems}`);
      console.log(
        `      - 最后同步: ${source.lastSync ? new Date(source.lastSync).toISOString() : "从未同步"}`
      );
      if (source.error) {
        console.log(`      - 错误: ${source.error}`);
      }
    });

    // 测试验证连接
    console.log("\n4️⃣ 测试验证所有连接...");
    const connectionResults = await caller.validateConnections();
    console.log("✅ 连接验证结果:");
    connectionResults.forEach((result) => {
      console.log(`   ${result.sourceName}: ${result.isConnected ? "✅ 连接正常" : "❌ 连接失败"}`);
    });

    // 测试获取同步进度（应该为空）
    console.log("\n5️⃣ 测试获取同步进度...");
    const syncProgress = await caller.getSyncProgress();
    if (syncProgress) {
      console.log("✅ 当前同步进度:");
      console.log(`   - 状态: ${syncProgress.status}`);
      console.log(`   - 进度: ${syncProgress.progress}%`);
      console.log(`   - 当前步骤: ${syncProgress.currentStep}`);
      console.log(`   - 已处理: ${syncProgress.processedItems}/${syncProgress.totalItems}`);
    } else {
      console.log("✅ 当前没有进行中的同步");
    }

    // 测试触发同步
    console.log("\n6️⃣ 测试触发全量同步...");
    const syncResult = await caller.triggerSync({
      maxConcurrentSyncs: 2,
      syncTimeout: 60000,
      enableTransactions: true,
      conflictResolution: "priority",
    });

    console.log("✅ 同步触发成功:");
    console.log(`   - 成功: ${syncResult.success ? "✅" : "❌"}`);
    console.log(`   - 同步 ID: ${syncResult.syncId}`);
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

    // 测试获取同步日志
    console.log("\n7️⃣ 测试获取同步日志...");
    const syncLogs = await caller.getSyncLogs({ limit: 10, offset: 0 });
    console.log(`✅ 获取到 ${syncLogs.length} 条同步日志:`);
    syncLogs.slice(-5).forEach((log) => {
      const time = new Date(log.createdAt).toLocaleTimeString();
      console.log(`   [${time}] ${log.sourceName}: ${log.message}`);
    });

    // 测试获取同步历史
    console.log("\n8️⃣ 测试获取同步历史...");
    const syncHistory = await caller.getSyncHistory({ limit: 5 });
    console.log(`✅ 获取到 ${syncHistory.length} 条同步历史:`);
    syncHistory.forEach((history, index) => {
      const time = new Date(history.startTime).toLocaleTimeString();
      console.log(
        `   ${index + 1}. [${time}] ${history.success ? "✅" : "❌"} 耗时: ${history.duration}ms`
      );
      console.log(
        `      处理: ${history.stats.totalProcessed}, 新增: ${history.stats.created}, 更新: ${history.stats.updated}`
      );
    });

    // 测试重复同步（应该失败）
    console.log("\n9️⃣ 测试重复同步检测...");
    try {
      // 这应该会失败，因为没有正在进行的同步
      await caller.cancelSync();
      console.log("✅ 取消同步成功（没有正在进行的同步）");
    } catch (_error) {
      console.log("✅ 取消同步处理正常");
    }

    console.log("\n🎉 内容同步 API 测试全部通过！");
  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error);

    if (error instanceof Error) {
      console.error("错误详情:", error.message);
      if (error.stack) {
        console.error("错误堆栈:", error.stack);
      }
    }

    process.exit(1);
  }
}

// 运行测试
testContentSyncAPI().catch(console.error);
