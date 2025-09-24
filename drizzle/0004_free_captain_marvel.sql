CREATE TABLE `personal_access_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `label` text,
  `token_hash` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `revoked_at` integer,
  `last_used_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pat_token_unique` ON `personal_access_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `pat_user_idx` ON `personal_access_tokens` (`user_id`);
--> statement-breakpoint
CREATE INDEX `pat_revoked_idx` ON `personal_access_tokens` (`revoked_at`);
