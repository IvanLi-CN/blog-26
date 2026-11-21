CREATE TABLE `content_repo_baselines` (
	`path` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`kind` text NOT NULL,
	`content_hash` text NOT NULL,
	`media` text NOT NULL,
	`remote_blobs` text NOT NULL,
	`commit_sha` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_repo_baselines_content` ON `content_repo_baselines` (`content_id`);
