CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_key` text NOT NULL,
	`job_name` text NOT NULL,
	`status` text NOT NULL,
	`triggered_by` text DEFAULT 'scheduler' NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`log_path` text NOT NULL,
	`log_deleted` integer DEFAULT false NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `job_runs_idx_job_time` ON `job_runs` (`job_key`,`started_at`);--> statement-breakpoint
CREATE INDEX `job_runs_idx_status` ON `job_runs` (`status`);