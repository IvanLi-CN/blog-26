#!/usr/bin/env bun

/**
 * CI工作流测试脚本
 *
 * 模拟GitHub Actions的E2E测试流程，确保本地能正确执行
 */

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

interface StepResult {
  name: string;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

class CIWorkflowTester {
  private results: StepResult[] = [];

  async runStep(name: string, command: string, args: string[] = []): Promise<boolean> {
    console.log(`\n🔄 ${name}...`);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const childProcess = spawn(command, args, {
        stdio: ["inherit", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "test",
          CI: "true",
        },
      });

      let output = "";
      let error = "";

      childProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      childProcess.stderr?.on("data", (data) => {
        const text = data.toString();
        error += text;
        process.stderr.write(text);
      });

      childProcess.on("close", (code) => {
        const duration = Date.now() - startTime;
        const success = code === 0;

        this.results.push({
          name,
          success,
          output: output.trim(),
          error: error.trim(),
          duration,
        });

        if (success) {
          console.log(`✅ ${name} 完成 (${duration}ms)`);
        } else {
          console.log(`❌ ${name} 失败 (${duration}ms)`);
        }

        resolve(success);
      });
    });
  }

  async runWorkflow(): Promise<void> {
    console.log("🚀 开始CI工作流测试...\n");

    // 清理环境
    console.log("🧹 清理测试环境...");
    if (existsSync("sqlite.db")) {
      rmSync("sqlite.db");
      console.log("  ✅ 删除现有数据库");
    }

    const steps = [
      {
        name: "安装依赖",
        command: "bun",
        args: ["install", "--frozen-lockfile"],
      },
      {
        name: "初始化数据库",
        command: "bun",
        args: ["run", "migrate"],
      },
      {
        name: "生成测试内容文件",
        command: "bun",
        args: ["run", "test-data:generate"],
      },
      {
        name: "同步内容源数据",
        command: "bun",
        args: ["run", "test-sync:trigger"],
      },
      {
        name: "验证测试数据",
        command: "bun",
        args: ["run", "db:posts"],
      },
      {
        name: "运行E2E测试",
        command: "bun",
        args: ["run", "test:e2e"],
      },
    ];

    let allSuccess = true;

    for (const step of steps) {
      const success = await this.runStep(step.name, step.command, step.args);
      if (!success) {
        allSuccess = false;
        console.log(`\n❌ 步骤 "${step.name}" 失败，停止执行`);
        break;
      }
    }

    this.printSummary(allSuccess);
  }

  private printSummary(allSuccess: boolean): void {
    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 CI工作流测试总结");
    console.log("=".repeat(60));

    this.results.forEach((result, index) => {
      const status = result.success ? "✅" : "❌";
      const duration = `${result.duration}ms`;
      console.log(`${index + 1}. ${status} ${result.name} (${duration})`);
    });

    console.log(`\n${"=".repeat(60)}`);

    if (allSuccess) {
      console.log("🎉 所有步骤成功！GitHub Actions应该能正常工作。");
    } else {
      console.log("❌ 有步骤失败。需要修复后再提交到GitHub。");

      const failedSteps = this.results.filter((r) => !r.success);
      if (failedSteps.length > 0) {
        console.log("\n失败的步骤:");
        failedSteps.forEach((step) => {
          console.log(`- ${step.name}`);
          if (step.error) {
            console.log(`  错误: ${step.error.substring(0, 200)}...`);
          }
        });
      }
    }

    console.log("=".repeat(60));
  }
}

// 显示帮助信息
function showHelp(): void {
  console.log(`
CI工作流测试脚本

用法:
  bun run scripts/test-ci-workflow.ts [选项]

选项:
  --help, -h       显示此帮助信息

说明:
  此脚本模拟GitHub Actions的E2E测试流程，包括：
  1. 安装依赖
  2. 初始化数据库
  3. 设置E2E测试数据
  4. 验证测试数据
  5. 运行E2E测试

  如果所有步骤都成功，说明GitHub Actions配置正确。
`);
}

// 解析命令行参数
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

// 运行测试
const tester = new CIWorkflowTester();
tester.runWorkflow().catch((error) => {
  console.error("❌ CI工作流测试失败:", error);
  process.exit(1);
});
