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

      // 2. 运行数据库迁移
      await this.runDatabaseMigration();

      // 2.5. 验证数据库表结构
      await this.verifyDatabaseTables();

      // 3. 生成测试数据
      await this.generateTestData();

      // 4. 启动 WebDAV 服务器
      await this.startWebDAVServer();

      // 5. 启动 Next.js 服务器
      await this.startNextJSServer();

      // 6. 等待服务器就绪
      await this.waitForServersReady();

      // 7. 触发内容同步
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
   * 运行数据库迁移
   */
  private async runDatabaseMigration(): Promise<void> {
    console.log("🗄️ 运行数据库迁移...");
    console.log(`📁 目标数据库路径: ${this.testDbPath}`);

    return new Promise((resolve, reject) => {
      const migrateProcess = spawn("bun", ["run", "migrate"], {
        stdio: ["inherit", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "test",
          DB_PATH: this.testDbPath,
        },
      });

      let output = "";
      let errorOutput = "";

      migrateProcess.stdout?.on("data", (data) => {
        const text = data.toString();
        output += text;
        console.log(`[迁移] ${text.trim()}`);
      });

      migrateProcess.stderr?.on("data", (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`[迁移错误] ${text.trim()}`);
      });

      migrateProcess.on("close", (code) => {
        if (code === 0) {
          console.log("  ✅ 数据库迁移完成");
          console.log(`📊 迁移输出长度: ${output.length} 字符`);
          resolve();
        } else {
          console.error(`❌ 数据库迁移失败，退出码: ${code}`);
          console.error(`📋 标准输出: ${output}`);
          console.error(`📋 错误输出: ${errorOutput}`);
          reject(
            new Error(`数据库迁移失败，退出码: ${code}\n输出: ${output}\n错误: ${errorOutput}`)
          );
        }
      });

      migrateProcess.on("error", (error) => {
        console.error("❌ 迁移进程启动失败:", error);
        reject(new Error(`迁移进程启动失败: ${error.message}`));
      });
    });
  }

  /**
   * 验证数据库表结构
   */
  private async verifyDatabaseTables(): Promise<void> {
    console.log("🔍 验证数据库表结构...");

    const { Database } = await import("bun:sqlite");
    const sqlite = new Database(this.testDbPath);

    try {
      // 检查数据库文件状态
      const fs = await import("node:fs");
      const dbStats = fs.statSync(this.testDbPath);
      console.log(`📊 数据库文件路径: ${this.testDbPath}`);
      console.log(`📊 数据库文件大小: ${dbStats.size} bytes`);

      // 获取所有现有表
      const allTables = sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[];

      console.log(`📋 数据库中的所有表: ${allTables.map((t) => t.name).join(", ") || "无表"}`);

      // 检查关键表是否存在
      const requiredTables = [
        "content_sync_logs",
        "content_sync_status",
        "posts",
        "comments",
        "users",
      ];

      const missingTables: string[] = [];
      const existingTables: string[] = [];

      for (const tableName of requiredTables) {
        const result = sqlite
          .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
          .get(tableName);

        if (!result) {
          missingTables.push(tableName);
        } else {
          existingTables.push(tableName);
        }
      }

      console.log(`✅ 已存在的必需表: ${existingTables.join(", ") || "无"}`);

      if (missingTables.length > 0) {
        console.log(`⚠️  发现缺失的表: ${missingTables.join(", ")}`);
        console.log("🔧 正在创建缺失的表...");

        // 创建缺失的表
        await this.createMissingTables(sqlite, missingTables);

        // 再次检查创建结果
        const recheckTables = sqlite
          .query("SELECT name FROM sqlite_master WHERE type='table'")
          .all() as { name: string }[];
        console.log(`📋 创建表后的所有表: ${recheckTables.map((t) => t.name).join(", ")}`);
        console.log("✅ 缺失的表已创建");
      } else {
        console.log("✅ 所有必需的表都存在");
      }

      // 验证关键表的结构
      await this.validateTableStructures(sqlite);
    } catch (error) {
      console.error("❌ 数据库表验证失败:", error);
      console.error("错误详情:", error instanceof Error ? error.stack : "无堆栈信息");
      throw error;
    } finally {
      sqlite.close();
    }
  }

  /**
   * 创建缺失的数据库表
   */
  private async createMissingTables(sqlite: any, missingTables: string[]): Promise<void> {
    const tableCreationSQL: Record<string, string> = {
      content_sync_logs: `
        CREATE TABLE content_sync_logs (
          id text PRIMARY KEY NOT NULL,
          source_type text NOT NULL,
          source_name text NOT NULL,
          operation text NOT NULL,
          status text NOT NULL,
          message text NOT NULL,
          file_path text,
          data text,
          created_at integer NOT NULL
        )
      `,
      content_sync_status: `
        CREATE TABLE content_sync_status (
          source_type text PRIMARY KEY NOT NULL,
          source_name text NOT NULL,
          last_sync_at integer,
          status text DEFAULT 'idle' NOT NULL,
          progress integer DEFAULT 0 NOT NULL,
          current_step text,
          total_items integer DEFAULT 0 NOT NULL,
          processed_items integer DEFAULT 0 NOT NULL,
          error_message text,
          metadata text,
          updated_at integer NOT NULL
        )
      `,
      posts: `
        CREATE TABLE posts (
          id text PRIMARY KEY NOT NULL,
          slug text NOT NULL,
          type text NOT NULL,
          title text NOT NULL,
          excerpt text,
          body text NOT NULL,
          publish_date integer NOT NULL,
          update_date integer,
          draft integer DEFAULT false NOT NULL,
          public integer DEFAULT false NOT NULL,
          category text,
          tags text,
          author text,
          image text,
          metadata text,
          data_source text,
          content_hash text NOT NULL,
          last_modified integer NOT NULL,
          source text NOT NULL,
          file_path text NOT NULL
        )
      `,
      comments: `
        CREATE TABLE comments (
          id text PRIMARY KEY NOT NULL,
          content text NOT NULL,
          post_slug text NOT NULL,
          author_name text NOT NULL,
          author_email text NOT NULL,
          parent_id text,
          status text DEFAULT 'pending' NOT NULL,
          created_at integer NOT NULL
        )
      `,
      users: `
        CREATE TABLE users (
          id text PRIMARY KEY NOT NULL,
          email text NOT NULL UNIQUE,
          name text,
          created_at integer NOT NULL
        )
      `,
    };

    for (const tableName of missingTables) {
      if (tableCreationSQL[tableName]) {
        console.log(`  📝 创建表: ${tableName}`);
        sqlite.exec(tableCreationSQL[tableName]);
      } else {
        console.warn(`⚠️  未找到表 ${tableName} 的创建SQL`);
      }
    }
  }

  /**
   * 验证表结构
   */
  private async validateTableStructures(sqlite: any): Promise<void> {
    // 验证 content_sync_logs 表的关键字段
    const syncLogsColumns = sqlite.query("PRAGMA table_info(content_sync_logs)").all();
    const requiredSyncLogsColumns = [
      "id",
      "source_type",
      "source_name",
      "operation",
      "status",
      "message",
      "created_at",
    ];

    for (const requiredColumn of requiredSyncLogsColumns) {
      const columnExists = syncLogsColumns.some((col: any) => col.name === requiredColumn);
      if (!columnExists) {
        throw new Error(`content_sync_logs 表缺少必需字段: ${requiredColumn}`);
      }
    }

    console.log("  ✅ content_sync_logs 表结构验证通过");
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

    // 在内容同步前强制验证关键表
    await this.ensureCriticalTablesExist();

    // 强制重新初始化数据库连接以确保一致性
    await this.reinitializeDatabase();

    const syncTrigger = new TestContentSyncTrigger({ verbose: false });
    const success = await syncTrigger.triggerSync();

    if (!success) {
      throw new Error("内容同步失败");
    }

    console.log("  ✅ 内容同步完成");
  }

  /**
   * 确保关键表存在（内容同步前的最后检查）
   */
  private async ensureCriticalTablesExist(): Promise<void> {
    console.log("🔍 内容同步前最后检查关键表...");

    const { Database } = await import("bun:sqlite");
    const sqlite = new Database(this.testDbPath);

    try {
      // 检查数据库文件状态
      const dbStats = await import("node:fs").then((fs) => fs.statSync(this.testDbPath));
      console.log(`📊 数据库文件大小: ${dbStats.size} bytes`);

      // 获取所有现有表
      const existingTables = sqlite
        .query("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];

      console.log(`📋 现有表: ${existingTables.map((t) => t.name).join(", ")}`);

      // 检查关键表
      const criticalTables = ["content_sync_logs", "content_sync_status"];
      const missingTables: string[] = [];

      for (const tableName of criticalTables) {
        const exists = existingTables.some((t) => t.name === tableName);
        if (!exists) {
          missingTables.push(tableName);
        }
      }

      if (missingTables.length > 0) {
        console.log(`⚠️  关键表缺失: ${missingTables.join(", ")}`);
        console.log("🔧 立即创建缺失的关键表...");

        await this.createMissingTables(sqlite, missingTables);

        // 再次验证
        const recheck = sqlite.query("SELECT name FROM sqlite_master WHERE type='table'").all() as {
          name: string;
        }[];
        console.log(`✅ 创建后的表: ${recheck.map((t) => t.name).join(", ")}`);
      } else {
        console.log("✅ 所有关键表都存在");
      }
    } catch (error) {
      console.error("❌ 关键表检查失败:", error);
      throw error;
    } finally {
      sqlite.close();
    }
  }

  /**
   * 重新初始化数据库连接以确保一致性
   */
  private async reinitializeDatabase(): Promise<void> {
    console.log("🔄 重新初始化数据库连接...");

    try {
      // 设置正确的数据库路径环境变量
      process.env.DB_PATH = this.testDbPath;
      console.log(`📁 设置数据库路径: ${this.testDbPath}`);

      // 创建一个新的数据库连接来验证路径正确性
      const { Database } = await import("bun:sqlite");
      const testSqlite = new Database(this.testDbPath);

      try {
        // 验证数据库文件可以正常访问
        testSqlite.query("SELECT 1 as test").get();
        console.log("✅ 数据库文件访问验证成功");

        // 验证关键表是否存在
        const tables = testSqlite
          .query("SELECT name FROM sqlite_master WHERE type='table'")
          .all() as { name: string }[];

        const criticalTables = ["content_sync_logs", "content_sync_status"];
        const missingTables = criticalTables.filter(
          (tableName) => !tables.some((t) => t.name === tableName)
        );

        if (missingTables.length > 0) {
          console.log(`⚠️  数据库连接验证发现缺失表: ${missingTables.join(", ")}`);
          // 这里不抛出错误，让后续的表创建逻辑处理
        } else {
          console.log("✅ 所有关键表都存在于数据库中");
        }
      } finally {
        testSqlite.close();
      }

      console.log("✅ 数据库连接一致性验证完成");
    } catch (error) {
      console.error("❌ 数据库重新初始化失败:", error);
      throw error;
    }
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
