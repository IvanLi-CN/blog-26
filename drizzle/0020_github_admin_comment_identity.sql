ALTER TABLE `reader_oauth_attempts` ADD COLUMN `purpose` text DEFAULT 'reader_login' NOT NULL;
--> statement-breakpoint
ALTER TABLE `reader_oauth_attempts` ADD COLUMN `admin_user_id` text;
--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `author_role` text DEFAULT 'reader' NOT NULL;
--> statement-breakpoint
ALTER TABLE `comments` ADD COLUMN `author_github_id` text;
--> statement-breakpoint
CREATE TABLE `admin_github_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`github_id` text NOT NULL,
	`github_login` text NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`profile_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_github_bindings_admin_unique` ON `admin_github_bindings` (`admin_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_github_bindings_github_unique` ON `admin_github_bindings` (`github_id`);
--> statement-breakpoint
CREATE TABLE `admin_github_binding_events` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text NOT NULL,
	`github_id` text,
	`action` text NOT NULL,
	`result` text NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_github_binding_events_admin_time_idx` ON `admin_github_binding_events` (`admin_user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `admin_github_binding_events_github_time_idx` ON `admin_github_binding_events` (`github_id`, `created_at`);
