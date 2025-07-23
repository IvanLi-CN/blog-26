PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`user_email` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_email`) REFERENCES `users`(`email`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_reactions`("id", "target_type", "target_id", "user_email", "emoji", "created_at") SELECT "id", "target_type", "target_id", "user_email", "emoji", "created_at" FROM `reactions`;--> statement-breakpoint
DROP TABLE `reactions`;--> statement-breakpoint
ALTER TABLE `__new_reactions` RENAME TO `reactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `users` ADD `name` text;--> statement-breakpoint
UPDATE `users` SET `name` = `nickname`;--> statement-breakpoint
DROP INDEX `users_nickname_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `nickname`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `ip_address`;
