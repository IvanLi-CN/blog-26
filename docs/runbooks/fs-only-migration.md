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

case "$CONTENT_ROOT" in ""|"/"|[!/]*) echo "CONTENT_ROOT must be a non-root absolute path" >&2; exit 2;; esac
case "$CLIPPING_CONTENT_BASE_PATH" in ""|"/"|[!/]*) echo "CLIPPING_CONTENT_BASE_PATH must be a non-root absolute path" >&2; exit 2;; esac
case "$DB_PATH" in ""|"/"|[!/]*) echo "DB_PATH must be an absolute path" >&2; exit 2;; esac
case "$PI_DURABLE_DB_PATH" in ""|"/"|[!/]*) echo "PI_DURABLE_DB_PATH must be an absolute path" >&2; exit 2;; esac
test "$CONTENT_ROOT" != "$CLIPPING_CONTENT_BASE_PATH"
test "$DB_PATH" != "$PI_DURABLE_DB_PATH"
case "$(basename "$CONTENT_ROOT")" in ""|"."|"..") echo "CONTENT_ROOT must name a directory" >&2; exit 2;; esac
case "$(basename "$CLIPPING_CONTENT_BASE_PATH")" in ""|"."|"..") echo "CLIPPING_CONTENT_BASE_PATH must name a directory" >&2; exit 2;; esac
case "$(basename "$BACKUP_DIR")" in ""|"."|"..") echo "BACKUP_DIR must name a directory" >&2; exit 2;; esac
mkdir -p "$(dirname "$BACKUP_DIR")"
content_real="$(realpath "$CONTENT_ROOT")"
clippings_real="$(realpath "$CLIPPING_CONTENT_BASE_PATH" 2>/dev/null || true)"
backup_parent="$(realpath "$(dirname "$BACKUP_DIR")")"
backup_real="$backup_parent/$(basename "$BACKUP_DIR")"
case "$backup_real/" in "$content_real/"*) echo "BACKUP_DIR must be outside content roots" >&2; exit 2;; esac
test "$backup_real" != "/" && test "$backup_real" != "$content_real" && test "$backup_real" != "$clippings_real"
if [ -n "$clippings_real" ]; then
  case "$backup_real/" in "$clippings_real/"*) echo "BACKUP_DIR must be outside content roots" >&2; exit 2;; esac
fi

# Stop the sole console/gateway runtime owner through its process supervisor
# (for example, the deployment's console and gateway service units). Do not
# rely on changing this variable to stop an already-running process. Verify
# that both processes have exited and the owner lease has closed before copy.
# Keep the processor disabled throughout the backup, migration, and validation.
export CLIPPING_PROCESSOR_ENABLED=false
case "$BACKUP_DIR" in ""|"/") echo "BACKUP_DIR must not be empty or /" >&2; exit 2;; esac
mkdir "$BACKUP_DIR"
# After the supervisor reports both processes stopped, verify the persisted
# lease is absent or expired before copying any state.
if [ -f "$PI_DURABLE_DB_PATH" ]; then
  bun -e 'import { Database } from "bun:sqlite"; const db = new Database(process.argv[1], { readonly: true }); const row = db.query("SELECT expires FROM clipping_runtime_owner WHERE singleton=1").get(); db.close(); if (row && Number(row.expires) > Date.now()) throw new Error("Pi owner lease is still active");' "$PI_DURABLE_DB_PATH"
fi
test -d "$CONTENT_ROOT"
test -f "$DB_PATH"
cp -a "$CONTENT_ROOT" "$BACKUP_DIR/content-root"
for suffix in "" "-wal" "-shm"; do
  source_path="${DB_PATH}${suffix}"
  if [ -e "$source_path" ]; then
    cp -a "$source_path" "$BACKUP_DIR/sqlite.db${suffix}"
  fi
done
for suffix in "" "-wal" "-shm"; do
  source_path="${PI_DURABLE_DB_PATH}${suffix}"
  if [ -e "$source_path" ]; then
    cp -a "$source_path" "$BACKUP_DIR/pi-durable.sqlite${suffix}"
  fi
done
if [ ! -e "$PI_DURABLE_DB_PATH" ]; then
  : > "$BACKUP_DIR/pi-durable.sqlite.absent"
fi
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
export CLIPPING_PROCESSOR_ENABLED=false

bun run migrate
bun run content:scan-api-links --include-db --format human
bun run content:migrate-api-links --include-db --dry-run --backup-dir "$BACKUP_DIR/migrate-preview"
bun run content:migrate-api-links --include-db --apply --backup-dir "$BACKUP_DIR/migrate-apply"
bun run content:scan-api-links --include-db --fail-on-found
```

## Validation

```bash
set -euo pipefail

export CLIPPING_PROCESSOR_ENABLED=false
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

