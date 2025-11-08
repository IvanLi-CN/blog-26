CREATE TABLE IF NOT EXISTS `tag_categories` (
  `key` text PRIMARY KEY NOT NULL,
  `title` text,
  `icon` text,
  `description` text DEFAULT '' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

