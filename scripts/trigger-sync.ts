#!/usr/bin/env bun

/**
 * Unified content sync trigger for development and test environments.
 *
 * Usage:
 *   bun ./scripts/trigger-sync.ts dev   # requires DB_PATH and at least one of (LOCAL_CONTENT_BASE_PATH, WEBDAV_URL)
 *   bun ./scripts/trigger-sync.ts test  # requires DB_PATH and at least one of (LOCAL_CONTENT_BASE_PATH, WEBDAV_URL)
 *
 * Required environment variables must be exported by the caller to avoid
 * implicit defaults and keep the workflow reproducible.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseContentSourcesFromEnv } from "../src/config/paths";
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

/**
 * 从项目根目录的 .env.local 加载环境变量（不覆盖已存在的变量）。
 * Bun/Node 脚本默认不会自动读取 .env.local，但本项目在开发/测试阶段
 * 约定将服务端配置写在 .env.local，因此这里做一次轻量解析。
 */
async function loadDotEnvLocalIfPresent() {
  try {
    // 仅在尚未显式设置关键变量时才尝试读取
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
    // Treat empty string as explicitly set to avoid accidentally re-enabling WebDAV in FS-only runs.
    const missing = neededKeys.filter((k) => process.env[k] === undefined);
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
      if (process.env[key] === undefined && value.length > 0) {
        // 去掉包裹引号
        const unquoted = value.replace(/^"|"$/g, "").replace(/^'|'$/g, "");
        process.env[key] = unquoted;
      }
    }
  } catch {
    // ignore parse errors – 不影响后续逻辑
  }
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
  // 优先加载 .env.local（如果未显式导出关键变量）
  await loadDotEnvLocalIfPresent();
  const { targetEnv, opts } = parseArgs();

  const dbPath = expectEnv("DB_PATH", targetEnv);
  const localBase = process.env.LOCAL_CONTENT_BASE_PATH?.trim();
  const allowedSources = parseContentSourcesFromEnv(process.env.CONTENT_SOURCES);
  const requiresLocal = allowedSources ? allowedSources.has("local") : false;
  const requiresWebDAV = allowedSources ? allowedSources.has("webdav") : false;

  if (requiresLocal && (!localBase || localBase.length === 0)) {
    throw new Error(
      `(${targetEnv}) CONTENT_SOURCES 要求 local，但 LOCAL_CONTENT_BASE_PATH 未设置。`
    );
  }
  if (requiresWebDAV && !isWebDAVEnabled()) {
    throw new Error(`(${targetEnv}) CONTENT_SOURCES 要求 webdav，但 WEBDAV_URL 未设置或已禁用。`);
  }

  const shouldSyncLocal =
    Boolean(localBase) && (allowedSources ? allowedSources.has("local") : true);
  const shouldSyncWebDAV = isWebDAVEnabled();

  if (!shouldSyncLocal && !shouldSyncWebDAV) {
    throw new Error(
      `(${targetEnv}) 未启用任何内容源：请配置 LOCAL_CONTENT_BASE_PATH 或 WEBDAV_URL（或调整 CONTENT_SOURCES）。`
    );
  }

  console.log(`🔧 同步环境: ${targetEnv}`);
  console.log(`📁 使用数据库: ${dbPath}`);
  console.log(`📋 CONTENT_SOURCES: ${process.env.CONTENT_SOURCES || "(未设置，自动检测)"}`);
  console.log(`📂 local: ${shouldSyncLocal ? localBase : "(disabled)"}`);
  console.log(`🌐 webdav: ${shouldSyncWebDAV ? process.env.WEBDAV_URL : "(disabled)"}`);

  await initializeDB(opts.forceReinit);

  const manager = getContentSourceManager(opts);
  if (shouldSyncLocal) {
    await registerLocalSource(manager, localBase);
  }
  if (shouldSyncWebDAV) {
    await registerWebDAVSource(manager);
  }

  console.log(
    `🚀 开始执行全量同步 (${[shouldSyncLocal ? "local" : null, shouldSyncWebDAV ? "webdav" : null]
      .filter(Boolean)
      .join(" + ")})...`
  );
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
