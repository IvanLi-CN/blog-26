#!/usr/bin/env bun

/**
 * Incremental content sync helper for development and test environments.
 *
 * Usage:
 *   bun ./scripts/trigger-sync-incremental.ts      # SYNC_ENV=dev (default)
 *   SYNC_ENV=test bun ./scripts/trigger-sync-incremental.ts
 *
 * Required env:
 *   - DB_PATH
 *   - WEBDAV_URL
 *   - LOCAL_CONTENT_BASE_PATH (optional, dev 允许 WebDAV-only)
 *
 * Script behaviour:
 *   - Reuses the ContentSourceManager singleton.
 *   - Registers local + WebDAV sources (if available).
 *   - Runs incremental sync (isFullSync = false).
 *   - Prints overall stats and how many WebDAV items were actually changed.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  getContentSourceManager,
  LocalContentSource,
  WebDAVContentSource,
} from "../src/lib/content-sources";
import { initializeDB } from "../src/lib/db";
import { isWebDAVEnabled } from "../src/lib/webdav";

type SupportedEnv = "dev" | "test";

interface ScriptOptions {
  targetEnv: SupportedEnv;
  localBase?: string;
}

function expectEnv(name: string, label: SupportedEnv): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`(${label}) 环境变量 ${name} 未设置，请先导出再运行增量同步脚本。`);
  }
  return value.trim();
}

/**
 * 从 .env.local 读取必要变量（如果进程中尚未设置）。
 * 与 scripts/trigger-sync.ts 保持一致的加载策略。
 */
async function loadDotEnvLocalIfPresent() {
  try {
    const neededKeys = [
      "WEBDAV_URL",
      "WEBDAV_USERNAME",
      "WEBDAV_PASSWORD",
      "WEBDAV_BLOG_PATH",
      "WEBDAV_PROJECTS_PATH",
      "WEBDAV_MEMOS_PATH",
      "LOCAL_CONTENT_BASE_PATH",
      "DB_PATH",
    ];
    const missing = neededKeys.filter((k) => !process.env[k]);
    if (missing.length === 0) return;

    let content = "";
    try {
      content = await readFile(".env.local", "utf8");
    } catch {
      return;
    }

    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      if (!process.env[key] && value.length > 0) {
        const unquoted = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
        process.env[key] = unquoted;
      }
    }
  } catch {
    // ignore parse errors
  }
}

function parseEnv(): ScriptOptions {
  const envArg = (process.env.SYNC_ENV || "dev").toLowerCase();
  const targetEnv: SupportedEnv = envArg === "test" ? "test" : "dev";
  const localBase = process.env.LOCAL_CONTENT_BASE_PATH?.trim();
  return { targetEnv, localBase: localBase && localBase.length > 0 ? localBase : undefined };
}

async function registerLocalSource(
  manager: ReturnType<typeof getContentSourceManager>,
  basePath?: string
) {
  if (!basePath || basePath.trim().length === 0) {
    console.log("ℹ️ 未提供 LOCAL_CONTENT_BASE_PATH，跳过本地内容源注册（WebDAV-only 模式）");
    return;
  }

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

  const existing = manager.getSource("webdav");
  if (existing) {
    console.log("ℹ️ WebDAV 内容源已存在，跳过重新注册");
    return;
  }

  const webdavConfig = WebDAVContentSource.createDefaultConfig("webdav", 200);
  const webdavSource = new WebDAVContentSource(webdavConfig);
  await manager.registerSource(webdavSource);
  console.log(`✅ WebDAV 内容源已注册: ${process.env.WEBDAV_URL}`);
}

async function main() {
  await loadDotEnvLocalIfPresent();

  const { targetEnv, localBase } = parseEnv();
  const dbPath = expectEnv("DB_PATH", targetEnv);

  if (!isWebDAVEnabled()) {
    throw new Error(`(${targetEnv}) 环境变量 WEBDAV_URL 未设置，无法进行 WebDAV 增量同步。`);
  }

  console.log(`🔧 增量同步环境: ${targetEnv}`);
  console.log(`📁 使用数据库: ${dbPath}`);
  if (localBase) {
    console.log(`📂 本地内容目录: ${localBase}`);
  } else {
    console.log("📂 本地内容目录: (未设置，跳过本地内容源)");
  }
  console.log(`🌐 WebDAV: ${process.env.WEBDAV_URL}`);

  await initializeDB(false);

  const manager = getContentSourceManager({
    maxConcurrentSyncs: 2,
    syncTimeout: 120_000,
    enableTransactions: true,
    conflictResolution: "priority",
  });

  await registerLocalSource(manager, localBase);
  await registerWebDAVSource(manager);

  console.log("🚀 开始执行增量同步 (local + WebDAV)...");
  const startTime = Date.now();
  const result = await manager.syncAll(false);
  const durationMs = Date.now() - startTime;

  console.log("📊 增量同步结果:");
  console.log(`  ✅ success: ${result.success}`);
  console.log(`  ➕ created: ${result.stats.created}`);
  console.log(`  🔄 updated: ${result.stats.updated}`);
  console.log(`  ➖ deleted: ${result.stats.deleted}`);
  console.log(`  ⏭ skipped: ${result.stats.skipped}`);
  console.log(`  📝 processed: ${result.stats.totalProcessed}`);
  console.log(`  ⏱  duration: ${durationMs} ms`);

  // 通过同步日志估算本次 WebDAV 实际命中的变更条数
  const logs = await manager.getSyncLogs(5000);
  const recentLogs = logs.filter((log) => Number(log.createdAt) >= startTime);

  const webdavChangeLogs = recentLogs.filter((log) => {
    const l = log as unknown as {
      sourceName?: string;
      message?: string;
    };
    if (l.sourceName !== "webdav" || typeof l.message !== "string") return false;
    return l.message.startsWith("✅ 创建内容:") || l.message.startsWith("🔄 更新内容:");
  });

  console.log(`🌐 WebDAV 命中变更: ${webdavChangeLogs.length} 条`);

  if (result.errors.length > 0) {
    console.error("❌ 增量同步出现错误:");
    for (const err of result.errors) {
      console.error(
        `  - [${err.source}] ${err.message}${err.filePath ? ` (file: ${err.filePath})` : ""}`
      );
    }
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  // eslint-disable-next-line unicorn/prefer-top-level-await
  main().catch((err) => {
    console.error("增量同步失败:", err);
    process.exit(1);
  });
}
