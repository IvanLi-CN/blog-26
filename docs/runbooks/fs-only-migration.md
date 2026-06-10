# Local Content Migration Runbook

This runbook verifies that content and database records are clean for the local-only runtime.

## Goals

- No persisted `/api/files/...` references remain in Markdown or SQLite.
- The app starts with `LOCAL_CONTENT_BASE_PATH` and without any remote content-source config.
- Posts, memos, images, and attachments remain readable after migration.

## Preparation

```bash
export CONTENT_ROOT="/path/to/content-root"
export DB_PATH="/path/to/sqlite.db"
export BACKUP_DIR="/path/to/backup/$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
cp -a "$CONTENT_ROOT" "$BACKUP_DIR/content-root"
cp -a "$DB_PATH" "$BACKUP_DIR/sqlite.db"
```

## Scan and Migrate

```bash
export CONTENT_SOURCES=local
export LOCAL_CONTENT_BASE_PATH="$CONTENT_ROOT"

bun run content:scan-api-links --include-db --format human
bun run content:migrate-api-links --include-db --dry-run --backup-dir "$BACKUP_DIR/migrate-preview"
bun run content:migrate-api-links --include-db --apply --backup-dir "$BACKUP_DIR/migrate-apply"
bun run content:scan-api-links --include-db --fail-on-found
```

## Validation

```bash
bun run check
bun run test
bun run test:e2e
```

Manually verify at least:

- two post pages
- two memo pages
- image and attachment rendering

## Rollback

```bash
rm -rf "$CONTENT_ROOT"
cp -a "$BACKUP_DIR/content-root" "$CONTENT_ROOT"
cp -a "$BACKUP_DIR/sqlite.db" "$DB_PATH"
```
