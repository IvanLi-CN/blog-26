#!/usr/bin/env bun

/**
 * 数据库工具脚本
 * 提供数据库检查和调试功能
 */

import { Database } from "bun:sqlite";
import path from "node:path";

const DB_PATH_RELATIVE = process.env.DB_PATH || "./sqlite.db";
const DB_PATH_ABSOLUTE = path.resolve(process.cwd(), DB_PATH_RELATIVE);
const SEARCH_INDEX_TABLE = "posts_search_fts";

interface TableInfo {
  name: string;
  sql: string;
}

// 数据库连接函数
function connectDatabase(readonly = true): Database {
  try {
    console.log(`📁 连接数据库: ${DB_PATH_ABSOLUTE}`);
    return readonly
      ? new Database(DB_PATH_ABSOLUTE, { readonly: true })
      : new Database(DB_PATH_ABSOLUTE);
  } catch (error) {
    console.error("❌ 数据库连接失败:", error);
    process.exit(1);
  }
}

function getCount(sqlite: Database, query: string): number {
  return Number((sqlite.query(query).get() as { count?: number } | null)?.count ?? 0);
}

function checkSearchIndex(sqlite: Database): void {
  if (!tableExists(sqlite, SEARCH_INDEX_TABLE)) {
    throw new Error(`${SEARCH_INDEX_TABLE} 不存在，请先运行 bun run migrate`);
  }

  const eligible = getCount(
    sqlite,
    "SELECT COUNT(*) AS count FROM posts WHERE type IN ('post', 'memo')"
  );
  const indexed = getCount(sqlite, `SELECT COUNT(*) AS count FROM ${SEARCH_INDEX_TABLE}`);
  const duplicate = getCount(
    sqlite,
    `SELECT COUNT(*) AS count FROM (SELECT post_id FROM ${SEARCH_INDEX_TABLE} GROUP BY post_id HAVING COUNT(*) <> 1)`
  );
  const missing = getCount(
    sqlite,
    `SELECT COUNT(*) AS count
     FROM posts AS p
     LEFT JOIN ${SEARCH_INDEX_TABLE} AS f ON f.post_id = p.id
     WHERE p.type IN ('post', 'memo') AND f.post_id IS NULL`
  );
  const extra = getCount(
    sqlite,
    `SELECT COUNT(*) AS count
     FROM ${SEARCH_INDEX_TABLE} AS f
     LEFT JOIN posts AS p ON p.id = f.post_id
     WHERE p.id IS NULL OR p.type NOT IN ('post', 'memo')`
  );
  const stale = getCount(
    sqlite,
    `SELECT COUNT(*) AS count
     FROM posts AS p
     INNER JOIN ${SEARCH_INDEX_TABLE} AS f ON f.post_id = p.id
     WHERE p.type IN ('post', 'memo')
       AND (
         COALESCE(f.type, '') <> COALESCE(p.type, '') OR
         COALESCE(f.slug, '') <> COALESCE(p.slug, '') OR
         COALESCE(f.title, '') <> COALESCE(p.title, '') OR
         COALESCE(f.excerpt, '') <> COALESCE(p.excerpt, '') OR
         COALESCE(f.body, '') <> COALESCE(p.body, '') OR
         COALESCE(f.tags, '') <> COALESCE(p.tags, '')
       )`
  );

  console.log("🔎 搜索索引检查");
  console.log(`   可索引内容: ${eligible}`);
  console.log(`   索引记录: ${indexed}`);
  console.log(`   缺失: ${missing}`);
  console.log(`   多余: ${extra}`);
  console.log(`   重复: ${duplicate}`);
  console.log(`   过期: ${stale}`);

  if (indexed !== eligible || missing > 0 || extra > 0 || duplicate > 0 || stale > 0) {
    throw new Error("搜索索引与 posts 不一致，请运行 search-index rebuild");
  }

  console.log("✅ 搜索索引一致");
}

