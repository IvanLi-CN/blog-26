CREATE TABLE `readers` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` text NOT NULL,
	`github_login` text NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`profile_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `readers_github_id_unique` ON `readers` (`github_id`);
--> statement-breakpoint
CREATE INDEX `readers_github_login_idx` ON `readers` (`github_login`);
--> statement-breakpoint
CREATE TABLE `reader_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`reader_id` text NOT NULL REFERENCES `readers`(`id`) ON DELETE CASCADE,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reader_sessions_token_unique` ON `reader_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `reader_sessions_reader_idx` ON `reader_sessions` (`reader_id`);
--> statement-breakpoint
CREATE INDEX `reader_sessions_expiry_idx` ON `reader_sessions` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `reader_oauth_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`state_hash` text NOT NULL,
	`code_verifier` text NOT NULL,
	`return_to` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`consumed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reader_oauth_attempts_state_unique` ON `reader_oauth_attempts` (`state_hash`);
--> statement-breakpoint
CREATE INDEX `reader_oauth_attempts_expiry_idx` ON `reader_oauth_attempts` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `comments_reader_migration` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`post_slug` text NOT NULL,
	`target_type` text DEFAULT 'article' NOT NULL,
	`target_key` text DEFAULT '' NOT NULL,
	`author_name` text NOT NULL,
	`author_email` text,
	`reader_id` text REFERENCES `readers`(`id`) ON DELETE SET NULL,
	`parent_id` text,
	`root_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`deleted_at` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`submission_key` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `comments_reader_migration` (
	`id`, `content`, `post_slug`, `target_type`, `target_key`, `author_name`, `author_email`,
	`parent_id`, `status`, `created_at`
)
SELECT `id`, `content`, `post_slug`, 'article', `post_slug`, `author_name`, `author_email`,
	`parent_id`, `status`, `created_at`
FROM `comments`;
--> statement-breakpoint
WITH RECURSIVE comment_roots(`id`, `root_id`, `target_type`, `target_key`) AS (
	SELECT `id`, `id`, `target_type`, `target_key`
	FROM `comments_reader_migration`
	WHERE `parent_id` IS NULL
	UNION ALL
	SELECT child.`id`, roots.`root_id`, child.`target_type`, child.`target_key`
	FROM `comments_reader_migration` AS child
	INNER JOIN comment_roots AS roots
		ON child.`parent_id` = roots.`id`
		AND child.`target_type` = roots.`target_type`
		AND child.`target_key` = roots.`target_key`
)
UPDATE `comments_reader_migration`
SET `root_id` = (
	SELECT `root_id` FROM comment_roots WHERE comment_roots.`id` = `comments_reader_migration`.`id`
);
--> statement-breakpoint
DROP TABLE `comments`;
--> statement-breakpoint
ALTER TABLE `comments_reader_migration` RENAME TO `comments`;
--> statement-breakpoint
CREATE INDEX `comments_target_status_idx` ON `comments` (`target_type`, `target_key`, `status`, `created_at`);
--> statement-breakpoint
CREATE INDEX `comments_reader_idx` ON `comments` (`reader_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `comments_root_idx` ON `comments` (`root_id`, `created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `comments_reader_submission_unique` ON `comments` (`reader_id`, `submission_key`);
