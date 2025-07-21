import { Database } from 'bun:sqlite';
import path from 'node:path';

const DB_PATH_RELATIVE = process.env.DB_PATH || './sqlite.db';
const DB_PATH_ABSOLUTE = path.resolve(process.cwd(), DB_PATH_RELATIVE);

try {
  console.log(`Connecting to database at: ${DB_PATH_ABSOLUTE}`);
  const sqlite = new Database(DB_PATH_ABSOLUTE, { readonly: true });

  // 检查评论表是否存在
  const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'").all() as {
    name: string;
  }[];

  if (tables.length === 0) {
    console.log('❌ Comments table does not exist');
    sqlite.close();
    process.exit(0);
  }

  console.log('✅ Comments table exists');

  // 获取评论表的schema
  const schema = sqlite.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='comments'").get() as {
    sql: string;
  } | null;

  if (schema) {
    console.log('\n📋 Comments table schema:');
    console.log(schema.sql);
  }

  // 检查评论数量
  const countResult = sqlite.query('SELECT COUNT(*) as count FROM comments').get() as { count: number };

  console.log(`\n📊 Total comments: ${countResult.count}`);

  if (countResult.count > 0) {
    // 显示前几条评论
    const comments = sqlite.query('SELECT * FROM comments LIMIT 5').all();

    console.log('\n📝 Sample comments:');
    console.log(JSON.stringify(comments, null, 2));

    // 按状态统计
    const statusStats = sqlite.query('SELECT status, COUNT(*) as count FROM comments GROUP BY status').all() as {
      status: string;
      count: number;
    }[];

    console.log('\n📈 Comments by status:');
    statusStats.forEach((stat) => {
      console.log(`  ${stat.status}: ${stat.count}`);
    });
  } else {
    console.log('\n💭 No comments found in the database');
  }

  // 检查用户表
  const userCount = sqlite.query('SELECT COUNT(*) as count FROM users').get() as { count: number };

  console.log(`\n👥 Total users: ${userCount.count}`);

  sqlite.close();
} catch (error) {
  console.error('Failed to check comments:', error);
  process.exit(1);
}
