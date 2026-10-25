CREATE TABLE `playbook_snapshots` (
	`slot` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`repository` text NOT NULL,
	`ref` text NOT NULL,
	`commit` text NOT NULL,
	`content_hash` text NOT NULL,
	`catalog` text NOT NULL,
	`search` text NOT NULL,
	`checked_at` integer NOT NULL,
	`adopted_at` integer NOT NULL,
	`task_id` text
);
--> statement-breakpoint
CREATE INDEX `playbook_snapshots_source_time` ON `playbook_snapshots` (`provider`,`checked_at`);