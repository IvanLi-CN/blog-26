#!/usr/bin/env bun

/**
 * 数据库工具脚本
 * 合并了原来的 check_posts.ts、check_comments.ts、get_db_schema.ts
 * 提供统一的数据库检查和调试功能
 */

import { Database } from 'bun:sqlite';
import path from 'node:path';

const DB_PATH_RELATIVE = process.env.DB_PATH || './sqlite.db';
const DB_PATH_ABSOLUTE = path.resolve(process.cwd(), DB_PATH_RELATIVE);

interface TableInfo {
  name: string;
  sql: string;
}

interface PostStats {
  total: number;
  emptyTitle: number;
  emptyBody: number;
  emptySlug: number;
  byType: Array<{ type: string; count: number }>;
  byDraft: Array<{ draft: number; count: number }>;
  byPublic: Array<{ public: number; count: number }>;
}

interface CommentStats {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
}

interface UserStats {
  total: number;
}

// 数据库连接函数
function connectDatabase(): Database {
  try {
    console.log(`📁 连接数据库: ${DB_PATH_ABSOLUTE}`);
    return new Database(DB_PATH_ABSOLUTE, { readonly: true });
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    process.exit(1);
  }
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
  const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?").all(tableName) as {
    name: string;
  }[];
  return tables.length > 0;
}

// 检查文章数据
function checkPosts(sqlite: Database): PostStats | null {
  if (!tableExists(sqlite, 'posts')) {
    console.log('❌ Posts 表不存在');
    return null;
  }

  console.log('✅ Posts 表存在');

  // 获取文章表的schema
  const schema = sqlite.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'").get() as {
    sql: string;
  } | null;

  if (schema) {
    console.log('\n📋 Posts 表结构:');
    console.log(schema.sql);
  }

  // 统计数据
  const total = (sqlite.query('SELECT COUNT(*) as count FROM posts').get() as { count: number }).count;

  const emptyTitlePosts = sqlite
    .query("SELECT COUNT(*) as count FROM posts WHERE title = '' OR title IS NULL")
    .get() as { count: number };
  const emptyBodyPosts = sqlite.query("SELECT COUNT(*) as count FROM posts WHERE body = '' OR body IS NULL").get() as {
    count: number;
  };
  const emptySlugPosts = sqlite.query("SELECT COUNT(*) as count FROM posts WHERE slug = '' OR slug IS NULL").get() as {
    count: number;
  };

  const byType = sqlite.query('SELECT type, COUNT(*) as count FROM posts GROUP BY type').all() as Array<{
    type: string;
    count: number;
  }>;
  const byDraft = sqlite.query('SELECT draft, COUNT(*) as count FROM posts GROUP BY draft').all() as Array<{
    draft: number;
    count: number;
  }>;
  const byPublic = sqlite.query('SELECT public, COUNT(*) as count FROM posts GROUP BY public').all() as Array<{
    public: number;
    count: number;
  }>;

  return {
    total,
    emptyTitle: emptyTitlePosts.count,
    emptyBody: emptyBodyPosts.count,
    emptySlug: emptySlugPosts.count,
    byType,
    byDraft,
    byPublic,
  };
}

// 检查评论数据
function checkComments(sqlite: Database): CommentStats | null {
  if (!tableExists(sqlite, 'comments')) {
    console.log('❌ Comments 表不存在');
    return null;
  }

  console.log('✅ Comments 表存在');

  // 获取评论表的schema
  const schema = sqlite.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='comments'").get() as {
    sql: string;
  } | null;

  if (schema) {
    console.log('\n📋 Comments 表结构:');
    console.log(schema.sql);
  }

  const total = (sqlite.query('SELECT COUNT(*) as count FROM comments').get() as { count: number }).count;
  const byStatus = sqlite.query('SELECT status, COUNT(*) as count FROM comments GROUP BY status').all() as Array<{
    status: string;
    count: number;
  }>;

  return {
    total,
    byStatus,
  };
}

