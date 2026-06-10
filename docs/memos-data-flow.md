# Memos Data Flow

## Storage Model

- Memo Markdown files live under the configured local memo root.
- SQLite stores synchronized memo metadata for listing, search, and admin workflows.
- Persisted asset links stay relative, for example `./assets/image.png`.
- Runtime rendering resolves those relative links to `/api/files/local/...`.

## Authoring Flow

1. The editor collects Markdown content.
2. The app derives title, tags, slug, and memo filename.
3. Frontmatter is assembled with visibility, publish time, tags, and attachments.
4. The full Markdown document is written into the local content root.
5. Incremental sync updates SQLite caches and search state.

## Sync Flow

1. The sync job scans local Markdown files.
2. Frontmatter and body are parsed.
3. Tags, timestamps, excerpt, and hashes are normalized.
4. SQLite rows are inserted or updated.

## Key Rules

- Persisted Markdown and metadata must not contain `/api/files/...` URLs.
- Persisted content must not encode storage-source identifiers.
- Attachments for memos live beside the memo under an `assets/` directory.
- The memo list and detail pages read from SQLite, while edits write back to the local files.
