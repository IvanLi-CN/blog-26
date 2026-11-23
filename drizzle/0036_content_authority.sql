CREATE TABLE IF NOT EXISTS `content_authority` (
	`id` text PRIMARY KEY NOT NULL,
	`authority` text NOT NULL,
	`source_root` text NOT NULL,
	`document_count` integer NOT NULL,
	`media_count` integer NOT NULL,
	`completed_at` integer NOT NULL
);
