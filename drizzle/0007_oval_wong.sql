PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`post_slug` text NOT NULL,
	`author_name` text NOT NULL,
	`author_email` text NOT NULL,
	`parent_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_comments`("id", "content", "post_slug", "author_name", "author_email", "parent_id", "status", "created_at") SELECT "id", "content", "post_slug", "author_name", "author_email", "parent_id", "status", "created_at" FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;