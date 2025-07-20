import { relations } from 'drizzle-orm';
import { blob, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  nickname: text('nickname').notNull().unique(),
  email: text('email').notNull().unique(),
  ipAddress: text('ip_address').notNull(),
  createdAt: integer('created_at').notNull(),
});

// 临时适配现有数据库schema
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  postSlug: text('post_slug').notNull(),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull(),
  parentId: text('parent_id'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  createdAt: integer('created_at').notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'replies',
  }),
  replies: many(comments, {
    relationName: 'replies',
  }),
}));

export const emailVerificationCodes = sqliteTable('email_verification_codes', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  code: text('code').notNull(),
  expiresAt: integer('expires_at').notNull(), // UNIX timestamp
});

export const vectorizedFiles = sqliteTable('vectorized_files', {
  filepath: text('filepath').primaryKey(),
  slug: text('slug').notNull(),
  contentHash: text('content_hash').notNull(),
  lastModifiedTime: integer('last_modified_time').notNull(),
  contentUpdatedAt: integer('content_updated_at').notNull(),
  indexedAt: integer('indexed_at').notNull(),
  modelName: text('model_name').notNull(),
  vector: blob('vector'), // BLOB type for vector embeddings
  errorMessage: text('error_message'), // 向量化失败原因
});

export type VectorizedFile = typeof vectorizedFiles.$inferSelect; // Infer type for selecting data
export type NewVectorizedFile = typeof vectorizedFiles.$inferInsert; // Infer type for inserting data

export const reactions = sqliteTable(
  'reactions',
  {
    id: text('id').primaryKey(),
    targetType: text('target_type', { enum: ['post', 'comment'] }).notNull(),
    targetId: text('target_id').notNull(),
    emoji: text('emoji').notNull(),
    userId: text('user_id').references(() => users.id),
    fingerprint: text('fingerprint'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    unq: unique().on(table.targetType, table.targetId, table.emoji, table.userId, table.fingerprint),
  })
);

export const reactionsRelations = relations(reactions, ({ one }) => ({
  author: one(users, {
    fields: [reactions.userId],
    references: [users.id],
  }),
}));

// 文章缓存表 - 包括博客文章和项目文章
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), // 文件路径作为唯一标识
  slug: text('slug').notNull(),
  type: text('type', { enum: ['post', 'project'] }).notNull(),
  title: text('title').notNull(),
  excerpt: text('excerpt'),
  body: text('body').notNull(), // markdown 纯文本内容
  publishDate: integer('publish_date').notNull(), // UNIX timestamp
  updateDate: integer('update_date'), // UNIX timestamp
  draft: integer('draft', { mode: 'boolean' }).notNull().default(false),
  public: integer('public', { mode: 'boolean' }).notNull().default(true),
  category: text('category'),
  tags: text('tags'), // JSON 字符串存储标签数组
  author: text('author'),
  image: text('image'),
  metadata: text('metadata'), // JSON 字符串存储其他元数据
  contentHash: text('content_hash').notNull(), // 内容哈希，用于检测变更
  etag: text('etag'), // WebDAV ETag，用于检测文件变更
  lastModified: integer('last_modified').notNull(), // UNIX timestamp
  createdAt: integer('created_at').notNull(), // 缓存创建时间
  updatedAt: integer('updated_at').notNull(), // 缓存更新时间
});

// 闪念缓存表
export const memos = sqliteTable('memos', {
  id: text('id').primaryKey(), // 文件路径作为唯一标识
  slug: text('slug').notNull(),
  title: text('title'), // 从内容第一个 H1 提取或为空
  body: text('body').notNull(), // markdown 纯文本内容
  publishDate: integer('publish_date').notNull(), // UNIX timestamp，通常是创建时间
  updateDate: integer('update_date'), // UNIX timestamp
  public: integer('public', { mode: 'boolean' }).notNull().default(true),
  tags: text('tags'), // JSON 字符串存储标签数组
  attachments: text('attachments'), // JSON 字符串存储附件信息
  contentHash: text('content_hash').notNull(), // 内容哈希，用于检测变更
  etag: text('etag'), // WebDAV ETag，用于检测文件变更
  lastModified: integer('last_modified').notNull(), // UNIX timestamp
  createdAt: integer('created_at').notNull(), // 缓存创建时间
  updatedAt: integer('updated_at').notNull(), // 缓存更新时间
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Memo = typeof memos.$inferSelect;
export type NewMemo = typeof memos.$inferInsert;
