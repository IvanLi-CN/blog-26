CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`post_slug` text NOT NULL,
	`author_name` text NOT NULL,
	`author_email` text NOT NULL,
	`parent_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `email_verification_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
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
	`data_source` text,
	`content_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`user_email` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `vectorized_files` (
	`filepath` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`content_hash` text NOT NULL,
	`last_modified_time` integer NOT NULL,
	`content_updated_at` integer NOT NULL,
	`indexed_at` integer NOT NULL,
	`model_name` text NOT NULL,
	`vector` blob,
	`error_message` text
);