function rebuildSearchIndex(sqlite: Database): void {
  if (!tableExists(sqlite, SEARCH_INDEX_TABLE)) {
    throw new Error(`${SEARCH_INDEX_TABLE} 不存在，请先运行 bun run migrate`);
  }

  sqlite.run("BEGIN IMMEDIATE");
  try {
    sqlite.run(`DELETE FROM ${SEARCH_INDEX_TABLE}`);
    sqlite.run(
      `INSERT INTO ${SEARCH_INDEX_TABLE} (post_id, type, slug, title, excerpt, body, tags)
       SELECT id, type, slug, title, excerpt, body, tags
       FROM posts
       WHERE type IN ('post', 'memo')`
    );
    sqlite.run("COMMIT");
  } catch (error) {
    sqlite.run("ROLLBACK");
    throw error;
  }

  console.log("✅ 搜索索引已重建");
  checkSearchIndex(sqlite);
}

// 获取数据库结构
function getSchema(sqlite: Database): TableInfo[] {
  const tables = sqlite
    .query(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%'"
    )
    .all() as TableInfo[];

  return tables;
}

// 检查表是否存在
function tableExists(sqlite: Database, tableName: string): boolean {
  const tables = sqlite
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .all(tableName) as {
    name: string;
  }[];
  return tables.length > 0;
}

// 显示数据库概览
function showOverview(sqlite: Database): void {
  console.log("📊 数据库概览\n");

  const tables = getSchema(sqlite);
  console.log(`📋 表数量: ${tables.length}`);

  for (const table of tables) {
    try {
      const count = sqlite.query(`SELECT COUNT(*) as count FROM ${table.name}`).get() as {
        count: number;
      };
      console.log(`   ${table.name}: ${count.count} 条记录`);
    } catch (error) {
      console.log(`   ${table.name}: 查询失败 (${error})`);
    }
  }
}

// 显示数据库结构
function showSchema(sqlite: Database): void {
  console.log("🏗️ 数据库结构\n");

  const tables = getSchema(sqlite);

  for (const table of tables) {
    console.log(`📋 表: ${table.name}`);
    console.log(`SQL: ${table.sql}\n`);
  }
}

// 检查文章数据
function checkPosts(sqlite: Database): void {
  console.log("📝 检查文章数据\n");

  if (!tableExists(sqlite, "posts")) {
    console.log("❌ Posts 表不存在");
    return;
  }

  console.log("✅ Posts 表存在");

  try {
    const total = (sqlite.query("SELECT COUNT(*) as count FROM posts").get() as { count: number })
      .count;
    console.log(`📊 总文章数: ${total}`);

    // 检查发布状态
    const published = (
      sqlite.query("SELECT COUNT(*) as count FROM posts WHERE draft = 0 AND public = 1").get() as {
        count: number;
      }
    ).count;
    const drafts = (
      sqlite.query("SELECT COUNT(*) as count FROM posts WHERE draft = 1").get() as { count: number }
    ).count;
    console.log(`   已发布: ${published}`);
    console.log(`   草稿: ${drafts}`);

    // 检查空标题
    const emptyTitle = (
      sqlite
        .query("SELECT COUNT(*) as count FROM posts WHERE title = '' OR title IS NULL")
        .get() as { count: number }
    ).count;
    if (emptyTitle > 0) {
      console.log(`⚠️  空标题文章: ${emptyTitle}`);
    }

    // 检查空内容
    const emptyContent = (
      sqlite.query("SELECT COUNT(*) as count FROM posts WHERE body = '' OR body IS NULL").get() as {
        count: number;
      }
    ).count;
    if (emptyContent > 0) {
      console.log(`⚠️  空内容文章: ${emptyContent}`);
    }
  } catch (error) {
    console.error("❌ 检查文章数据失败:", error);
  }
}

