-- 修复 posts 表缺失的字段
-- 添加 last_modified, source, file_path 字段

ALTER TABLE `posts` ADD COLUMN `last_modified` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `source` text NOT NULL DEFAULT 'local';
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `file_path` text NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_posts_last_modified` ON `posts`(`last_modified`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_posts_source` ON `posts`(`source`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_posts_file_path` ON `posts`(`file_path`);
