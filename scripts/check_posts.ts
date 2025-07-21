import { Database } from 'bun:sqlite';
import path from 'node:path';

const DB_PATH_RELATIVE = process.env.DB_PATH || './sqlite.db';
const DB_PATH_ABSOLUTE = path.resolve(process.cwd(), DB_PATH_RELATIVE);

try {
  console.log(`Connecting to database at: ${DB_PATH_ABSOLUTE}`);
  const sqlite = new Database(DB_PATH_ABSOLUTE, { readonly: true });

  // 检查文章表是否存在
  const tables = sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").all() as {
    name: string;
  }[];

  if (tables.length === 0) {
    console.log('❌ Posts table does not exist');
    sqlite.close();
    process.exit(0);
  }

  console.log('✅ Posts table exists');

  // 获取文章表的schema
  const schema = sqlite.query("SELECT sql FROM sqlite_master WHERE type='table' AND name='posts'").get() as {
    sql: string;
  } | null;

  if (schema) {
    console.log('\n📋 Posts table schema:');
    console.log(schema.sql);
  }

  // 检查文章数量
  const countResult = sqlite.query('SELECT COUNT(*) as count FROM posts').get() as { count: number };

  console.log(`\n📊 Total posts: ${countResult.count}`);

  if (countResult.count > 0) {
    // 检查空标题的文章
    const emptyTitlePosts = sqlite.query("SELECT id, slug, title FROM posts WHERE title = '' OR title IS NULL").all();
    console.log(`\n🚨 Posts with empty titles: ${emptyTitlePosts.length}`);
    if (emptyTitlePosts.length > 0) {
      console.log('Empty title posts:');
      emptyTitlePosts.forEach((post: any) => {
        console.log(`  - ID: ${post.id}, Slug: ${post.slug}, Title: "${post.title}"`);
      });
    }

    // 检查空内容的文章
    const emptyBodyPosts = sqlite.query("SELECT id, slug, title FROM posts WHERE body = '' OR body IS NULL").all();
    console.log(`\n🚨 Posts with empty body: ${emptyBodyPosts.length}`);
    if (emptyBodyPosts.length > 0) {
      console.log('Empty body posts:');
      emptyBodyPosts.forEach((post: any) => {
        console.log(`  - ID: ${post.id}, Slug: ${post.slug}, Title: "${post.title}"`);
      });
    }

    // 检查空slug的文章
    const emptySlugPosts = sqlite.query("SELECT id, slug, title FROM posts WHERE slug = '' OR slug IS NULL").all();
    console.log(`\n🚨 Posts with empty slug: ${emptySlugPosts.length}`);
    if (emptySlugPosts.length > 0) {
      console.log('Empty slug posts:');
      emptySlugPosts.forEach((post: any) => {
        console.log(`  - ID: ${post.id}, Slug: "${post.slug}", Title: "${post.title}"`);
      });
    }

    // 显示前几条文章
    const posts = sqlite.query('SELECT id, slug, title, type, draft, public FROM posts LIMIT 10').all();

    console.log('\n📝 Sample posts:');
    posts.forEach((post: any) => {
      console.log(`  - ID: ${post.id}`);
      console.log(`    Slug: ${post.slug}`);
      console.log(`    Title: "${post.title}"`);
      console.log(`    Type: ${post.type}`);
      console.log(`    Draft: ${post.draft}`);
      console.log(`    Public: ${post.public}`);
      console.log('    ---');
    });

    // 按类型统计
    const typeStats = sqlite.query('SELECT type, COUNT(*) as count FROM posts GROUP BY type').all() as {
      type: string;
      count: number;
    }[];

    console.log('\n📈 Posts by type:');
    typeStats.forEach((stat) => {
      console.log(`  ${stat.type}: ${stat.count}`);
    });

    // 按状态统计
    const draftStats = sqlite.query('SELECT draft, COUNT(*) as count FROM posts GROUP BY draft').all() as {
      draft: number;
      count: number;
    }[];

    console.log('\n📈 Posts by draft status:');
    draftStats.forEach((stat) => {
      console.log(`  ${stat.draft ? 'Draft' : 'Published'}: ${stat.count}`);
    });

    // 按公开状态统计
    const publicStats = sqlite.query('SELECT public, COUNT(*) as count FROM posts GROUP BY public').all() as {
      public: number;
      count: number;
    }[];

    console.log('\n📈 Posts by public status:');
    publicStats.forEach((stat) => {
      console.log(`  ${stat.public ? 'Public' : 'Private'}: ${stat.count}`);
    });
  } else {
    console.log('\n💭 No posts found in the database');
  }

  sqlite.close();
} catch (error) {
  console.error('Failed to check posts:', error);
  process.exit(1);
}
