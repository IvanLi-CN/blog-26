#!/usr/bin/env bun

/**
 * 数据库 Seed 脚本
 * 用于初始化系统必需的基础数据（用户、配置等）
 *
 * 注意：不包含内容数据（文章、闪念、项目）
 * 内容数据应通过内容同步系统从文件系统获取
 */

import { Database } from "bun:sqlite";
import { like } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, initializeDB } from "../src/lib/db";
import { comments, emailVerificationCodes, users } from "../src/lib/schema";

interface SeedOptions {
  clearExisting: boolean;
  developmentOnly: boolean;
  dataTypes: Array<"users" | "system">;
  verbose: boolean;
}

// 检查表是否存在
async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const DB_PATH = process.env.DB_PATH || "./sqlite.db";
    const sqlite = new Database(DB_PATH);

    const result = sqlite
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(tableName);

    sqlite.close();
    return result !== null;
  } catch (_error) {
    // 如果数据库文件不存在或其他错误，返回 false
    return false;
  }
}

// 解析命令行参数
function parseArgs(): {
  action: "seed" | "clear" | "check";
  options: SeedOptions;
} {
  const args = process.argv.slice(2);

  let action: "seed" | "clear" | "check" = "seed";
  const options: SeedOptions = {
    clearExisting: true,
    developmentOnly: true,
    dataTypes: ["users", "system"],
    verbose: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--clear":
      case "-c":
        action = "clear";
        break;

      case "--check":
        action = "check";
        break;

      case "--no-clear":
        options.clearExisting = false;
        break;

      case "--production":
        options.developmentOnly = false;
        break;

      case "--quiet":
      case "-q":
        options.verbose = false;
        break;

      case "--types":
      case "-t":
        if (i + 1 < args.length) {
          const types = args[i + 1].split(",").map((t) => t.trim());
          options.dataTypes = types.filter((t) => ["users", "system"].includes(t)) as Array<
            "users" | "system"
          >;
          i++; // 跳过下一个参数
        }
        break;

      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }

  return { action, options };
}

// 打印帮助信息
function printHelp(): void {
  console.log(`
数据库 Seed 脚本

用法:
  bun run seed [选项]

动作:
  (默认)           执行 seed 操作
  --clear, -c      清理所有测试数据
  --check          检查是否存在测试数据

选项:
  --no-clear       不清理现有测试数据（增量添加）
  --production     允许在生产环境运行（危险！）
  --quiet, -q      静默模式，减少输出
  --types, -t      指定要 seed 的数据类型（逗号分隔）
                   可选值: users,system
  --help, -h       显示此帮助信息

示例:
  bun run seed                           # 执行完整 seed
  bun run seed --clear                   # 清理测试数据
  bun run seed --check                   # 检查测试数据
  bun run seed --types users             # 只 seed 用户数据
  bun run seed --no-clear --quiet        # 增量添加，静默模式

注意:
  - 默认只在开发和测试环境运行
  - 生产环境需要使用 --production 参数（不推荐）
  - 只生成系统必需的基础数据（用户、配置等）
  - 内容数据（文章、闪念、项目）通过内容同步系统获取
`);
}

// 检查是否存在测试数据
async function checkTestData(): Promise<boolean> {
  try {
    const testUsers = await db.select().from(users).where(like(users.email, "%test%")).limit(1);
    return testUsers.length > 0;
  } catch (error) {
    console.error("检查测试数据时出错:", error);
    return false;
  }
}

// 清理所有测试数据
async function clearAllTestData(): Promise<void> {
  try {
    let cleanedItems = 0;

    // 检查并清理测试用户
    if (await checkTableExists("users")) {
      await db.delete(users).where(like(users.email, "%test%"));
      cleanedItems++;
    }

    // 注意：不清理文章数据，文章通过内容同步系统管理

    // 检查并清理测试评论
    if (await checkTableExists("comments")) {
      await db.delete(comments).where(like(comments.content, "%测试%"));
      cleanedItems++;
    }

    // 检查并清理验证码
    if (await checkTableExists("email_verification_codes")) {
      await db.delete(emailVerificationCodes);
      cleanedItems++;
    }

    if (cleanedItems > 0) {
      console.log("✅ 测试数据清理完成");
    } else {
      console.log("ℹ️  没有找到需要清理的测试数据（相关表不存在）");
    }
  } catch (error) {
    console.error("清理测试数据时出错:", error);
    throw error;
  }
}

// 执行种子数据填充
async function seedDatabase(options: SeedOptions): Promise<{
  success: boolean;
  message: string;
  seededCounts: { users: number; system: number };
  errors?: string[];
}> {
  try {
    // 环境检查
    if (options.developmentOnly && process.env.NODE_ENV === "production") {
      return {
        success: false,
        message: "生产环境不允许执行 seed 操作，使用 --production 参数强制执行",
        seededCounts: { users: 0, system: 0 },
      };
    }

    // 清理现有数据
    if (options.clearExisting) {
      if (options.verbose) console.log("🧹 清理现有测试数据...");
      await clearAllTestData();
    }

    const seededCounts = { users: 0, system: 0 };

    // 创建测试用户
    if (options.dataTypes.includes("users")) {
      if (options.verbose) console.log("👥 创建测试用户...");

      // 检查 users 表是否存在
      if (!(await checkTableExists("users"))) {
        if (options.verbose) {
          console.log("⚠️  users 表不存在，跳过用户创建");
        }
      } else {
        const testUsers = [
          {
            id: uuidv4(),
            email: "test1@example.com",
            name: "测试用户1",
            createdAt: Date.now(),
          },
          {
            id: uuidv4(),
            email: "test2@example.com",
            name: "测试用户2",
            createdAt: Date.now(),
          },
        ];

        await db.insert(users).values(testUsers);
        seededCounts.users = testUsers.length;
      }
    }

    // 系统配置数据（如果需要的话）
    if (options.dataTypes.includes("system")) {
      if (options.verbose) console.log("⚙️ 初始化系统配置...");

      // 这里可以添加系统必需的配置数据
      // 例如：默认设置、系统参数等
      seededCounts.system = 0; // 暂时没有系统配置需要初始化
    }

    return {
      success: true,
      message: "Seed 操作完成",
      seededCounts,
    };
  } catch (error) {
    return {
      success: false,
      message: "Seed 操作失败",
      seededCounts: { users: 0, system: 0 },
      errors: [String(error)],
    };
  }
}

// 主函数
async function main(): Promise<void> {
  try {
    // 初始化数据库
    await initializeDB();

    const { action, options } = parseArgs();

    switch (action) {
      case "seed": {
        console.log("🌱 开始执行数据库 seed...\n");
        const result = await seedDatabase(options);

        if (result.success) {
          console.log(`\n✅ ${result.message}`);
          if (options.verbose) {
            console.log("\n📊 Seed 统计:");
            console.log(`   用户: ${result.seededCounts.users}`);
            console.log(`   系统配置: ${result.seededCounts.system}`);
          }
        } else {
          console.error(`\n❌ ${result.message}`);
          if (result.errors) {
            console.error("错误详情:", result.errors);
          }
          process.exit(1);
        }
        break;
      }

      case "clear": {
        console.log("🧹 清理测试数据...");
        await clearAllTestData();
        break;
      }

      case "check": {
        console.log("🔍 检查测试数据...");
        const hasTestData = await checkTestData();
        if (hasTestData) {
          console.log("✅ 发现测试数据");
        } else {
          console.log("❌ 未发现测试数据");
        }
        break;
      }
    }
  } catch (error) {
    console.error("执行失败:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
