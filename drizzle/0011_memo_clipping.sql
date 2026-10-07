CREATE TABLE `memo_clippings` (
  `id` text PRIMARY KEY NOT NULL,
  `memo_id` text NOT NULL UNIQUE,
  `creator_id` text,
  `revision` integer NOT NULL,
  `enabled` integer NOT NULL,
  `deleted` integer NOT NULL DEFAULT 0,
  `target_url` text,
  `current_version_id` text,
  `conversation_id` text,
  `manifest` text NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memo_clipping_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `clipping_id` text NOT NULL,
  `revision` integer NOT NULL,
  `target_url` text NOT NULL,
  `created_at` integer NOT NULL,
  `status` text NOT NULL,
  `metadata` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `memo_clipping_versions_clipping_idx` ON `memo_clipping_versions` (`clipping_id`);
