ALTER TABLE `ai_usage_daily_summaries` ADD `success_call_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_usage_daily_summaries` ADD `failure_call_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_usage_daily_summaries` ADD `cancelled_call_count` integer DEFAULT 0 NOT NULL;