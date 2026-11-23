CREATE TABLE `content_media` (
	`path` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`bytes` integer NOT NULL,
	`mime` text,
	`updated_at` integer NOT NULL
);
