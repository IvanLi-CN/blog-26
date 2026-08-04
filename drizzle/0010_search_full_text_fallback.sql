CREATE VIRTUAL TABLE `posts_search_fts` USING fts5(
  `post_id` UNINDEXED,
  `type` UNINDEXED,
  `slug`,
  `title`,
  `excerpt`,
  `body`,
  `tags`,
  tokenize = 'trigram'
);
--> statement-breakpoint
INSERT INTO `posts_search_fts` (`post_id`, `type`, `slug`, `title`, `excerpt`, `body`, `tags`)
SELECT `id`, `type`, `slug`, `title`, `excerpt`, `body`, `tags`
FROM `posts`
WHERE `type` IN ('post', 'memo');
--> statement-breakpoint
CREATE TRIGGER `posts_search_fts_after_insert`
AFTER INSERT ON `posts`
WHEN NEW.`type` IN ('post', 'memo')
BEGIN
  INSERT INTO `posts_search_fts` (`post_id`, `type`, `slug`, `title`, `excerpt`, `body`, `tags`)
  VALUES (NEW.`id`, NEW.`type`, NEW.`slug`, NEW.`title`, NEW.`excerpt`, NEW.`body`, NEW.`tags`);
END;
--> statement-breakpoint
CREATE TRIGGER `posts_search_fts_after_update`
AFTER UPDATE ON `posts`
BEGIN
  DELETE FROM `posts_search_fts` WHERE `post_id` = OLD.`id`;
  INSERT INTO `posts_search_fts` (`post_id`, `type`, `slug`, `title`, `excerpt`, `body`, `tags`)
  SELECT NEW.`id`, NEW.`type`, NEW.`slug`, NEW.`title`, NEW.`excerpt`, NEW.`body`, NEW.`tags`
  WHERE NEW.`type` IN ('post', 'memo');
END;
--> statement-breakpoint
CREATE TRIGGER `posts_search_fts_after_delete`
AFTER DELETE ON `posts`
BEGIN
  DELETE FROM `posts_search_fts` WHERE `post_id` = OLD.`id`;
END;
