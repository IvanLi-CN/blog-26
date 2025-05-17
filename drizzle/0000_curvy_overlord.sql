CREATE TABLE `vectorized_files` (
	`filepath` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`content_hash` text NOT NULL,
	`last_modified_time` integer NOT NULL,
	`content_updated_at` integer NOT NULL,
	`indexed_at` integer NOT NULL,
	`vector` blob
);
