CREATE TABLE `ai_usage_daily_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`timezone` text NOT NULL,
	`frontend_user_id` text,
	`feature` text NOT NULL,
	`provider` text,
	`model` text,
	`call_count` integer DEFAULT 0 NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_call_count` integer DEFAULT 0 NOT NULL,
	`incomplete_call_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`frontend_user_id`) REFERENCES `frontend_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_daily_summaries_dimension_unique` ON `ai_usage_daily_summaries` (`day`,`timezone`,`frontend_user_id`,`feature`,`provider`,`model`);--> statement-breakpoint
CREATE INDEX `ai_usage_daily_summaries_day_idx` ON `ai_usage_daily_summaries` (`day`);--> statement-breakpoint
CREATE TABLE `ai_usage_records` (
	`id` text PRIMARY KEY NOT NULL,
	`frontend_user_id` text,
	`conversation_id` text,
	`generation_job_id` text,
	`feature` text NOT NULL,
	`provider` text,
	`model` text,
	`status` text NOT NULL,
	`input_tokens` integer,
	`cached_input_tokens` integer,
	`output_tokens` integer,
	`reasoning_tokens` integer,
	`total_tokens` integer,
	`estimated` integer DEFAULT false NOT NULL,
	`usage_complete` integer DEFAULT false NOT NULL,
	`idempotency_key` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`raw_usage` text,
	FOREIGN KEY (`frontend_user_id`) REFERENCES `frontend_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`generation_job_id`) REFERENCES `assistant_generation_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_records_idempotency_unique` ON `ai_usage_records` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `ai_usage_records_occurred_idx` ON `ai_usage_records` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_records_user_occurred_idx` ON `ai_usage_records` (`frontend_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_records_feature_idx` ON `ai_usage_records` (`feature`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `assistant_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`frontend_user_id` text NOT NULL,
	`kind` text DEFAULT 'general' NOT NULL,
	`title` text,
	`clipping_memo_id` text,
	`clipping_version_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`last_user_message_at` integer,
	`expires_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`frontend_user_id`) REFERENCES `frontend_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_conversations_owner_time_idx` ON `assistant_conversations` (`frontend_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `assistant_conversations_status_expiry_idx` ON `assistant_conversations` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `assistant_conversations_clipping_idx` ON `assistant_conversations` (`frontend_user_id`,`clipping_memo_id`,`clipping_version_id`);--> statement-breakpoint
CREATE TABLE `assistant_generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_message_id` text,
	`assistant_message_id` text,
	`request_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`lease_until` integer,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_message_id`) REFERENCES `assistant_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assistant_message_id`) REFERENCES `assistant_messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_generation_jobs_request_unique` ON `assistant_generation_jobs` (`request_id`);--> statement-breakpoint
CREATE INDEX `assistant_generation_jobs_conversation_idx` ON `assistant_generation_jobs` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `assistant_generation_jobs_status_lease_idx` ON `assistant_generation_jobs` (`status`,`lease_until`);--> statement-breakpoint
CREATE TABLE `assistant_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`client_request_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_messages_conversation_sequence_unique` ON `assistant_messages` (`conversation_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `assistant_messages_conversation_idx` ON `assistant_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `assistant_messages_request_idx` ON `assistant_messages` (`conversation_id`,`client_request_id`);--> statement-breakpoint
CREATE TABLE `assistant_migration_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`source_version` text NOT NULL,
	`cursor` text,
	`scanned` integer DEFAULT 0 NOT NULL,
	`migrated` integer DEFAULT 0 NOT NULL,
	`quarantined` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `assistant_quota_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`token_hourly_limit` integer NOT NULL,
	`token_weekly_limit` integer NOT NULL,
	`question_hourly_limit` integer NOT NULL,
	`question_weekly_limit` integer NOT NULL,
	`max_conversations` integer NOT NULL,
	`retention_ms` integer NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_quota_policies_scope_unique` ON `assistant_quota_policies` (`scope`);--> statement-breakpoint
CREATE TABLE `assistant_quota_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`frontend_user_id` text NOT NULL,
	`reason` text NOT NULL,
	`reset_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`frontend_user_id`) REFERENCES `frontend_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_quota_resets_user_time_idx` ON `assistant_quota_resets` (`frontend_user_id`,`reset_at`);--> statement-breakpoint
CREATE TABLE `frontend_identity_links` (
	`id` text PRIMARY KEY NOT NULL,
	`frontend_user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`provider_login` text,
	`admin_user_id` text,
	`reader_id` text,
	`display_name` text,
	`email` text,
	`avatar_url` text,
	`profile_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`frontend_user_id`) REFERENCES `frontend_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reader_id`) REFERENCES `readers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frontend_identity_links_provider_subject_unique` ON `frontend_identity_links` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE INDEX `frontend_identity_links_frontend_user_idx` ON `frontend_identity_links` (`frontend_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `frontend_identity_links_admin_user_unique` ON `frontend_identity_links` (`admin_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `frontend_identity_links_reader_unique` ON `frontend_identity_links` (`reader_id`);--> statement-breakpoint
CREATE TABLE `frontend_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`frontend_user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`frontend_user_id`) REFERENCES `frontend_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frontend_sessions_token_unique` ON `frontend_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `frontend_sessions_user_idx` ON `frontend_sessions` (`frontend_user_id`);--> statement-breakpoint
CREATE INDEX `frontend_sessions_expiry_idx` ON `frontend_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `frontend_users` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_user_id` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`avatar_url` text NOT NULL,
	`profile_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `frontend_users_admin_user_unique` ON `frontend_users` (`admin_user_id`);--> statement-breakpoint
CREATE INDEX `frontend_users_admin_idx` ON `frontend_users` (`is_admin`);--> statement-breakpoint
ALTER TABLE `comments` ADD `frontend_user_id` text REFERENCES frontend_users(id);--> statement-breakpoint
CREATE INDEX `comments_frontend_user_idx` ON `comments` (`frontend_user_id`,`created_at`);
