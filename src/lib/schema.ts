import { relations } from 'drizzle-orm';
import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  nickname: text('nickname').notNull().unique(),
  email: text('email').notNull().unique(),
  ipAddress: text('ip_address').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  postSlug: text('post_slug').notNull(),
  authorId: text('author_id')
    .notNull()
    .references(() => users.id),
  parentId: text('parent_id'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  ipAddress: text('ip_address').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
  }),
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
});

export type VectorizedFile = typeof vectorizedFiles.$inferSelect; // Infer type for selecting data
export type NewVectorizedFile = typeof vectorizedFiles.$inferInsert; // Infer type for inserting data
