#!/usr/bin/env bun

/**
 * E2E 测试环境服务器启动脚本
 *
 * 集成完整的测试环境启动流程：
 * 1. 清理测试环境
 * 2. 生成测试数据
 * 3. 启动 WebDAV 服务器
 * 4. 启动 Next.js 服务器
 * 5. 触发内容同步
 * 6. 等待服务就绪
 */

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { TestContentSyncTrigger } from "./trigger-test-sync";

interface ServerProcess {
  name: string;
  process: ChildProcess;
  port: number;
  ready: boolean;
}

class E2EServerManager {
  private servers: ServerProcess[] = [];
  private testDataPath = join(process.cwd(), "test-data");
  private testDbPath = join(process.cwd(), "test.db");

  /**
   * 启动完整的 E2E 测试环境
   */
  async startE2EEnvironment(): Promise<boolean> {
    try {
      console.log("🚀 启动 E2E 测试环境...");

      // 1. 清理测试环境
      await this.cleanupTestEnvironment();

      // 2. 生成测试数据
      await this.generateTestData();

      // 3. 启动 WebDAV 服务器
      await this.startWebDAVServer();

      // 4. 启动 Next.js 服务器
      await this.startNextJSServer();

      // 5. 等待服务器就绪
      await this.waitForServersReady();

      // 6. 触发内容同步
      await this.triggerContentSync();

      console.log("🎉 E2E 测试环境启动完成！");
      console.log("📍 服务地址:");
      console.log("  - Next.js: http://localhost:3000");
      console.log("  - WebDAV: http://localhost:8080");

      return true;
    } catch (error) {
      console.error("❌ E2E 测试环境启动失败:", error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * 清理测试环境
   */
  private async cleanupTestEnvironment(): Promise<void> {
    console.log("🧹 清理测试环境...");

    // 清理测试数据目录
    if (existsSync(this.testDataPath)) {
      rmSync(this.testDataPath, { recursive: true, force: true });
      console.log("  ✅ 清理测试数据目录");
    }

    // 清理测试数据库
    if (existsSync(this.testDbPath)) {
      rmSync(this.testDbPath, { force: true });
      console.log("  ✅ 清理测试数据库");
    }

    // 停止可能存在的服务器进程
    await this.killExistingServers();
  }

  /**
   * 生成测试数据
   */
  private async generateTestData(): Promise<void> {
    console.log("📝 生成测试数据...");

    return new Promise((resolve, reject) => {
      const generateProcess = spawn("bun", ["./scripts/generate-test-data.ts"], {
        stdio: ["inherit", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "test" },
      });

      let _output = "";
      generateProcess.stdout?.on("data", (data) => {
        _output += data.toString();
      });

      generateProcess.stderr?.on("data", (data) => {
        console.error(data.toString());
      });

      generateProcess.on("close", (code) => {
        if (code === 0) {
          console.log("  ✅ 测试数据生成完成");
          resolve();
        } else {
          reject(new Error(`测试数据生成失败，退出码: ${code}`));
        }
      });
    });
  }

  /**
   * 启动 WebDAV 服务器
   */
  private async startWebDAVServer(): Promise<void> {
    console.log("🌐 启动 WebDAV 服务器...");

    return new Promise((resolve, reject) => {
      const webdavProcess = spawn("bun", ["./scripts/start-test-webdav-dufs.ts"], {
        stdio: ["inherit", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "test" },
      });

      this.servers.push({
        name: "WebDAV",
        process: webdavProcess,
        port: 8080,
        ready: false,
      });

      let _output = "";
      webdavProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        _output += text;

        // 检查 WebDAV 服务器是否启动成功
        if (
          text.includes("🎉 测试环境 WebDAV 服务器启动完成") ||
          text.includes("✅ 测试环境 WebDAV 服务器已启动")
        ) {
          const webdavServer = this.servers.find((s) => s.name === "WebDAV");
          if (webdavServer) {
            webdavServer.ready = true;
          }
          console.log("  ✅ WebDAV 服务器启动成功");
          resolve();
        }
      });

      webdavProcess.stderr?.on("data", (data) => {
        console.error(data.toString());
      });

      webdavProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`WebDAV 服务器启动失败，退出码: ${code}`));
        }
      });

      // 超时处理
      setTimeout(() => {
        if (!this.servers.find((s) => s.name === "WebDAV")?.ready) {
          reject(new Error("WebDAV 服务器启动超时"));
        }
      }, 30000);
    });
  }

  /**
   * 启动 Next.js 服务器
   */
  private async startNextJSServer(): Promise<void> {
    console.log("⚡ 启动 Next.js 服务器...");

    return new Promise((resolve, reject) => {
      const nextProcess = spawn("bun", ["--bun", "next", "dev", "--turbopack"], {
        stdio: ["inherit", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "test",
          ADMIN_MODE: "true",
          WEBDAV_URL: "http://localhost:8080",
        },
      });

      this.servers.push({
        name: "Next.js",
        process: nextProcess,
        port: 3000,
        ready: false,
      });

      let _output = "";
      nextProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        _output += text;

        // 检查 Next.js 服务器是否启动成功
        if (text.includes("Ready in") || text.includes("✓ Ready")) {
          const nextServer = this.servers.find((s) => s.name === "Next.js");
          if (nextServer) {
            nextServer.ready = true;
          }
          console.log("  ✅ Next.js 服务器启动成功");
          resolve();
        }
      });

      nextProcess.stderr?.on("data", (data) => {
        console.error(data.toString());
      });

      nextProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Next.js 服务器启动失败，退出码: ${code}`));
        }
      });

      // 超时处理
      setTimeout(() => {
        if (!this.servers.find((s) => s.name === "Next.js")?.ready) {
          reject(new Error("Next.js 服务器启动超时"));
        }
      }, 60000);
    });
  }

  /**
   * 等待所有服务器就绪
   */
  private async waitForServersReady(): Promise<void> {
    console.log("⏳ 等待服务器就绪...");

    // 等待所有服务器标记为就绪
    const maxWait = 30000; // 30秒
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const allReady = this.servers.every((server) => server.ready);
      if (allReady) {
        console.log("  ✅ 所有服务器已就绪");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("等待服务器就绪超时");
  }

  /**
   * 触发内容同步
   */
  private async triggerContentSync(): Promise<void> {
    console.log("🔄 触发内容同步...");

    const syncTrigger = new TestContentSyncTrigger({ verbose: false });
    const success = await syncTrigger.triggerSync();

    if (!success) {
      throw new Error("内容同步失败");
    }

    console.log("  ✅ 内容同步完成");
  }

  /**
   * 停止现有的服务器进程
   */
  private async killExistingServers(): Promise<void> {
    try {
      // 停止可能占用端口的进程
      const ports = [3000, 8080];
      for (const port of ports) {
        spawn("lsof", ["-ti", `:${port}`], { stdio: "pipe" }).stdout?.on("data", (data) => {
          const pids = data.toString().trim().split("\n");
          for (const pid of pids) {
            if (pid) {
              spawn("kill", ["-9", pid]);
            }
          }
        });
      }
    } catch (_error) {
      // 忽略错误，可能没有进程在运行
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    console.log("🧹 清理服务器进程...");

    for (const server of this.servers) {
      try {
        server.process.kill("SIGTERM");
        console.log(`  ✅ 停止 ${server.name} 服务器`);
      } catch (error) {
        console.warn(`  ⚠️ 停止 ${server.name} 服务器失败:`, error);
      }
    }

    this.servers = [];
  }
}

// 主函数
async function main() {
  const manager = new E2EServerManager();

  // 处理进程退出信号
  process.on("SIGINT", async () => {
    console.log("\n🛑 收到退出信号，正在清理...");
    await manager.cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🛑 收到终止信号，正在清理...");
    await manager.cleanup();
    process.exit(0);
  });

  const success = await manager.startE2EEnvironment();

  if (success) {
    console.log("\n🎯 E2E 测试环境已就绪，可以运行测试了！");
    console.log("💡 按 Ctrl+C 停止服务器");

    // 保持进程运行
    process.stdin.resume();
  } else {
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("脚本执行失败:", error);
    process.exit(1);
  });
}

export { E2EServerManager };
