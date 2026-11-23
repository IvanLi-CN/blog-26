import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One row per completed authority cutover. Presence of the `database` row means
 * the content library is authoritative and local scanning must stay disabled.
 */
export const contentAuthority = sqliteTable("content_authority", {
  id: text("id").primaryKey(),
  authority: text("authority").notNull(),
  sourceRoot: text("source_root").notNull(),
  documentCount: integer("document_count").notNull(),
  mediaCount: integer("media_count").notNull(),
  completedAt: integer("completed_at").notNull(),
});
