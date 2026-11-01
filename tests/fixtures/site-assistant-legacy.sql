PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE readers (
  id TEXT PRIMARY KEY NOT NULL,
  github_id TEXT NOT NULL,
  github_login TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  profile_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL,
  post_slug TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'article',
  target_key TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL,
  author_email TEXT,
  reader_id TEXT,
  author_role TEXT NOT NULL DEFAULT 'reader',
  author_github_id TEXT,
  parent_id TEXT,
  root_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  deleted_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1,
  submission_key TEXT,
  created_at INTEGER NOT NULL
);

INSERT INTO readers (id, github_id, github_login, display_name, created_at, updated_at)
VALUES ('legacy-reader', 'github-legacy-reader', 'legacy-reader', 'Legacy Reader', 1, 1);

INSERT INTO comments (
  id, content, post_slug, target_type, target_key, author_name, reader_id, status, created_at
)
VALUES (
  'legacy-comment', 'Keep this comment', 'legacy-post', 'article', 'legacy-post',
  'Legacy Reader', 'legacy-reader', 'approved', 1
);
