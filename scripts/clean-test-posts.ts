#!/usr/bin/env bun

/**
 * 清理测试文章数据脚本
 *
 * 用途：
 * - 清理数据库中的测试文章数据
 * - 支持选择性清理（按来源、标题等）
 * - 为E2E测试提供干净的数据环境
 */

import { Database } from "bun:sqlite";
import { and, eq, like, or } from "drizzle-orm";
import { db, initializeDB } from "../src/lib/db";
import { posts } from "../src/lib/schema";

interface CleanOptions {
  dryRun: boolean;
  verbose: boolean;
  source?: string;
  pattern?: string;
  force: boolean;
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
function parseArgs(): CleanOptions {
  const args = process.argv.slice(2);

  const options: CleanOptions = {
    dryRun: false,
    verbose: true,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--dry-run":
      case "-n":
        options.dryRun = true;
        break;

      case "--quiet":
      case "-q":
        options.verbose = false;
        break;

      case "--force":
      case "-f":
        options.force = true;
        break;

      case "--source":
      case "-s":
        options.source = args[++i];
        break;

      case "--pattern":
      case "-p":
        options.pattern = args[++i];
        break;

      case "--help":
      case "-h":
        showHelp();
        process.exit(0);
        break;

      default:
        console.error(`未知参数: ${arg}`);
        showHelp();
        process.exit(1);
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
清理测试文章数据

用法:
  bun run clean-test-posts [选项]

选项:
  --dry-run, -n        预览模式，不实际删除数据
  --force, -f          强制删除，跳过确认
  --quiet, -q          静默模式，减少输出
  --source, -s <源>    只清理指定来源的文章 (如: webdav, local)
  --pattern, -p <模式> 只清理标题匹配模式的文章 (如: test-, 测试)
  --help, -h           显示此帮助信息

示例:
  bun run clean-test-posts --dry-run              # 预览要删除的文章
  bun run clean-test-posts --source webdav        # 只删除WebDAV来源的文章
  bun run clean-test-posts --pattern "test-"      # 删除标题包含"test-"的文章
  bun run clean-test-posts --force                # 强制删除所有测试文章

注意:
  - 默认会删除标题包含"test"、"测试"、"nodejs-performance"的文章
  - 使用 --dry-run 可以预览要删除的内容
  - 生产环境请谨慎使用
`);
}

// 获取要清理的文章
async function getPostsToClean(options: CleanOptions) {
  const whereConditions = [];

  // 默认的测试文章模式
  const defaultPatterns = [
    like(posts.title, "%test%"),
    like(posts.title, "%测试%"),
    like(posts.title, "%Test%"),
    like(posts.slug, "%test%"),
    like(posts.slug, "%nodejs-performance%"), // 我们手动插入的测试文章
  ];

  if (options.pattern) {
    // 如果指定了模式，只使用指定的模式
    whereConditions.push(like(posts.title, `%${options.pattern}%`));
  } else {
    // 使用默认模式
    whereConditions.push(or(...defaultPatterns));
  }

  // 如果指定了来源
  if (options.source) {
    whereConditions.push(eq(posts.source, options.source));
  }

  const finalCondition = whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0];

  return await db.select().from(posts).where(finalCondition);
}

// 清理文章数据
async function cleanTestPosts(): Promise<void> {
  const options = parseArgs();

  try {
    // 检查 posts 表是否存在
    const postsTableExists = await checkTableExists("posts");
    if (!postsTableExists) {
      if (options.verbose) {
        console.log("ℹ️  posts 表不存在，没有需要清理的测试文章");
      } else {
        console.log("✅ 没有找到需要清理的测试文章");
      }
      return;
    }

    // 初始化数据库
    await initializeDB();

    if (options.verbose) {
      console.log("🔍 查找要清理的测试文章...");
    }

    // 获取要清理的文章
    const postsToClean = await getPostsToClean(options);

    if (postsToClean.length === 0) {
      console.log("✅ 没有找到需要清理的测试文章");
      return;
    }

    if (options.verbose) {
      console.log(`\n📋 找到 ${postsToClean.length} 篇测试文章:`);
      postsToClean.forEach((post, index) => {
        console.log(`  ${index + 1}. ${post.title} (${post.slug}) [${post.source}]`);
      });
      console.log();
    }

    if (options.dryRun) {
      console.log("🔍 预览模式：以上文章将被删除（使用 --force 实际执行删除）");
      return;
    }

    // 确认删除
    if (!options.force) {
      console.log(`⚠️  即将删除 ${postsToClean.length} 篇测试文章`);
      console.log("请确认是否继续？(y/N)");

      // 简单的确认机制
      const confirmation = await new Promise<string>((resolve) => {
        process.stdin.once("data", (data) => {
          resolve(data.toString().trim().toLowerCase());
        });
      });

      if (confirmation !== "y" && confirmation !== "yes") {
        console.log("❌ 操作已取消");
        return;
      }
    }

    // 执行删除
    if (options.verbose) {
      console.log("🧹 正在清理测试文章...");
    }

    const slugsToDelete = postsToClean.map((post) => post.slug);

    for (const slug of slugsToDelete) {
      await db.delete(posts).where(eq(posts.slug, slug));
      if (options.verbose) {
        console.log(`  ✅ 已删除: ${slug}`);
      }
    }

    console.log(`✅ 成功清理 ${postsToClean.length} 篇测试文章`);
  } catch (error) {
    console.error("❌ 清理测试文章时出错:", error);
    process.exit(1);
  }
}

// 运行清理
cleanTestPosts();
