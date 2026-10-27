# Site assistant discussion migration

This runbook migrates clipping discussions from the offline Pi durable SQLite database into the app-owned assistant conversation store. It is a one-way, resumable backfill. Runtime cutover is handled separately.

## Preconditions

1. Apply the structural migrations with `bun run migrate`.
2. Stop new clipping work if source cleanup is planned. The migrator still copies active records, but it will retain any source conversation with an active runtime lease, non-terminal Pi task, or processing clipping version.
3. Set `DB_PATH`, `PI_DURABLE_DB_PATH`, and `LOCAL_CONTENT_BASE_PATH` for the same content and SQLite roots used by the application.
4. Keep the Pi database and its `-wal`/`-shm` sidecars available. The apply path creates a mode-0600 backup before writing the app database.

## Dry-run

The default is read-only with respect to both SQLite databases:

```sh
DB_PATH=./dev-data/sqlite.db \
PI_DURABLE_DB_PATH=./dev-data/pi-durable.sqlite \
LOCAL_CONTENT_BASE_PATH=./dev-data/local \
bun run assistant:discussions:migrate
```

The command prints a plan and writes a JSON manifest under `ASSISTANT_MIGRATION_BACKUP_DIR` (or the database directory's `assistant-migration-backups` folder). Unknown attribution, invalid manifests, unreferenced conversations, and source conflicts are listed as quarantined records with their raw source payloads.

## Apply and resume

Use `--apply` after reviewing the dry-run manifest. Repeating the command is the supported resume operation; source IDs, hashes, deterministic target IDs, and the ledger make completed records no-ops.

```sh
ASSISTANT_MIGRATION_BACKUP_DIR=./dev-data/assistant-migration-backups \
bun run assistant:discussions:migrate --apply
```

The `assistant_migration_state` row reports structural migration readiness separately from backfill progress. `assistant_migration_items` records each source conversation/message/partial and its hash, target ID, state, raw payload, and quarantine reason. A blocked run can be inspected and resumed after the source or identity issue is resolved.

## Cleanup

Cleanup is opt-in and requires both `--apply` and `--cleanup`:

```sh
bun run assistant:discussions:migrate --apply --cleanup
```

Before deleting a source conversation, the command verifies target rows and hashes, re-reads the source, re-checks the runtime lease and Pi tasks inside a write transaction, and skips protected or changed source records. Quarantined source payloads are never deleted. The backup manifest and `assistant_migration_backups` row are retained for recovery evidence.