// 检查用户数据
function checkUsers(sqlite: Database): UserStats | null {
  if (!tableExists(sqlite, 'users')) {
    console.log('❌ Users 表不存在');
    return null;
  }

  console.log('✅ Users 表存在');

  const total = (sqlite.query('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;

  return { total };
}

// 显示数据库概览
function showOverview(sqlite: Database): void {
  console.log('\n📊 数据库概览');
  console.log('=' * 50);

  const postStats = checkPosts(sqlite);
  const commentStats = checkComments(sqlite);
  const userStats = checkUsers(sqlite);

  if (postStats) {
    console.log(`\n📝 文章统计:`);
    console.log(`   总数: ${postStats.total}`);
    console.log(`   空标题: ${postStats.emptyTitle}`);
    console.log(`   空内容: ${postStats.emptyBody}`);
    console.log(`   空 slug: ${postStats.emptySlug}`);

    console.log(`\n   按类型分布:`);
    postStats.byType.forEach((stat) => {
      console.log(`     ${stat.type}: ${stat.count}`);
    });

    console.log(`\n   按草稿状态:`);
    postStats.byDraft.forEach((stat) => {
      console.log(`     ${stat.draft ? '草稿' : '已发布'}: ${stat.count}`);
    });

    console.log(`\n   按公开状态:`);
    postStats.byPublic.forEach((stat) => {
      console.log(`     ${stat.public ? '公开' : '私有'}: ${stat.count}`);
    });
  }

  if (commentStats) {
    console.log(`\n💬 评论统计:`);
    console.log(`   总数: ${commentStats.total}`);
    console.log(`   按状态分布:`);
    commentStats.byStatus.forEach((stat) => {
      console.log(`     ${stat.status}: ${stat.count}`);
    });
  }

  if (userStats) {
    console.log(`\n👥 用户统计:`);
    console.log(`   总数: ${userStats.total}`);
  }
}

// 显示详细的文章信息
function showPostDetails(sqlite: Database): void {
  const postStats = checkPosts(sqlite);
  if (!postStats) return;

  console.log(`\n📊 文章详细信息:`);
  console.log(`   总计: ${postStats.total} 篇文章`);

  if (postStats.emptyTitle > 0) {
    console.log(`\n🚨 空标题文章: ${postStats.emptyTitle} 篇`);
    const emptyTitlePosts = sqlite
      .query("SELECT id, slug, title FROM posts WHERE title = '' OR title IS NULL LIMIT 5")
      .all();
    emptyTitlePosts.forEach((post: any) => {
      console.log(`     - ID: ${post.id}, Slug: ${post.slug}, Title: "${post.title}"`);
    });
  }

  if (postStats.emptyBody > 0) {
    console.log(`\n🚨 空内容文章: ${postStats.emptyBody} 篇`);
    const emptyBodyPosts = sqlite
      .query("SELECT id, slug, title FROM posts WHERE body = '' OR body IS NULL LIMIT 5")
      .all();
    emptyBodyPosts.forEach((post: any) => {
      console.log(`     - ID: ${post.id}, Slug: ${post.slug}, Title: "${post.title}"`);
    });
  }

  if (postStats.emptySlug > 0) {
    console.log(`\n🚨 空 slug 文章: ${postStats.emptySlug} 篇`);
    const emptySlugPosts = sqlite
      .query("SELECT id, slug, title FROM posts WHERE slug = '' OR slug IS NULL LIMIT 5")
      .all();
    emptySlugPosts.forEach((post: any) => {
      console.log(`     - ID: ${post.id}, Slug: "${post.slug}", Title: "${post.title}"`);
    });
  }

  // 显示示例文章
  console.log('\n📝 示例文章 (前 5 篇):');
  const posts = sqlite.query('SELECT id, slug, title, type, draft, public FROM posts LIMIT 5').all();
  posts.forEach((post: any) => {
    console.log(`   - ID: ${post.id}`);
    console.log(`     Slug: ${post.slug}`);
    console.log(`     Title: "${post.title}"`);
    console.log(`     Type: ${post.type}, Draft: ${post.draft}, Public: ${post.public}`);
    console.log('     ---');
  });
}

// 显示详细的评论信息
function showCommentDetails(sqlite: Database): void {
  const commentStats = checkComments(sqlite);
  if (!commentStats) return;

  console.log(`\n📊 评论详细信息:`);
  console.log(`   总计: ${commentStats.total} 条评论`);

  if (commentStats.total > 0) {
    // 显示示例评论
    console.log('\n💬 示例评论 (前 5 条):');
    const comments = sqlite.query('SELECT * FROM comments LIMIT 5').all();
    console.log(JSON.stringify(comments, null, 2));
  } else {
    console.log('\n💭 数据库中没有评论');
  }
}

// 显示数据库结构
function showSchema(sqlite: Database): void {
  console.log('\n🏗️ 数据库结构验证');
  console.log('=' * 50);

  const tables = getSchema(sqlite);

  if (tables.length === 0) {
    console.log('❌ 没有找到用户定义的表');
  } else {
    console.log(`✅ 找到 ${tables.length} 个表:`);
    for (const table of tables) {
      console.log(`\n--- 表: ${table.name} ---`);
      console.log(table.sql);
      console.log('--- 结构结束 ---');
    }
  }
}

// 打印帮助信息
function printHelp(): void {
  console.log(`
数据库工具脚本

用法:
  bun run scripts/db-tools.ts [命令] [选项]

命令:
  overview, -o      显示数据库概览（默认）
  schema, -s        显示数据库结构
  posts, -p         显示文章详细信息
  comments, -c      显示评论详细信息
  all, -a           显示所有信息

选项:
  --help, -h        显示此帮助信息

示例:
  bun run scripts/db-tools.ts                    # 显示概览
  bun run scripts/db-tools.ts schema             # 显示数据库结构
  bun run scripts/db-tools.ts posts              # 显示文章详细信息
  bun run scripts/db-tools.ts comments           # 显示评论详细信息
  bun run scripts/db-tools.ts all                # 显示所有信息

环境变量:
  DB_PATH           数据库文件路径（默认: ./sqlite.db）
`);
}

// 主函数
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  const command = args[0] || 'overview';

  const sqlite = connectDatabase();

  try {
    switch (command) {
      case 'overview':
      case '-o':
        showOverview(sqlite);
        break;

      case 'schema':
      case '-s':
        showSchema(sqlite);
        break;

      case 'posts':
      case '-p':
        showPostDetails(sqlite);
        break;

      case 'comments':
      case '-c':
        showCommentDetails(sqlite);
        break;

      case 'all':
      case '-a':
        showOverview(sqlite);
        showSchema(sqlite);
        showPostDetails(sqlite);
        showCommentDetails(sqlite);
        break;

      default:
        console.error(`❌ 未知命令: ${command}`);
        console.log('使用 --help 查看可用命令');
        process.exit(1);
    }
  } finally {
    sqlite.close();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ 执行失败:', error);
    process.exit(1);
  });
}
