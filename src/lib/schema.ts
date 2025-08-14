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

// 内容同步日志表
export const contentSyncLogs = sqliteTable("content_sync_logs", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(), // local/webdav
  sourceName: text("source_name").notNull(),
  operation: text("operation").notNull(), // sync/create/update/delete
  status: text("status", { enum: ["success", "error", "warning"] }).notNull(),
  message: text("message").notNull(),
  filePath: text("file_path"), // 相关文件路径
  data: text("data"), // JSON 格式的额外数据
  createdAt: integer("created_at").notNull(),
});

// 内容同步状态表
export const contentSyncStatus = sqliteTable("content_sync_status", {
  sourceType: text("source_type").primaryKey(), // local/webdav
  sourceName: text("source_name").notNull(),
  lastSyncAt: integer("last_sync_at"),
  status: text("status", { enum: ["idle", "running", "success", "error", "cancelled"] })
    .notNull()
    .default("idle"),
  progress: integer("progress").notNull().default(0), // 0-100
  currentStep: text("current_step"),
  totalItems: integer("total_items").notNull().default(0),
  processedItems: integer("processed_items").notNull().default(0),
  errorMessage: text("error_message"),
  metadata: text("metadata"), // JSON 格式的额外状态信息
  updatedAt: integer("updated_at").notNull(),
});

// Memos 表 - 完全兼容 ContentItem 接口
export const memos = sqliteTable("memos", {
  // ContentItem 核心字段
  id: text("id").primaryKey(), // 唯一标识符（文件路径）
  type: text("type").notNull().default("memo"), // 内容类型，固定为 "memo"
  slug: text("slug").notNull(), // URL 友好标识符
  title: text("title"), // 标题（可选，从内容提取）
  excerpt: text("excerpt"), // 摘要/描述
  contentHash: text("content_hash").notNull(), // 内容哈希值
  lastModified: integer("last_modified").notNull(), // 最后修改时间
  source: text("source").notNull(), // 内容源标识 (local/webdav)
  filePath: text("file_path").notNull(), // 原始文件路径
  draft: integer("draft", { mode: "boolean" }).notNull().default(false), // 是否为草稿
  public: integer("public", { mode: "boolean" }).notNull().default(true), // 是否公开
  publishDate: integer("publish_date").notNull(), // 发布日期
  updateDate: integer("update_date"), // 更新日期
  category: text("category"), // 分类
  tags: text("tags"), // JSON 存储标签数组
  author: text("author"), // 作者
  image: text("image"), // 封面图片
  metadata: text("metadata"), // JSON 存储其他元数据

  // Memo 特有字段
  content: text("content").notNull(), // Markdown 内容
  authorEmail: text("author_email").notNull(), // 作者邮箱
  attachments: text("attachments"), // JSON 存储附件信息

  // 兼容旧字段（保持向后兼容）
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true), // 兼容旧的 public 字段
  createdAt: integer("created_at").notNull(), // 兼容旧的创建时间
  updatedAt: integer("updated_at"), // 兼容旧的更新时间
  sourcePath: text("source_path"), // 兼容旧的源路径字段
  dataSource: text("data_source"), // 兼容旧的数据源字段
});

// 类型导出
export type VectorizedFile = typeof vectorizedFiles.$inferSelect; // Infer type for selecting data
export type NewVectorizedFile = typeof vectorizedFiles.$inferInsert; // Infer type for inserting data

export type ContentSyncLog = typeof contentSyncLogs.$inferSelect;
export type NewContentSyncLog = typeof contentSyncLogs.$inferInsert;

export type ContentSyncStatus = typeof contentSyncStatus.$inferSelect;
export type NewContentSyncStatus = typeof contentSyncStatus.$inferInsert;

export type Memo = typeof memos.$inferSelect;
export type NewMemo = typeof memos.$inferInsert;
