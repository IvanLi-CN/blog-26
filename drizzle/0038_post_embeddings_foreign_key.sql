-- Delete orphan vectors and enforce ownership through a real foreign key (ADR 0045).
-- `post_id` must equal `posts.id` verbatim for the constraint to hold, but legacy rows were
-- written with a leading slash. Normalize before comparing: deleting on the raw value would
-- discard valid vectors for posts that still exist.
-- A row whose key equals a real posts.id verbatim is never an orphan, even when that id
-- starts with a slash, so the guard tests the raw key as well as the normalised one.
DELETE FROM `post_embeddings`
WHERE `post_id` NOT IN (SELECT `id` FROM `posts`)
  AND ltrim(`post_id`, '/') NOT IN (SELECT `id` FROM `posts`);
--> statement-breakpoint
-- Slashed rows that normalise onto the same key are the same vector. Keep one of them and drop
-- the rest; without this the normalize below collides with the unique index. A row without a
-- leading slash wins, otherwise the lowest rowid wins.
DELETE FROM `post_embeddings`
WHERE `post_id` LIKE '/%'
  AND EXISTS (
    SELECT 1 FROM `post_embeddings` AS `twin`
    WHERE ltrim(`twin`.`post_id`, '/') = ltrim(`post_embeddings`.`post_id`, '/')
      AND `twin`.`model_name` = `post_embeddings`.`model_name`
      AND `twin`.`chunk_index` IS `post_embeddings`.`chunk_index`
      AND (
        `twin`.`post_id` NOT LIKE '/%'
        OR (`twin`.`post_id` LIKE '/%' AND `twin`.`rowid` < `post_embeddings`.`rowid`)
      )
  );
--> statement-breakpoint
-- Only rewrite keys that are not already a verbatim posts.id.
UPDATE `post_embeddings` SET `post_id` = ltrim(`post_id`, '/')
WHERE `post_id` LIKE '/%' AND `post_id` NOT IN (SELECT `id` FROM `posts`);
--> statement-breakpoint
CREATE TABLE `post_embeddings_new` (
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
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `post_embeddings_new` (`id`, `post_id`, `slug`, `type`, `model_name`, `dim`, `content_hash`, `chunk_index`, `vector`, `error_message`, `created_at`, `updated_at`)
SELECT `id`, `post_id`, `slug`, `type`, `model_name`, `dim`, `content_hash`, `chunk_index`, `vector`, `error_message`, `created_at`, `updated_at` FROM `post_embeddings`;
--> statement-breakpoint
DROP TABLE `post_embeddings`;
--> statement-breakpoint
ALTER TABLE `post_embeddings_new` RENAME TO `post_embeddings`;
--> statement-breakpoint
CREATE UNIQUE INDEX `post_embeddings_uq_post_model_chunk` ON `post_embeddings` (`post_id`,`model_name`,`chunk_index`);
--> statement-breakpoint
CREATE INDEX `post_embeddings_idx_slug_model` ON `post_embeddings` (`slug`,`model_name`);
--> statement-breakpoint
CREATE INDEX `post_embeddings_idx_type_model` ON `post_embeddings` (`type`,`model_name`);
