CREATE TABLE `memos` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`publish_date` integer NOT NULL,
	`update_date` integer,
	`public` integer DEFAULT true NOT NULL,
	`tags` text,
	`attachments` text,
	`content_hash` text NOT NULL,
	`last_modified` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
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
	`public` integer DEFAULT true NOT NULL,
	`category` text,
	`tags` text,
	`author` text,
	`image` text,
	`metadata` text,
	`content_hash` text NOT NULL,
	`last_modified` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
