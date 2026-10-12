CREATE TABLE `system_share_submissions` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`memo_id` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
