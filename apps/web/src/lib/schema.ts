import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const vectorizedFiles = sqliteTable('vectorized_files', {
  filepath: text('filepath').primaryKey(),
  slug: text('slug').notNull(),
  contentHash: text('content_hash').notNull(),
  lastModifiedTime: integer('last_modified_time').notNull(),
  contentUpdatedAt: integer('content_updated_at').notNull(),
  indexedAt: integer('indexed_at').notNull(),
  vector: blob('vector'), // BLOB type for vector embeddings
});

export type VectorizedFile = typeof vectorizedFiles.$inferSelect; // Infer type for selecting data
export type NewVectorizedFile = typeof vectorizedFiles.$inferInsert; // Infer type for inserting data
