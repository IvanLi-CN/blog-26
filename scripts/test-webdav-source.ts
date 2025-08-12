#!/usr/bin/env bun

/**
 * WebDAV 内容源测试脚本
 *
 * 验证 WebDAV 内容源的功能是否正常工作
 */

// 设置测试环境变量（必须在导入模块之前设置）
if (!process.env.WEBDAV_URL) {
  process.env.WEBDAV_URL = "http://localhost:8080";
}

import { WebDAVContentSource } from "../src/lib/content-sources/webdav";
import { isWebDAVEnabled } from "../src/lib/webdav";

console.log("🧪 开始测试 WebDAV 内容源...");

async function testWebDAVContentSource() {
  // 检查 WebDAV 是否启用
  if (!isWebDAVEnabled()) {
    console.log("⚠️  WebDAV 未配置，跳过测试");
    console.log("💡 提示：设置 WEBDAV_URL 环境变量来启用 WebDAV 测试");
    console.log("   例如：WEBDAV_URL=http://localhost:8080 bun scripts/test-webdav-source.ts");
    return;
  }

  console.log(`🌐 WebDAV URL: ${process.env.WEBDAV_URL}`);

  // 创建 WebDAV 内容源配置
  const config = WebDAVContentSource.createDefaultConfig("test-webdav", 100);

  console.log("📋 WebDAV 配置:");
  console.log(`   - 名称: ${config.name}`);
  console.log(`   - 优先级: ${config.priority}`);
  console.log(`   - 路径映射:`);
  console.log(`     * posts: ${config.options.pathMappings.posts}`);
  console.log(`     * projects: ${config.options.pathMappings.projects}`);
  console.log(`     * memos: ${config.options.pathMappings.memos}`);

  // 验证配置
  try {
    WebDAVContentSource.validateConfig(config);
    console.log("✅ 配置验证通过");
  } catch (error) {
    console.error("❌ 配置验证失败:", error);
    return;
  }

  // 创建内容源实例
  const webdavSource = new WebDAVContentSource(config);

  try {
    // 初始化
    console.log("\n1️⃣ 初始化 WebDAV 内容源...");
    await webdavSource.initialize();
    console.log("✅ 初始化成功");

    // 验证连接
    console.log("\n2️⃣ 验证 WebDAV 连接...");
    const isConnected = await webdavSource.validateConnection();
    console.log(`   连接状态: ${isConnected ? "✅ 正常" : "❌ 失败"}`);

    if (!isConnected) {
      console.log("💡 提示：请确保 WebDAV 服务器正在运行");
      console.log("   可以运行：bun run webdav:dev");
      return;
    }

    // 获取状态
    console.log("\n3️⃣ 获取状态信息...");
    const status = await webdavSource.getStatus();
    console.log(`   内容源: ${status.name}`);
    console.log(`   在线状态: ${status.online ? "✅" : "❌"}`);
    console.log(`   文件总数: ${status.totalItems}`);
    console.log(
      `   最后同步: ${status.lastSyncTime ? new Date(status.lastSyncTime).toISOString() : "从未同步"}`
    );

    if (status.metadata) {
      console.log(`   缓存文件数: ${status.metadata.cachedFiles}`);
      console.log(`   缓存 ETag 数: ${status.metadata.cachedETags}`);
    }

    // 列出内容
    console.log("\n4️⃣ 扫描 WebDAV 内容文件...");
    const contentItems = await webdavSource.listContent();
    console.log(`   发现 ${contentItems.length} 个内容项:`);

    if (contentItems.length === 0) {
      console.log("   📝 没有发现内容文件");
      console.log("   💡 提示：请确保 WebDAV 服务器中有 Markdown 文件");
    } else {
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
      console.log("5️⃣ 测试获取文件内容...");
      const firstItem = contentItems[0];
      const content = await webdavSource.getContent(firstItem.filePath);
      console.log(`   文件: ${firstItem.filePath}`);
      console.log(`   内容长度: ${content.length} 字符`);
      console.log(`   内容预览: ${content.substring(0, 100)}...`);
    }

    // 测试变更检测
    console.log("\n6️⃣ 测试变更检测...");
    const changeSet = await webdavSource.detectChanges();
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
    const logs = webdavSource.getLogs();
    console.log(`   日志条数: ${logs.length}`);

    if (logs.length > 0) {
      console.log("   所有日志:");
      logs.forEach((log) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        console.log(`     [${time}] ${log.level.toUpperCase()}: ${log.message}`);
        if (log.data) {
          console.log(`       数据:`, log.data);
        }
      });
    }

    // 清理资源
    console.log("\n8️⃣ 清理资源...");
    await webdavSource.dispose();
    console.log("✅ 资源清理完成");

    console.log("\n🎉 WebDAV 内容源测试全部通过！");
  } catch (error) {
    console.error("❌ 测试过程中发生错误:", error);

    // 显示详细的日志信息
    const logs = webdavSource.getLogs();
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
testWebDAVContentSource().catch(console.error);