// 检查评论数据
function checkComments(sqlite: Database): void {
  console.log("💬 检查评论数据\n");

  if (!tableExists(sqlite, "comments")) {
    console.log("❌ Comments 表不存在");
    return;
  }

  console.log("✅ Comments 表存在");

  try {
    const total = (
      sqlite.query("SELECT COUNT(*) as count FROM comments").get() as { count: number }
    ).count;
    console.log(`📊 总评论数: ${total}`);

    // 检查审核状态
    const approved = (
      sqlite.query("SELECT COUNT(*) as count FROM comments WHERE approved = 1").get() as {
        count: number;
      }
    ).count;
    const pending = total - approved;
    console.log(`   已批准: ${approved}`);
    console.log(`   待审核: ${pending}`);
  } catch (error) {
    console.error("❌ 检查评论数据失败:", error);
  }
}

// 检查用户数据
function checkUsers(sqlite: Database): void {
  console.log("👥 检查用户数据\n");

  if (!tableExists(sqlite, "users")) {
    console.log("❌ Users 表不存在");
    return;
  }

  console.log("✅ Users 表存在");

  try {
    const total = (sqlite.query("SELECT COUNT(*) as count FROM users").get() as { count: number })
      .count;
    console.log(`📊 总用户数: ${total}`);

    // 检查测试用户
    const testUsers = (
      sqlite.query("SELECT COUNT(*) as count FROM users WHERE email LIKE '%test%'").get() as {
        count: number;
      }
    ).count;
    if (testUsers > 0) {
      console.log(`🧪 测试用户: ${testUsers}`);
    }
  } catch (error) {
    console.error("❌ 检查用户数据失败:", error);
  }
}

// 打印帮助信息
function printHelp(): void {
  console.log(`
数据库工具脚本

用法:
  bun run scripts/db-tools.ts [命令]

命令:
  (默认)      显示数据库概览
  schema      显示数据库结构
  posts       检查文章数据
  comments    检查评论数据
  users       检查用户数据
  all         显示所有信息
  search-index check    检查 posts_search_fts 一致性
  search-index rebuild  显式重建 posts_search_fts
  help        显示此帮助信息

示例:
  bun run scripts/db-tools.ts           # 显示概览
  bun run scripts/db-tools.ts schema    # 显示结构
  bun run scripts/db-tools.ts posts     # 检查文章
  bun run scripts/db-tools.ts all       # 显示所有信息
  bun run scripts/db-tools.ts search-index check
  bun run scripts/db-tools.ts search-index rebuild

环境变量:
  DB_PATH     数据库文件路径（默认: ./sqlite.db）
`);
}

// 主函数
function main(): void {
  const command = process.argv[2] || "overview";

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "search-index") {
    const action = process.argv[3] || "check";
    if (action !== "check" && action !== "rebuild") {
      console.error(`❌ 未知的 search-index 操作: ${action}`);
      process.exitCode = 1;
      return;
    }

    const sqlite = connectDatabase(action !== "rebuild");
    try {
      if (action === "check") checkSearchIndex(sqlite);
      else rebuildSearchIndex(sqlite);
    } catch (error) {
      console.error("❌ 搜索索引操作失败:", error instanceof Error ? error.message : error);
      process.exitCode = 1;
    } finally {
      sqlite.close();
    }
    return;
  }

  const sqlite = connectDatabase();

  try {
    switch (command) {
      case "schema":
        showSchema(sqlite);
        break;

      case "posts":
        checkPosts(sqlite);
        break;

      case "comments":
        checkComments(sqlite);
        break;

      case "users":
        checkUsers(sqlite);
        break;

      case "all":
        showOverview(sqlite);
        console.log(`\n${"=".repeat(50)}\n`);
        showSchema(sqlite);
        console.log(`\n${"=".repeat(50)}\n`);
        checkPosts(sqlite);
        console.log(`\n${"=".repeat(50)}\n`);
        checkComments(sqlite);
        console.log(`\n${"=".repeat(50)}\n`);
        checkUsers(sqlite);
        break;

      default:
        showOverview(sqlite);
        break;
    }
  } finally {
    sqlite.close();
  }
}

if (import.meta.main) {
  main();
}
