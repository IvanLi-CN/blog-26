-- Migration: Add sessions table for session-based authentication
-- Date: 2025-01-25
-- Description: Replace JWT authentication with session-based authentication

CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_info` text,
	`ip_address` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Create index for faster session lookups
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);
CREATE INDEX `sessions_is_active_idx` ON `sessions` (`is_active`);
