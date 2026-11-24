ALTER TABLE `content_tasks` ADD `operation` text;
--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `skipped` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `blocked` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `conflicts` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `media_total` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `media_processed` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `media_failed` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `current_path` text;
--> statement-breakpoint
ALTER TABLE `content_tasks` ADD `updated_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `content_tasks` SET `operation` = 'push', `updated_at` = `started_at` WHERE `source` = 'content-repo';
--> statement-breakpoint
CREATE TABLE `content_task_items` (
	`task_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`path` text NOT NULL,
	`content_id` text,
	`kind` text,
	`status` text NOT NULL,
	`reason` text,
	`error` text,
	`media_total` integer NOT NULL DEFAULT 0,
	`media_processed` integer NOT NULL DEFAULT 0,
	`media_failed` integer NOT NULL DEFAULT 0,
	`retryable` integer NOT NULL DEFAULT 1,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`task_id`, `path`)
);
--> statement-breakpoint
CREATE INDEX `content_task_items_task_order` ON `content_task_items` (`task_id`,`ordinal`);
--> statement-breakpoint
CREATE INDEX `content_task_items_task_status` ON `content_task_items` (`task_id`,`status`);
