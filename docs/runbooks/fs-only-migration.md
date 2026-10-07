# Local Content Migration Runbook

This runbook verifies that content and database records are clean for the local-only runtime.

## Goals

- No persisted `/api/files/...` references remain in Markdown or SQLite.
- The app starts with `LOCAL_CONTENT_BASE_PATH` and without any remote content-source config.
- Posts, memos, images, and attachments remain readable after migration.

## Preparation

```bash
set -euo pipefail

export CONTENT_ROOT="/path/to/content-root"
export DB_PATH="/path/to/sqlite.db"
export PI_DURABLE_DB_PATH="/path/to/pi-durable.sqlite"
export CLIPPING_CONTENT_BASE_PATH="/path/to/clippings"
export BACKUP_DIR="/path/to/backup/$(date +%Y%m%d-%H%M%S)"

# Stop the sole console/gateway runtime owner through its process supervisor
# (for example, the deployment's console and gateway service units). Do not
# rely on changing this variable to stop an already-running process. Verify
# that both processes have exited and the owner lease has closed before copy.
# Keep the processor disabled throughout the backup, migration, and validation.
export CLIPPING_PROCESSOR_ENABLED=false
mkdir -p "$BACKUP_DIR"
test -d "$CONTENT_ROOT"
test -f "$DB_PATH"
cp -a "$CONTENT_ROOT" "$BACKUP_DIR/content-root"
cp -a "$DB_PATH" "$BACKUP_DIR/sqlite.db"
for suffix in "" "-wal" "-shm"; do
  source_path="${PI_DURABLE_DB_PATH}${suffix}"
  if [ -e "$source_path" ]; then
    cp -a "$source_path" "$BACKUP_DIR/pi-durable.sqlite${suffix}"
  fi
done
if [ -d "$CLIPPING_CONTENT_BASE_PATH" ]; then
  cp -a "$CLIPPING_CONTENT_BASE_PATH" "$BACKUP_DIR/clippings"
else
  mkdir -p "$BACKUP_DIR/clippings"
fi
```

## Scan and Migrate

```bash
set -euo pipefail

export CONTENT_SOURCES=local
export LOCAL_CONTENT_BASE_PATH="$CONTENT_ROOT"

bun run migrate
bun run content:scan-api-links --include-db --format human
bun run content:migrate-api-links --include-db --dry-run --backup-dir "$BACKUP_DIR/migrate-preview"
bun run content:migrate-api-links --include-db --apply --backup-dir "$BACKUP_DIR/migrate-apply"
bun run content:scan-api-links --include-db --fail-on-found
```

## Validation

```bash
set -euo pipefail

bun run check
bun run test
bun run test:e2e
```

Manually verify at least:

- two post pages
- two memo pages
- image and attachment rendering

Only after all checks pass, restart the sole console/gateway runtime owner
through its process supervisor with `CLIPPING_PROCESSOR_ENABLED=true`. Confirm
the owner lease is acquired once and that the processor resumes from persisted
progress.

## Rollback

```bash
set -euo pipefail

# Stop the sole console/gateway runtime owner through its process supervisor,
# keep CLIPPING_PROCESSOR_ENABLED=false, and verify its lease has closed before
# replacing any files. The export alone does not stop an existing process.
export CLIPPING_PROCESSOR_ENABLED=false

test -n "${BACKUP_DIR:-}"
test "$BACKUP_DIR" != "/"
test -d "$BACKUP_DIR/content-root"
test -f "$BACKUP_DIR/sqlite.db"
test -d "$BACKUP_DIR/clippings"
test -f "$BACKUP_DIR/pi-durable.sqlite"

rm -rf "$CONTENT_ROOT"
cp -a "$BACKUP_DIR/content-root" "$CONTENT_ROOT"
cp -a "$BACKUP_DIR/sqlite.db" "$DB_PATH"
rm -rf "$CLIPPING_CONTENT_BASE_PATH"
cp -a "$BACKUP_DIR/clippings" "$CLIPPING_CONTENT_BASE_PATH"
for suffix in "" "-wal" "-shm"; do
  rm -f "${PI_DURABLE_DB_PATH}${suffix}"
  backup_path="$BACKUP_DIR/pi-durable.sqlite${suffix}"
  if [ -e "$backup_path" ]; then
    cp -a "$backup_path" "${PI_DURABLE_DB_PATH}${suffix}"
  fi
done
```

After rollback, rerun the validation steps while the processor remains
disabled. Restart the sole runtime owner through its process supervisor with
`CLIPPING_PROCESSOR_ENABLED=true` only after validation passes.
