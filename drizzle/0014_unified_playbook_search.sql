CREATE TABLE `search_semantic_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`content_id` text NOT NULL,
	`parent_id` text NOT NULL,
	`type` text NOT NULL,
	`slug` text NOT NULL,
	`edition_digest` text,
	`source_release_id` text,
	`source_tag` text,
	`location` text,
	`chunk_index` integer DEFAULT 0 NOT NULL,
	`model_name` text NOT NULL,
	`dim` integer NOT NULL,
	`content_hash` text NOT NULL,
	`vector` blob,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_semantic_embeddings_identity` ON `search_semantic_embeddings` (`source`,`parent_id`,`edition_digest`,`source_release_id`,`source_tag`,`model_name`,`chunk_index`);
--> statement-breakpoint
CREATE INDEX `search_semantic_embeddings_source_model_idx` ON `search_semantic_embeddings` (`source`,`model_name`);
--> statement-breakpoint
CREATE INDEX `search_semantic_embeddings_edition_idx` ON `search_semantic_embeddings` (`edition_digest`,`source_release_id`,`source_tag`);
