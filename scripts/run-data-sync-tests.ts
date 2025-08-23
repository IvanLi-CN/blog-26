#!/usr/bin/env bun

/**
 * 数据同步管理页面测试运行脚本
 *
 * 提供便捷的测试运行命令，支持不同的测试模式和配置
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

interface TestOptions {
  headless?: boolean;
  debug?: boolean;
  reporter?: string;
  grep?: string;
  workers?: number;
  retries?: number;
}

class DataSyncTestRunner {
  private projectRoot: string;
  private playwrightConfig: string;

  constructor() {
    this.projectRoot = process.cwd();
    this.playwrightConfig = join(this.projectRoot, "playwright.config.ts");
  }

  /**
   * 验证测试环境
   */
  private validateEnvironment(): boolean {
    // 检查 Playwright 配置文件
    if (!existsSync(this.playwrightConfig)) {
      console.error("❌ 未找到 Playwright 配置文件:", this.playwrightConfig);
      return false;
    }

    // 检查测试文件
    const testFiles = [
      "e2e/admin-data-sync.spec.ts",
      "e2e/admin-data-sync-auth.spec.ts",
      "e2e/admin-data-sync-edge-cases.spec.ts",
    ];

    for (const testFile of testFiles) {
      const fullPath = join(this.projectRoot, testFile);
      if (!existsSync(fullPath)) {
        console.error("❌ 未找到测试文件:", fullPath);
        return false;
      }
    }

    console.log("✅ 测试环境验证通过");
    return true;
  }

  /**
   * 运行所有数据同步相关测试
   */
  async runAllTests(options: TestOptions = {}): Promise<boolean> {
    console.log("🚀 开始运行数据同步管理页面测试...");

    if (!this.validateEnvironment()) {
      return false;
    }

    const args = this.buildPlaywrightArgs(options);
    args.push("e2e/admin-data-sync*.spec.ts");

    return this.executePlaywright(args);
  }

  /**
   * 运行基础功能测试
   */
  async runBasicTests(options: TestOptions = {}): Promise<boolean> {
    console.log("🧪 运行基础功能测试...");

    const args = this.buildPlaywrightArgs(options);
    args.push("e2e/admin-data-sync.spec.ts");

    return this.executePlaywright(args);
  }

  /**
   * 运行权限验证测试
   */
  async runAuthTests(options: TestOptions = {}): Promise<boolean> {
    console.log("🔐 运行权限验证测试...");

    const args = this.buildPlaywrightArgs(options);
    args.push("e2e/admin-data-sync-auth.spec.ts");

    return this.executePlaywright(args);
  }

  /**
   * 运行边界情况测试
   */
  async runEdgeCaseTests(options: TestOptions = {}): Promise<boolean> {
    console.log("🎯 运行边界情况测试...");

    const args = this.buildPlaywrightArgs(options);
    args.push("e2e/admin-data-sync-edge-cases.spec.ts");

    return this.executePlaywright(args);
  }

  /**
   * 构建 Playwright 命令行参数
   */
  private buildPlaywrightArgs(options: TestOptions): string[] {
    const args = ["test"];

    // 配置文件
    args.push("--config", this.playwrightConfig);

    // 无头模式
    if (options.headless !== false) {
      args.push("--headed");
    }

    // 调试模式
    if (options.debug) {
      args.push("--debug");
    }

    // 报告器
    if (options.reporter) {
      args.push("--reporter", options.reporter);
    }

    // 测试过滤
    if (options.grep) {
      args.push("--grep", options.grep);
    }

    // 工作进程数
    if (options.workers) {
      args.push("--workers", options.workers.toString());
    }

    // 重试次数
    if (options.retries !== undefined) {
      args.push("--retries", options.retries.toString());
    }

    return args;
  }

  /**
   * 执行 Playwright 测试
   */
  private executePlaywright(args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      console.log("📋 执行命令:", `npx playwright ${args.join(" ")}`);

      const childProcess = spawn("npx", ["playwright", ...args], {
        stdio: "inherit",
        cwd: this.projectRoot,
        env: {
          ...process.env,
          NODE_ENV: "test",
          ADMIN_MODE: "true",
        },
      });

      childProcess.on("close", (code) => {
        if (code === 0) {
          console.log("✅ 测试执行成功");
          resolve(true);
        } else {
          console.log(`❌ 测试执行失败，退出码: ${code}`);
          resolve(false);
        }
      });

      childProcess.on("error", (error) => {
        console.error("❌ 测试进程启动失败:", error);
        resolve(false);
      });
    });
  }

  /**
   * 显示帮助信息
   */
  showHelp(): void {
    console.log(`
🧪 数据同步管理页面测试运行器

用法:
  bun run scripts/run-data-sync-tests.ts [命令] [选项]

命令:
  all        运行所有数据同步相关测试 (默认)
  basic      运行基础功能测试
  auth       运行权限验证测试
  edge       运行边界情况测试
  help       显示此帮助信息

选项:
  --headed           显示浏览器界面 (默认)
  --headless         无头模式运行
  --debug            调试模式
  --reporter <type>  指定报告器 (html, json, line)
  --grep <pattern>   过滤测试用例
  --workers <num>    指定工作进程数
  --retries <num>    指定重试次数

示例:
  bun run scripts/run-data-sync-tests.ts
  bun run scripts/run-data-sync-tests.ts basic --headless
  bun run scripts/run-data-sync-tests.ts auth --debug
  bun run scripts/run-data-sync-tests.ts edge --grep "网络"
    `);
  }
}

// 主函数
async function main() {
  const runner = new DataSyncTestRunner();
  const args = process.argv.slice(2);

  // 解析命令和选项
  const command = args[0] || "all";
  const options: TestOptions = {};

  // 解析选项
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--headless":
        options.headless = true;
        break;
      case "--headed":
        options.headless = false;
        break;
      case "--debug":
        options.debug = true;
        break;
      case "--reporter":
        options.reporter = args[++i];
        break;
      case "--grep":
        options.grep = args[++i];
        break;
      case "--workers":
        options.workers = parseInt(args[++i]);
        break;
      case "--retries":
        options.retries = parseInt(args[++i]);
        break;
    }
  }

  // 执行命令
  let success = false;

  switch (command) {
    case "all":
      success = await runner.runAllTests(options);
      break;
    case "basic":
      success = await runner.runBasicTests(options);
      break;
    case "auth":
      success = await runner.runAuthTests(options);
      break;
    case "edge":
      success = await runner.runEdgeCaseTests(options);
      break;
    case "help":
      runner.showHelp();
      success = true;
      break;
    default:
      console.error(`❌ 未知命令: ${command}`);
      runner.showHelp();
      success = false;
  }

  process.exit(success ? 0 : 1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("脚本执行失败:", error);
    process.exit(1);
  });
}

export { DataSyncTestRunner };