case "$CONTENT_ROOT" in ""|"/"|[!/]*) echo "CONTENT_ROOT must be a non-root absolute path" >&2; exit 2;; esac
case "$CLIPPING_CONTENT_BASE_PATH" in ""|"/"|[!/]*) echo "CLIPPING_CONTENT_BASE_PATH must be a non-root absolute path" >&2; exit 2;; esac
case "$DB_PATH" in ""|"/"|[!/]*) echo "DB_PATH must be an absolute path" >&2; exit 2;; esac
case "$PI_DURABLE_DB_PATH" in ""|"/"|[!/]*) echo "PI_DURABLE_DB_PATH must be an absolute path" >&2; exit 2;; esac
test "$CONTENT_ROOT" != "$CLIPPING_CONTENT_BASE_PATH"
test "$DB_PATH" != "$PI_DURABLE_DB_PATH"
case "$(basename "$CONTENT_ROOT")" in ""|"."|"..") echo "CONTENT_ROOT must name a directory" >&2; exit 2;; esac
case "$(basename "$CLIPPING_CONTENT_BASE_PATH")" in ""|"."|"..") echo "CLIPPING_CONTENT_BASE_PATH must name a directory" >&2; exit 2;; esac
test -n "${BACKUP_DIR:-}"
test "$BACKUP_DIR" != "/"
mkdir -p "$(dirname "$CONTENT_ROOT")" "$(dirname "$CLIPPING_CONTENT_BASE_PATH")"
content_real="$(realpath "$(dirname "$CONTENT_ROOT")")/$(basename "$CONTENT_ROOT")"
clippings_real="$(realpath "$(dirname "$CLIPPING_CONTENT_BASE_PATH")")/$(basename "$CLIPPING_CONTENT_BASE_PATH")"
backup_real="$(realpath "$BACKUP_DIR")"
case "$backup_real/" in "$content_real/"*|"$clippings_real/"*) echo "BACKUP_DIR must be outside content roots" >&2; exit 2;; esac
test "$backup_real" != "/" && test "$backup_real" != "$content_real" && test "$backup_real" != "$clippings_real"
test "$content_real" != "$clippings_real"
test -d "$BACKUP_DIR/content-root"
test -f "$BACKUP_DIR/sqlite.db"
test -d "$BACKUP_DIR/clippings"
if [ -n "$(find "$BACKUP_DIR/clippings" -name manifest.json -print -quit)" ]; then
  test -f "$BACKUP_DIR/clippings/identity.key"
fi
if [ -f "$BACKUP_DIR/pi-durable.sqlite.absent" ]; then
  test ! -e "$BACKUP_DIR/pi-durable.sqlite"
else
  test -f "$BACKUP_DIR/pi-durable.sqlite"
fi

bun -e 'import { Database } from "bun:sqlite"; const db = new Database(process.argv[1], { readonly: true }); const row = db.query("PRAGMA integrity_check").get(); db.close(); if (row?.integrity_check !== "ok") throw new Error("SQLite integrity check failed");' "$BACKUP_DIR/sqlite.db"
if [ -f "$BACKUP_DIR/pi-durable.sqlite" ]; then
  bun -e 'import { Database } from "bun:sqlite"; const db = new Database(process.argv[1], { readonly: true }); const row = db.query("PRAGMA integrity_check").get(); db.close(); if (row?.integrity_check !== "ok") throw new Error("SQLite integrity check failed");' "$BACKUP_DIR/pi-durable.sqlite"
fi
if [ -f "$PI_DURABLE_DB_PATH" ]; then
  bun -e 'import { Database } from "bun:sqlite"; const db = new Database(process.argv[1], { readonly: true }); const row = db.query("SELECT expires FROM clipping_runtime_owner WHERE singleton=1").get(); db.close(); if (row && Number(row.expires) > Date.now()) throw new Error("Pi owner lease is still active");' "$PI_DURABLE_DB_PATH"
fi

rm -rf "$CONTENT_ROOT"
cp -a "$BACKUP_DIR/content-root" "$CONTENT_ROOT"
for suffix in "" "-wal" "-shm"; do
  rm -f "${DB_PATH}${suffix}"
  backup_path="$BACKUP_DIR/sqlite.db${suffix}"
  if [ -e "$backup_path" ]; then
    cp -a "$backup_path" "${DB_PATH}${suffix}"
  fi
done
rm -rf "$CLIPPING_CONTENT_BASE_PATH"
cp -a "$BACKUP_DIR/clippings" "$CLIPPING_CONTENT_BASE_PATH"
for suffix in "" "-wal" "-shm"; do
  rm -f "${PI_DURABLE_DB_PATH}${suffix}"
  backup_path="$BACKUP_DIR/pi-durable.sqlite${suffix}"
  if [ -e "$backup_path" ] && [ ! -f "$BACKUP_DIR/pi-durable.sqlite.absent" ]; then
    cp -a "$backup_path" "${PI_DURABLE_DB_PATH}${suffix}"
  fi
done
```

After rollback, rerun the validation steps while the processor remains
disabled. Restart the sole runtime owner through its process supervisor with
`CLIPPING_PROCESSOR_ENABLED=true` only after validation passes.
