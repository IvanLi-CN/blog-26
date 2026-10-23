CREATE TABLE `comment_migration_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`scanned` integer DEFAULT 0 NOT NULL,
	`repaired` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`last_error` text
);
--> statement-breakpoint
INSERT INTO `comment_migration_state` (`id`, `status`, `updated_at`)
VALUES ('reader-comments', 'pending', 0);
