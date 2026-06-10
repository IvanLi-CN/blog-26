#!/usr/bin/env bun

/**
 * Unified local-only content sync trigger for development and test environments.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseContentSourcesFromEnv } from "../src/config/paths";
import { getContentSourceManager, LocalContentSource } from "../src/lib/content-sources";
import { initializeDB } from "../src/lib/db";

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

  return {
    targetEnv: envArg as SupportedEnv,
    opts: {
      verbose: !args.includes("--quiet"),
      maxConcurrentSyncs: 2,
      syncTimeout: 120000,
      enableTransactions: true,
      conflictResolution: "priority",
      forceReinit: args.includes("--force"),
    },
  };
}

async function loadDotEnvLocalIfPresent() {
  try {
    const neededKeys = ["LOCAL_CONTENT_BASE_PATH", "DB_PATH"];
    const missing = neededKeys.filter((key) => process.env[key] === undefined);
    if (missing.length === 0) return;

    const content = await readFile(".env.local", "utf8").catch(() => "");
    if (!content) return;

    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (process.env[key] === undefined && value.length > 0) {
        process.env[key] = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
      }
    }
  } catch {
    // ignore
  }
}

async function registerLocalSource(
  manager: ReturnType<typeof getContentSourceManager>,
  basePath: string
) {
  if (manager.getSource("local")) {
    console.log("ℹ️ 本地内容源已存在，跳过重新注册");
    return;
  }
  const localConfig = LocalContentSource.createDefaultConfig("local", 50, {
    contentPath: resolve(basePath),
  });
  await manager.registerSource(new LocalContentSource(localConfig));
  console.log(`✅ 本地内容源已注册: ${resolve(basePath)}`);
}

async function main() {
  await loadDotEnvLocalIfPresent();
  const { targetEnv, opts } = parseArgs();

  const dbPath = expectEnv("DB_PATH", targetEnv);
  const localBase = expectEnv("LOCAL_CONTENT_BASE_PATH", targetEnv);
  const allowedSources = parseContentSourcesFromEnv(process.env.CONTENT_SOURCES);
  if (allowedSources && !allowedSources.has("local")) {
    throw new Error(`(${targetEnv}) CONTENT_SOURCES 当前必须包含 local。`);
  }

  console.log(`🔧 同步环境: ${targetEnv}`);
  console.log(`📁 使用数据库: ${dbPath}`);
  console.log(`📋 CONTENT_SOURCES: ${process.env.CONTENT_SOURCES || "local"}`);
  console.log(`📂 local: ${localBase}`);

  await initializeDB(opts.forceReinit);

  const manager = getContentSourceManager(opts);
  await registerLocalSource(manager, localBase);

  console.log("🚀 开始执行全量同步 (local)...");
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
  main().catch((error) => {
    console.error("❌ trigger-sync 失败:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
