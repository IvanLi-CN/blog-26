import {
  blob,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const post = sqliteTable(
  "post",
  {
    id: text("slug").primaryKey(),
    title: text("title"),
    content: blob("content"),
    content_hash: text("content_hash"),
    updated_at: integer("updated_at"),
  },
  (post) => ({
    titleIdx: uniqueIndex("titleIdx").on(post.title),
  }),
);

export type Post = typeof post.$inferSelect;
