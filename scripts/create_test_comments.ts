import { Database } from 'bun:sqlite';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

const DB_PATH_RELATIVE = process.env.DB_PATH || './sqlite.db';
const DB_PATH_ABSOLUTE = path.resolve(process.cwd(), DB_PATH_RELATIVE);

try {
  console.log(`Connecting to database at: ${DB_PATH_ABSOLUTE}`);
  const sqlite = new Database(DB_PATH_ABSOLUTE);

  // 首先创建一些测试用户
  const users = [
    {
      id: uuidv4(),
      email: 'alice@example.com',
      name: 'Alice Johnson',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 30, // 30天前
    },
    {
      id: uuidv4(),
      email: 'bob@example.com',
      name: 'Bob Smith',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 15, // 15天前
    },
    {
      id: uuidv4(),
      email: 'charlie@example.com',
      name: 'Charlie Brown',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 7, // 7天前
    },
  ];

  console.log('Creating test users...');
  for (const user of users) {
    try {
      sqlite
        .query(`
        INSERT OR REPLACE INTO users (id, email, name, avatar_url, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
        .run(user.id, user.email, user.name, user.avatar_url, user.created_at);
    } catch (_error) {
      console.log(`User ${user.email} might already exist, skipping...`);
    }
  }

  // 创建测试评论
  const comments = [
    {
      id: uuidv4(),
      post_slug: 'hello-world',
      author_name: 'Alice Johnson',
      author_email: 'alice@example.com',
      content: '这是一篇很棒的文章！我学到了很多新知识。',
      parent_id: null,
      status: 'approved',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 5, // 5天前
    },
    {
      id: uuidv4(),
      post_slug: 'hello-world',
      author_name: 'Bob Smith',
      author_email: 'bob@example.com',
      content: '我完全同意Alice的观点。作者的见解很深刻。',
      parent_id: null,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 3, // 3天前
    },
    {
      id: uuidv4(),
      post_slug: 'hello-world',
      author_name: 'Charlie Brown',
      author_email: 'charlie@example.com',
      content: '感谢分享！这个话题很有趣。',
      parent_id: null,
      status: 'approved',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 2, // 2天前
    },
    {
      id: uuidv4(),
      post_slug: 'tech-trends-2024',
      author_name: 'Alice Johnson',
      author_email: 'alice@example.com',
      content: '2024年的技术趋势确实令人兴奋！特别是AI的发展。',
      parent_id: null,
      status: 'approved',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 1, // 1天前
    },
    {
      id: uuidv4(),
      post_slug: 'tech-trends-2024',
      author_name: 'Bob Smith',
      author_email: 'bob@example.com',
      content: '这是垃圾内容，应该被删除。',
      parent_id: null,
      status: 'rejected',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 1, // 1天前
    },
    {
      id: uuidv4(),
      post_slug: 'programming-tips',
      author_name: 'Charlie Brown',
      author_email: 'charlie@example.com',
      content: '这些编程技巧很实用，我会在项目中尝试使用。',
      parent_id: null,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000) - 3600 * 12, // 12小时前
    },
    {
      id: uuidv4(),
      post_slug: 'programming-tips',
      author_name: 'Alice Johnson',
      author_email: 'alice@example.com',
      content: '有没有更多关于性能优化的建议？',
      parent_id: null,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000) - 3600 * 6, // 6小时前
    },
    {
      id: uuidv4(),
      post_slug: 'web-development',
      author_name: 'Bob Smith',
      author_email: 'bob@example.com',
      content: '前端开发真的越来越复杂了，但也越来越有趣！',
      parent_id: null,
      status: 'approved',
      created_at: Math.floor(Date.now() / 1000) - 3600 * 2, // 2小时前
    },
  ];

  console.log('Creating test comments...');
  for (const comment of comments) {
    sqlite
      .query(`
      INSERT INTO comments (id, post_slug, author_name, author_email, content, parent_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        comment.id,
        comment.post_slug,
        comment.author_name,
        comment.author_email,
        comment.content,
        comment.parent_id,
        comment.status,
        comment.created_at
      );
  }

  // 创建一些回复评论
  const firstComment = comments[0];
  const replyComments = [
    {
      id: uuidv4(),
      post_slug: firstComment.post_slug,
      author_name: 'Bob Smith',
      author_email: 'bob@example.com',
      content: '我也有同样的感受！',
      parent_id: firstComment.id,
      status: 'approved',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 4, // 4天前
    },
    {
      id: uuidv4(),
      post_slug: firstComment.post_slug,
      author_name: 'Charlie Brown',
      author_email: 'charlie@example.com',
      content: '期待看到更多这样的内容。',
      parent_id: firstComment.id,
      status: 'pending',
      created_at: Math.floor(Date.now() / 1000) - 86400 * 3, // 3天前
    },
  ];

  console.log('Creating reply comments...');
  for (const reply of replyComments) {
    sqlite
      .query(`
      INSERT INTO comments (id, post_slug, author_name, author_email, content, parent_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        reply.id,
        reply.post_slug,
        reply.author_name,
        reply.author_email,
        reply.content,
        reply.parent_id,
        reply.status,
        reply.created_at
      );
  }

  // 统计结果
  const totalComments = sqlite.query('SELECT COUNT(*) as count FROM comments').get() as { count: number };
  const totalUsers = sqlite.query('SELECT COUNT(*) as count FROM users').get() as { count: number };

  const statusStats = sqlite
    .query(`
    SELECT status, COUNT(*) as count 
    FROM comments 
    GROUP BY status
  `)
    .all() as { status: string; count: number }[];

  console.log('\n✅ Test data created successfully!');
  console.log(`📊 Total users: ${totalUsers.count}`);
  console.log(`📊 Total comments: ${totalComments.count}`);
  console.log('\n📈 Comments by status:');
  statusStats.forEach((stat) => {
    console.log(`  ${stat.status}: ${stat.count}`);
  });

  sqlite.close();
} catch (error) {
  console.error('Failed to create test data:', error);
  process.exit(1);
}
