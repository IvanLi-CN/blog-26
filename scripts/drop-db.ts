#!/usr/bin/env bun

/**
 * 数据库删除脚本
 *
 * 功能：完全删除数据库文件，用于彻底重置
 *
 * 用法：
 *   bun run drop-db           # 删除数据库文件
 *   bun run drop-db --force   # 强制删除（不询问确认）
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

interface DropOptions {
  force: boolean;
  verbose: boolean;
}

// 解析命令行参数
function parseArgs(): DropOptions {
  const args = process.argv.slice(2);

  return {
    force: args.includes("--force") || args.includes("-f"),
    verbose: args.includes("--verbose") || args.includes("-v"),
  };
}

// 显示帮助信息
function showHelp() {
  console.log(`
数据库删除脚本

用法:
  bun run drop-db [选项]

选项:
  --force, -f        强制删除，不询问确认
  --verbose, -v      显示详细信息
  --help, -h         显示此帮助信息

示例:
  bun run drop-db              # 删除数据库（会询问确认）
  bun run drop-db --force      # 强制删除数据库

注意:
  此操作会完全删除数据库文件，所有数据将丢失！
  建议在删除后运行 'bun run db:reset' 重新创建数据库。
`);
}

// 询问用户确认
function askConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write("⚠️  确定要删除数据库文件吗？所有数据将丢失！(y/N): ");

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (key) => {
      const input = key.toString().toLowerCase().trim();

      process.stdin.setRawMode(false);
      process.stdin.pause();

      console.log(); // 换行

      if (input === "y" || input === "yes") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// 删除数据库文件
async function dropDatabase(options: DropOptions) {
  const dbPath = join(process.cwd(), "sqlite.db");

  if (!existsSync(dbPath)) {
    console.log("ℹ️  数据库文件不存在，无需删除");
    return;
  }

  if (options.verbose) {
    console.log(`📁 数据库路径: ${dbPath}`);
  }

  // 如果不是强制模式，询问确认
  if (!options.force) {
    const confirmed = await askConfirmation();
    if (!confirmed) {
      console.log("❌ 操作已取消");
      return;
    }
  }

  try {
    if (options.verbose) console.log(`🗑️  正在删除: ${dbPath}`);

    rmSync(dbPath);

    console.log("✅ 数据库文件已删除");
    console.log("💡 提示: 运行 'bun run db:reset' 重新创建数据库");
  } catch (error) {
    console.error("❌ 删除数据库文件时出错:", error);
    throw error;
  }
}

// 主函数
async function main() {
  const options = parseArgs();

  // 显示帮助
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    return;
  }

  try {
    await dropDatabase(options);
  } catch (error) {
    console.error("❌ 操作失败:", error);
    process.exit(1);
  }
}

// 运行主函数
if (import.meta.main) {
  main();
}
