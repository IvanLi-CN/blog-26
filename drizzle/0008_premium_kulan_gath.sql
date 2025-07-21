PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_memos` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`publish_date` integer NOT NULL,
	`update_date` integer,
	`public` integer DEFAULT false NOT NULL,
	`tags` text,
	`attachments` text,
	`content_hash` text NOT NULL,
	`etag` text,
	`last_modified` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_memos`("id", "slug", "title", "body", "publish_date", "update_date", "public", "tags", "attachments", "content_hash", "etag", "last_modified", "created_at", "updated_at") SELECT "id", "slug", "title", "body", "publish_date", "update_date", "public", "tags", "attachments", "content_hash", "etag", "last_modified", "created_at", "updated_at" FROM `memos`;--> statement-breakpoint
DROP TABLE `memos`;--> statement-breakpoint
ALTER TABLE `__new_memos` RENAME TO `memos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text,
	`body` text NOT NULL,
	`publish_date` integer NOT NULL,
	`update_date` integer,
	`draft` integer DEFAULT false NOT NULL,
	`public` integer DEFAULT false NOT NULL,
	`category` text,
	`tags` text,
	`author` text,
	`image` text,
	`metadata` text,
	`content_hash` text NOT NULL,
	`etag` text,
	`last_modified` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_posts`("id", "slug", "type", "title", "excerpt", "body", "publish_date", "update_date", "draft", "public", "category", "tags", "author", "image", "metadata", "content_hash", "etag", "last_modified", "created_at", "updated_at") SELECT "id", "slug", "type", "title", "excerpt", "body", "publish_date", "update_date", "draft", "public", "category", "tags", "author", "image", "metadata", "content_hash", "etag", "last_modified", "created_at", "updated_at" FROM `posts`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
ALTER TABLE `__new_posts` RENAME TO `posts`;