CREATE TABLE `assistant_message_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`source_type` text,
	`slug` text,
	`title` text NOT NULL,
	`href` text NOT NULL,
	`location` text,
	`snippet` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `assistant_messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_message_citations_message_idx` ON `assistant_message_citations` (`message_id`,`created_at`);