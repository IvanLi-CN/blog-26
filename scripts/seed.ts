#!/usr/bin/env bun

/**
 * 数据库 Seed 脚本
 * 用于填充开发和测试环境的示例数据
 */

import { like } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, initializeDB } from "../src/lib/db";
import { comments, emailVerificationCodes, posts, users } from "../src/lib/schema";

interface SeedOptions {
  clearExisting: boolean;
  developmentOnly: boolean;
  dataTypes: Array<"posts" | "comments" | "users">;
  verbose: boolean;
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
    dataTypes: ["posts", "comments", "users"],
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
          options.dataTypes = types.filter((t) =>
            ["posts", "comments", "users"].includes(t)
          ) as Array<"posts" | "comments" | "users">;
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
                   可选值: posts,comments,users
  --help, -h       显示此帮助信息

示例:
  bun run seed                           # 执行完整 seed
  bun run seed --clear                   # 清理测试数据
  bun run seed --check                   # 检查测试数据
  bun run seed --types posts,users       # 只 seed 文章和用户
  bun run seed --no-clear --quiet        # 增量添加，静默模式

注意:
  - 默认只在开发和测试环境运行
  - 生产环境需要使用 --production 参数（不推荐）
  - 测试数据都有特殊前缀，不会与真实数据冲突
`);
}

// 检查是否有测试数据
async function hasTestData(): Promise<boolean> {
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
    // 清理测试用户
    await db.delete(users).where(like(users.email, "%test%"));

    // 清理测试文章
    await db.delete(posts).where(like(posts.title, "测试%"));

    // 清理测试评论
    await db.delete(comments).where(like(comments.content, "%测试%"));

    // 清理验证码
    await db.delete(emailVerificationCodes);

    console.log("✅ 测试数据清理完成");
  } catch (error) {
    console.error("清理测试数据时出错:", error);
    throw error;
  }
}

// 执行种子数据填充
async function seedDatabase(options: SeedOptions): Promise<{
  success: boolean;
  message: string;
  seededCounts: { posts: number; comments: number; users: number };
  errors?: string[];
}> {
  try {
    // 环境检查
    if (options.developmentOnly && process.env.NODE_ENV === "production") {
      return {
        success: false,
        message: "生产环境不允许执行 seed 操作，使用 --production 参数强制执行",
        seededCounts: { posts: 0, comments: 0, users: 0 },
      };
    }

    // 清理现有数据
    if (options.clearExisting) {
      if (options.verbose) console.log("🧹 清理现有测试数据...");
      await clearAllTestData();
    }

    const seededCounts = { posts: 0, comments: 0, users: 0 };

    // 创建测试用户
    if (options.dataTypes.includes("users")) {
      if (options.verbose) console.log("👥 创建测试用户...");

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

    // 创建测试文章
    if (options.dataTypes.includes("posts")) {
      if (options.verbose) console.log("📝 创建测试文章...");

      const now = Date.now();
      const testPosts = [
        {
          id: "test-post-1",
          title: "测试文章1",
          body: "这是第一篇测试文章的内容。",
          slug: "test-post-1",
          type: "post",
          excerpt: "这是第一篇测试文章的摘要",
          publishDate: now,
          updateDate: now,
          draft: false,
          public: true,
          contentHash: "test-hash-1",
        },
        {
          id: "test-post-2",
          title: "测试文章2",
          body: "这是第二篇测试文章的内容。",
          slug: "test-post-2",
          type: "post",
          excerpt: "这是第二篇测试文章的摘要",
          publishDate: now,
          updateDate: now,
          draft: false,
          public: true,
          contentHash: "test-hash-2",
        },
      ];

      await db.insert(posts).values(testPosts);
      seededCounts.posts = testPosts.length;
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
      seededCounts: { posts: 0, comments: 0, users: 0 },
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
            console.log(`   文章: ${result.seededCounts.posts}`);
            console.log(`   评论: ${result.seededCounts.comments}`);
            console.log(`   用户: ${result.seededCounts.users}`);
          }
        } else {
          console.error(`\n❌ ${result.message}`);
          if (result.errors) {
            console.error("错误详情:");
            result.errors.forEach((error) => console.error(`   - ${error}`));
          }
          process.exit(1);
        }
        break;
      }

      case "clear":
        console.log("🧹 清理所有测试数据...\n");
        await clearAllTestData();
        console.log("✅ 测试数据清理完成");
        break;

      case "check": {
        console.log("🔍 检查测试数据...\n");
        const exists = await hasTestData();
        if (exists) {
          console.log("✅ 发现测试数据");
        } else {
          console.log("❌ 未发现测试数据");
        }
        break;
      }
    }
  } catch (error) {
    console.error("❌ 执行失败:", error);
    process.exit(1);
  }
}

// 运行脚本
if (import.meta.main) {
  main();
}
