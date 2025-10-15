#!/usr/bin/env bun

/**
 * Unified content sync trigger for development and test environments.
 *
 * Usage:
 *   bun ./scripts/trigger-sync.ts dev   # requires DB_PATH, LOCAL_CONTENT_BASE_PATH, optional WEBDAV_URL
 *   bun ./scripts/trigger-sync.ts test  # requires DB_PATH, LOCAL_CONTENT_BASE_PATH, WEBDAV_URL
 *
 * Required environment variables must be exported by the caller to avoid
 * implicit defaults and keep the workflow reproducible.
 */

import { resolve } from "node:path";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "../src/lib/content-sources";
import { initializeDB } from "../src/lib/db";
import { isWebDAVEnabled } from "../src/lib/webdav";

type SupportedEnv = "dev" | "test";

interface SyncOptions {
  verbose: boolean;
  maxConcurrentSyncs: number;
  syncTimeout: number;
  enableTransactions: boolean;
  conflictResolution: "priority" | "timestamp" | "manual";
  forceReinit: boolean;
}

function expectEnv(name: string, label: SupportedEnv): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`(${label}) 环境变量 ${name} 未设置，请先导出再运行同步脚本。`);
  }
  return value.trim();
}

function parseArgs(): { targetEnv: SupportedEnv; opts: SyncOptions } {
  const args = process.argv.slice(2);
  const envArg = (process.env.SYNC_ENV || args[0] || "dev").toLowerCase();

  if (envArg !== "dev" && envArg !== "test") {
    throw new Error(`不支持的同步环境: ${envArg}. 仅支持 "dev" 或 "test"。`);
  }

  const opts: SyncOptions = {
    verbose: !args.includes("--quiet"),
    maxConcurrentSyncs: 2,
    syncTimeout: 120000,
    enableTransactions: true,
    conflictResolution: "priority",
    forceReinit: args.includes("--force"),
  };

  return { targetEnv: envArg as SupportedEnv, opts };
}

async function registerLocalSource(
  manager: ReturnType<typeof getContentSourceManager>,
  basePath: string
) {
  const resolvedPath = resolve(basePath);
  if (manager.getSource("local")) {
    console.log("ℹ️ 本地内容源已存在，跳过重新注册");
    return;
  }
  const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
    contentPath: resolvedPath,
  });
  const localSource = new LocalContentSource(localConfig);
  await manager.registerSource(localSource);
  console.log(`✅ 本地内容源已注册: ${resolvedPath}`);
}

async function registerWebDAVSource(manager: ReturnType<typeof getContentSourceManager>) {
  if (!isWebDAVEnabled()) {
    console.warn("⚠️ 未检测到 WEBDAV_URL，跳过 WebDAV 内容源注册。");
    return;
  }
  if (manager.getSource("webdav")) {
    console.log("ℹ️ WebDAV 内容源已存在，跳过重新注册");
    return;
  }

  const webdavConfig = WebDAVContentSource.createDefaultConfig("webdav", 200);
  const webdavSource = new WebDAVContentSource(webdavConfig);
  await manager.registerSource(webdavSource);
  console.log(`✅ WebDAV 内容源已注册: ${process.env.WEBDAV_URL}`);
}

async function main() {
  const { targetEnv, opts } = parseArgs();

  const dbPath = expectEnv("DB_PATH", targetEnv);
  const localBase = expectEnv("LOCAL_CONTENT_BASE_PATH", targetEnv);

  if (targetEnv === "test") {
    // 测试环境必须同步 WebDAV，确保数据集完整
    expectEnv("WEBDAV_URL", targetEnv);
  }

  console.log(`🔧 同步环境: ${targetEnv}`);
  console.log(`📁 使用数据库: ${dbPath}`);
  console.log(`📂 本地内容目录: ${localBase}`);
  if (process.env.WEBDAV_URL) {
    console.log(`🌐 WebDAV: ${process.env.WEBDAV_URL}`);
  }

  await initializeDB(opts.forceReinit);

  const manager = getContentSourceManager(opts);
  await registerLocalSource(manager, localBase);
  await registerWebDAVSource(manager);

  console.log("🚀 开始执行全量同步 (local + WebDAV)...");
  const result = await manager.syncAll(true);

  console.log("📊 同步结果:");
  console.log(`  ✅ success: ${result.success}`);
  console.log(`  ➕ created: ${result.stats.created}`);
  console.log(`  🔄 updated: ${result.stats.updated}`);
  console.log(`  ➖ deleted: ${result.stats.deleted}`);
  console.log(`  ⏭ skipped: ${result.stats.skipped}`);
  console.log(`  📝 processed: ${result.stats.totalProcessed}`);

  if (result.errors.length > 0) {
    console.error("❌ 同步出现错误:");
    for (const err of result.errors) {
      console.error(`  - [${err.source}] ${err.message}`);
    }
    process.exit(1);
  }

  console.log("🎉 同步完成");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("同步失败:", err);
    process.exit(1);
  });
}
