CREATE TABLE `content_sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_name` text NOT NULL,
	`operation` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`file_path` text,
	`data` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_sync_status` (
	`source_type` text PRIMARY KEY NOT NULL,
	`source_name` text NOT NULL,
	`last_sync_at` integer,
	`status` text DEFAULT 'idle' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`current_step` text,
	`total_items` integer DEFAULT 0 NOT NULL,
	`processed_items` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`metadata` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memos` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`author_email` text NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`attachments` text,
	`tags` text,
	`source_path` text,
	`data_source` text,
	`content_hash` text NOT NULL
);
