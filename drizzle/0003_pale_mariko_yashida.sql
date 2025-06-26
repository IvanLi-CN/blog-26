CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`emoji` text NOT NULL,
	`user_id` text,
	`fingerprint` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reactions_target_type_target_id_emoji_user_id_fingerprint_unique` ON `reactions` (`target_type`,`target_id`,`emoji`,`user_id`,`fingerprint`);