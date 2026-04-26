CREATE TABLE IF NOT EXISTS `llm_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `config` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
