CREATE TABLE `job_scheduler_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_token` text NOT NULL,
	`heartbeat_at` integer NOT NULL
);
