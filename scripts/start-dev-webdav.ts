#!/usr/bin/env bun

/**
 * 开发环境 WebDAV 服务器启动脚本
 * 使用 dufs 提供可靠的 WebDAV 服务
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { resolveDevWebdavConfig } from "@/lib/dev-webdav-config";

// 开发环境 WebDAV 配置
const DEV_WEBDAV_CONFIG = {
  ...resolveDevWebdavConfig(process.env),
  maxPortTries: 5,
};

// 开发环境 WebDAV 服务器管理器
class DevWebDAVServer {
  private dufsProcess: any = null;
  private port: number;
  private host: string;
  private rootPath: string;
  private strict: boolean;
  private configSource: string;

  constructor(config: typeof DEV_WEBDAV_CONFIG) {
    this.port = config.port;
    this.host = config.host;
    this.rootPath = config.rootPath;
    this.strict = config.strict;
    this.configSource = config.source;
  }

  // 检查端口是否可用
  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      // 使用 fetch 测试端口是否被占用
      const _response = await fetch(`http://${this.host}:${port}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(1000),
      });
      // 如果能连接，说明端口被占用
      return false;
    } catch {
      // 如果连接失败，说明端口可用
      return true;
    }
  }

  // 找到可用端口
  private async findAvailablePort(): Promise<number> {
    if (this.strict) {
      const available = await this.isPortAvailable(this.port);
      if (!available) {
        throw new Error(
          `WebDAV port ${this.port} is not available (configured via ${this.configSource}). ` +
            "Pick another port or stop the process using it."
        );
      }
      return this.port;
    }

    for (let i = 0; i < DEV_WEBDAV_CONFIG.maxPortTries; i++) {
      const testPort = this.port + i;
      if (await this.isPortAvailable(testPort)) {
        return testPort;
      }
    }
    throw new Error(
      `无法找到可用端口 (尝试了 ${this.port} 到 ${this.port + DEV_WEBDAV_CONFIG.maxPortTries - 1})`
    );
  }

  // 确保数据目录存在
  private ensureDataDirectory(): void {
    if (!existsSync(this.rootPath)) {
      console.log(`📁 创建开发数据目录: ${this.rootPath}`);
      mkdirSync(this.rootPath, { recursive: true });

      // 创建基本的目录结构
      const memosDir = join(this.rootPath, "memos");
      const assetsDir = join(this.rootPath, "assets");

      if (!existsSync(memosDir)) {
        mkdirSync(memosDir, { recursive: true });
        console.log(`📁 创建闪念目录: ${memosDir}`);
      }

      if (!existsSync(assetsDir)) {
        mkdirSync(assetsDir, { recursive: true });
        console.log(`📁 创建资源目录: ${assetsDir}`);
      }
    }
  }

  // 启动 dufs 服务器
  async start(): Promise<void> {
    try {
      // 确保数据目录存在
      this.ensureDataDirectory();

      // 找到可用端口
      this.port = await this.findAvailablePort();

      console.log("🚀 启动开发环境 WebDAV 服务器 (dufs)...");

      // 启动 dufs 进程
      return new Promise((resolve, reject) => {
        this.dufsProcess = spawn(
          "dufs",
          [
            this.rootPath, // 服务目录
            "--port",
            this.port.toString(), // 端口
            "--allow-all", // 允许所有操作
            "--enable-cors", // 启用 CORS
            "--log-format",
            "combined", // 日志格式
          ],
          {
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        let dufsReady = false;
        const timeout = setTimeout(() => {
          if (!dufsReady) {
            reject(new Error("dufs 服务器启动超时"));
          }
        }, 30000); // 30秒超时

        this.dufsProcess.stdout.on("data", (data: Buffer) => {
          const output = data.toString();
          console.log(`[dufs] ${output.trim()}`);

          // 检查 dufs 是否已启动
          if (output.includes("Listening on") || output.includes(`${this.host}:${this.port}`)) {
            dufsReady = true;
            clearTimeout(timeout);

            console.log(`✅ 开发环境 WebDAV 服务器已启动: http://${this.host}:${this.port}`);
            console.log(`📁 服务目录: ${this.rootPath}`);
            console.log(`🔧 功能: 完整的 WebDAV 支持 (上传、下载、删除)`);
            console.log(`🌍 环境变量: WEBDAV_URL=http://${this.host}:${this.port}`);

            // 设置环境变量
            process.env.WEBDAV_URL = `http://${this.host}:${this.port}`;
            process.env.WEBDAV_USERNAME = "";
            process.env.WEBDAV_PASSWORD = "";

            resolve();
          }
        });

        this.dufsProcess.stderr.on("data", (data: Buffer) => {
          const output = data.toString();
          console.error(`[dufs Error] ${output.trim()}`);
        });

        this.dufsProcess.on("error", (error: Error) => {
          clearTimeout(timeout);
          reject(new Error(`dufs 启动失败: ${error.message}`));
        });

        this.dufsProcess.on("exit", (code: number) => {
          if (code !== 0 && !dufsReady) {
            clearTimeout(timeout);
            reject(new Error(`dufs 进程退出，代码: ${code}`));
          }
        });
      });
    } catch (error) {
      console.error("❌ 开发环境 WebDAV 服务器启动失败:", error);
      throw error;
    }
  }

  // 验证服务器
  async verify(): Promise<void> {
    try {
      // 尝试多个地址进行验证
      const addresses = ["127.0.0.1", "localhost"];
      let verified = false;

      for (const addr of addresses) {
        try {
          const response = await fetch(`http://${addr}:${this.port}/`);
          if (response.ok) {
            console.log(`✅ WebDAV 服务器验证成功 (${addr}:${this.port})`);
            verified = true;
            break;
          }
        } catch {
          // 继续尝试下一个地址
        }
      }

      if (!verified) {
        throw new Error("所有地址验证都失败");
      }
    } catch (error) {
      console.error("❌ WebDAV 服务器验证失败:", error);
      throw error;
    }
  }

  // 停止服务器
  stop(): void {
    if (this.dufsProcess) {
      console.log("👋 正在关闭开发环境 WebDAV 服务器...");
      this.dufsProcess.kill("SIGTERM");
      this.dufsProcess = null;
    }
  }

  // 设置优雅关闭
  setupGracefulShutdown(): void {
    const shutdown = () => {
      this.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("uncaughtException", (error) => {
      console.error("❌ 未捕获异常:", error);
      shutdown();
    });
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
开发环境 WebDAV 服务器 (dufs)

用法:
  bun run webdav:dev              启动开发环境 WebDAV 服务器
  bun run webdav:dev --help       显示帮助信息

配置:
  端口: ${DEV_WEBDAV_CONFIG.port} (${DEV_WEBDAV_CONFIG.strict ? "strict (no fallback)" : "auto fallback"})
  主机: ${DEV_WEBDAV_CONFIG.host}
  根目录: ${DEV_WEBDAV_CONFIG.rootPath}

环境变量:
  - WEBDAV_URL=http://localhost:<port>   固定端口（strict；端口占用会直接失败）
  - WEBDAV_PORT=<port> / DAV_PORT=<port> 固定端口（strict；端口占用会直接失败）

特性:
  - 使用 dufs 提供完整的 WebDAV 支持
  - 支持文件上传、下载、删除
  - 启用 CORS 支持
  - 与测试环境数据隔离
`);
    return;
  }

  try {
    const server = new DevWebDAVServer(DEV_WEBDAV_CONFIG);

    // 设置优雅关闭
    server.setupGracefulShutdown();

    // 启动服务器
    await server.start();

    // 验证服务器
    await server.verify();

    console.log("\n🎉 开发环境 WebDAV 服务器启动完成！");
    console.log("按 Ctrl+C 停止服务器");

    // 保持进程运行
    await new Promise(() => {
      // 无限等待，直到进程被终止
    });
  } catch (error) {
    console.error("❌ 启动失败:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch(console.error);
}
