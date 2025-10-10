#!/usr/bin/env bun

// 设置测试环境变量
// process.env.NODE_ENV = "test"; // 注释掉，因为 NODE_ENV 是只读的

import { resolve } from "node:path";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "../src/lib/content-sources";
import { initializeDB } from "../src/lib/db";
import { isWebDAVEnabled } from "../src/lib/webdav";

interface SyncOptions {
  /** 最大并发同步数 */
  maxConcurrentSyncs?: number;
  /** 同步超时时间（毫秒） */
  syncTimeout?: number;
  /** 是否启用事务 */
  enableTransactions?: boolean;
  /** 冲突解决策略 */
  conflictResolution?: "priority" | "timestamp" | "manual";
  /** 是否显示详细日志 */
  verbose?: boolean;
}

class TestContentSyncTrigger {
  private options: Required<SyncOptions>;

  constructor(options: SyncOptions = {}) {
    this.options = {
      maxConcurrentSyncs: options.maxConcurrentSyncs || 2,
      syncTimeout: options.syncTimeout || 120000, // 2分钟
      enableTransactions: options.enableTransactions !== false,
      conflictResolution: options.conflictResolution || "priority",
      verbose: options.verbose !== false,
    };
  }

  /**
   * 执行测试环境内容同步
   */
  async triggerSync(): Promise<boolean> {
    try {
      this.log("🧪 开始测试环境内容同步...");

      // 强制重新初始化数据库以确保使用正确的路径
      this.log("🔧 强制重新初始化数据库...");
      this.log(`📁 当前数据库路径: ${process.env.DB_PATH || "./sqlite.db"}`);
      await initializeDB(true); // 强制重新初始化
      this.log("✅ 数据库重新初始化完成");

      // 创建内容源管理器
      const manager = getContentSourceManager(this.options);

      // 注册测试环境的内容源
      await this.registerTestContentSources(manager);

      // 检查内容源状态
      await this.checkContentSourcesStatus(manager);

      // 执行同步
      this.log("🔄 开始执行内容同步...");
      const result = await manager.syncAll();

      // 输出同步结果
      this.logSyncResult(result);

      if (!result.success) {
        throw new Error(`同步失败: ${result.errors.map((e) => e.message).join(", ")}`);
      }

      this.log("🎉 测试环境内容同步完成！");
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`❌ 测试环境内容同步失败: ${errorMessage}`, "error");
      return false;
    }
  }

  /**
   * 注册测试环境的内容源
   */
  private async registerTestContentSources(manager: ReturnType<typeof getContentSourceManager>) {
    this.log("📝 注册测试环境内容源...");

    // 注册本地内容源（测试数据）— 使用标准名称，便于应用端按名称获取
    const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
      contentPath: resolve("./test-data/local"),
    });
    const localSource = new LocalContentSource(localConfig);
    await manager.registerSource(localSource);
    this.log("✅ 本地测试内容源注册成功");

    const webdavEnabled = isWebDAVEnabled();

    if (!webdavEnabled) {
      throw new Error("WebDAV 服务未启用：测试环境必须提供可访问的 WEBDAV_URL 并启动对应服务");
    }

    const webdavUrl = process.env.WEBDAV_URL ?? "";
    await this.assertWebDAVReachable(webdavUrl);

    try {
      const webdavConfig = WebDAVContentSource.createDefaultConfig("webdav", 200);
      // 使用测试环境的路径映射（注意：必须是数组格式）
      webdavConfig.options.pathMappings = {
        posts: ["/blog"],
        projects: ["/projects"],
        memos: ["/memos"],
      };
      const webdavSource = new WebDAVContentSource(webdavConfig);
      await manager.registerSource(webdavSource);
      this.log("✅ WebDAV 内容源注册成功");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`WebDAV 内容源注册失败: ${errorMessage}`);
    }
  }

  private async assertWebDAVReachable(webdavUrl: string) {
    this.log(`🔍 校验 WebDAV 服务可用性: ${webdavUrl}`);
    try {
      const response = await fetch(webdavUrl, { method: "HEAD" });
      if (!response.ok && response.status !== 405) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      this.log(
        `❌ WebDAV 服务不可达: ${webdavUrl}，${error instanceof Error ? error.message : error}`,
        "error"
      );
      throw new Error(`无法连接 WebDAV (${webdavUrl})，请确认服务已启动且网络可达`);
    }

    // HEAD 有些 WebDAV 服务可能不支持，做一次 GET 验证
    try {
      const response = await fetch(webdavUrl, { method: "GET" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      this.log("🟢 WebDAV 服务响应正常");
    } catch (error) {
      throw new Error(
        `WebDAV GET 校验失败：${webdavUrl}，${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * 检查内容源状态
   */
  private async checkContentSourcesStatus(manager: ReturnType<typeof getContentSourceManager>) {
    this.log("🔍 检查内容源状态...");

    const sourcesStatus = await manager.getAllSourcesStatus();

    for (const { source, status } of sourcesStatus) {
      const statusObj = status as any; // 类型断言
      const statusIcon = statusObj.online ? "🟢" : "🔴";
      this.log(
        `  ${statusIcon} ${source.name}: ${statusObj.online ? "在线" : "离线"} (${statusObj.totalItems} 项)`
      );

      if (statusObj.error) {
        this.log(`    ⚠️ 错误: ${statusObj.error}`, "warn");
      }
    }
  }

  /**
   * 输出同步结果
   */
  private logSyncResult(result: any) {
    this.log("\n📊 同步结果统计:");
    this.log(`  ✅ 成功: ${result.success ? "是" : "否"}`);
    this.log(`  ⏱️ 耗时: ${result.endTime - result.startTime}ms`);
    this.log(`  📝 总处理: ${result.stats.totalProcessed}`);
    this.log(`  ➕ 新增: ${result.stats.created}`);
    this.log(`  🔄 更新: ${result.stats.updated}`);
    this.log(`  ➖ 删除: ${result.stats.deleted}`);
    this.log(`  ⏭️ 跳过: ${result.stats.skipped}`);
    this.log(`  ❌ 错误: ${result.stats.errors}`);

    if (result.errors.length > 0) {
      this.log("\n❌ 错误详情:");
      for (const error of result.errors) {
        this.log(`  - ${error.source}: ${error.message}`, "error");
      }
    }
  }

  /**
   * 日志输出
   */
  private log(message: string, level: "info" | "warn" | "error" = "info") {
    if (!this.options.verbose) return;

    const timestamp = new Date().toISOString().slice(11, 23);
    const prefix = `[${timestamp}]`;

    switch (level) {
      case "warn":
        console.warn(`${prefix} ${message}`);
        break;
      case "error":
        console.error(`${prefix} ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  const options: SyncOptions = {
    verbose: !args.includes("--quiet"),
    maxConcurrentSyncs: 2,
    syncTimeout: 120000,
    enableTransactions: true,
    conflictResolution: "priority",
  };

  const trigger = new TestContentSyncTrigger(options);
  const success = await trigger.triggerSync();

  process.exit(success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("脚本执行失败:", error);
    process.exit(1);
  });
}

export { TestContentSyncTrigger };
