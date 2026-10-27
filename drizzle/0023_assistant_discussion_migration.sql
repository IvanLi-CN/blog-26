CREATE TABLE `assistant_migration_items` (
	`migration_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` text NOT NULL,
	`source_hash` text NOT NULL,
	`state` text NOT NULL CHECK (`state` IN ('migrated', 'quarantined', 'skipped', 'failed')),
	`target_id` text,
	`reason` text,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`migration_id`, `source_kind`, `source_id`)
);
--> statement-breakpoint
CREATE INDEX `assistant_migration_items_hash_idx` ON `assistant_migration_items` (`migration_id`, `source_hash`);
--> statement-breakpoint
CREATE INDEX `assistant_migration_items_state_idx` ON `assistant_migration_items` (`migration_id`, `state`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `assistant_migration_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`migration_id` text NOT NULL,
	`source_path` text NOT NULL,
	`source_version` text NOT NULL,
	`manifest_path` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`verified_at` integer
);
--> statement-breakpoint
CREATE INDEX `assistant_migration_backups_lookup_idx` ON `assistant_migration_backups` (`migration_id`, `created_at`);
