-- Remove vectors for content types that no indexer maintains. `project` rows are not
-- searchable content: `vectorizeAll` and the RAG catalog both scope to `post` and `memo`, so
-- these rows can never be refreshed and only skew aggregate state (the admin reindex hint).
DELETE FROM `post_embeddings`
WHERE `post_id` IN (
  SELECT `id` FROM `posts` WHERE `type` NOT IN ('post', 'memo')
);
