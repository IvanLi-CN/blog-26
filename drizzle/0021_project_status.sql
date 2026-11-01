CREATE TABLE `project_status_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`entry_key` text NOT NULL,
	`project_slug` text NOT NULL,
	`project_title` text NOT NULL,
	`domain` text NOT NULL,
	`entry_kind` text NOT NULL,
	`entry_label` text NOT NULL,
	`href` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`attempted` integer DEFAULT false NOT NULL,
	`http_status` integer,
	`final_url` text,
	`redirected` integer DEFAULT false NOT NULL,
	`latency_ms` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`error_kind` text,
	`error_message` text,
	`checked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_status_results_uq_run_entry` ON `project_status_results` (`run_id`,`entry_key`);--> statement-breakpoint
CREATE INDEX `project_status_results_idx_run` ON `project_status_results` (`run_id`);--> statement-breakpoint
CREATE INDEX `project_status_results_idx_entry` ON `project_status_results` (`entry_key`);--> statement-breakpoint
CREATE INDEX `project_status_results_idx_checked` ON `project_status_results` (`checked_at`);--> statement-breakpoint
CREATE TABLE `project_status_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`triggered_by` text DEFAULT 'scheduler' NOT NULL,
	`target_count` integer DEFAULT 0 NOT NULL,
	`attempted_count` integer DEFAULT 0 NOT NULL,
	`available_count` integer DEFAULT 0 NOT NULL,
	`unavailable_count` integer DEFAULT 0 NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `project_status_runs_idx_status_time` ON `project_status_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `project_status_runs_idx_started_time` ON `project_status_runs` (`started_at`);