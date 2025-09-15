CREATE TABLE `post_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`model_name` text NOT NULL,
	`dim` integer NOT NULL,
	`content_hash` text NOT NULL,
	`chunk_index` integer,
	`vector` blob,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_embeddings_uq_post_model_chunk` ON `post_embeddings` (`post_id`,`model_name`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `post_embeddings_idx_slug_model` ON `post_embeddings` (`slug`,`model_name`);--> statement-breakpoint
CREATE INDEX `post_embeddings_idx_type_model` ON `post_embeddings` (`type`,`model_name`);