import { relations } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 适配实际数据库结构
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at").notNull(),
});

// 临时适配现有数据库schema
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  postSlug: text("post_slug").notNull(),
  authorName: text("author_name").notNull(),
  authorEmail: text("author_email").notNull(),
  parentId: text("parent_id"),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at").notNull(),
});

// 文章缓存表
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(), // 文件路径作为唯一标识
  slug: text("slug").notNull(),
  type: text("type").notNull(), // post/project
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  body: text("body").notNull(), // markdown 纯文本内容
  publishDate: integer("publish_date").notNull(),
  updateDate: integer("update_date"),
  draft: integer("draft", { mode: "boolean" }).notNull().default(false),
  public: integer("public", { mode: "boolean" }).notNull().default(false),
  category: text("category"),
  tags: text("tags"), // JSON 字符串存储标签数组
  author: text("author"),
  image: text("image"),
  metadata: text("metadata"), // JSON 字符串存储其他元数据
  dataSource: text("data_source"), // local/webdav/database
  contentHash: text("content_hash").notNull(),
});

// 向量化文件表
export const vectorizedFiles = sqliteTable("vectorized_files", {
  filepath: text("filepath").primaryKey(),
  slug: text("slug").notNull(),
  contentHash: text("content_hash").notNull(),
  lastModifiedTime: integer("last_modified_time").notNull(),
  contentUpdatedAt: integer("content_updated_at").notNull(),
  indexedAt: integer("indexed_at").notNull(),
  modelName: text("model_name").notNull(),
  vector: blob("vector"), // BLOB 类型存储向量 embeddings
  errorMessage: text("error_message"), // 向量化失败原因
});

// 反应表
export const reactions = sqliteTable("reactions", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(), // post/comment
  targetId: text("target_id").notNull(),
  userEmail: text("user_email").notNull(),
  emoji: text("emoji").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const emailVerificationCodes = sqliteTable("email_verification_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: integer("expires_at").notNull(), // UNIX timestamp
});

// 关系定义
export const usersRelations = relations(users, ({ many }) => ({
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "replies",
  }),
  replies: many(comments, {
    relationName: "replies",
  }),
}));

export const reactionsRelations = relations(reactions, ({ one }) => ({
  author: one(users, {
    fields: [reactions.userEmail],
    references: [users.email],
  }),
}));

// 类型导出
export type VectorizedFile = typeof vectorizedFiles.$inferSelect; // Infer type for selecting data
export type NewVectorizedFile = typeof vectorizedFiles.$inferInsert; // Infer type for inserting data
