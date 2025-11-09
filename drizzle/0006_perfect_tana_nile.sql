CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`category_key` text,
	`category_title` text,
	`icon` text,
	`description` text DEFAULT '' NOT NULL,
	`post_count` integer DEFAULT 0 NOT NULL,
	`memo_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
