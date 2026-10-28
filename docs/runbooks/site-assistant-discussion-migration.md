# Site assistant discussion migration

This runbook migrates clipping discussions from the offline Pi durable SQLite database into the app-owned assistant conversation store. It is a one-way, resumable backfill. Runtime cutover is handled separately, and a completed structural migration does not imply that the backfill is complete.

The operation is a production-data change. T8 validates the deterministic fixtures and this procedure only; do not run `--apply` against production without an approved maintenance window, a verified backup, and an owner-authorized rollout.

## Preconditions

1. Apply the structural migrations with `bun run migrate`. The assistant contract migrations are `0021`–`0026`; validate the journal first with `bun run db:migrations:validate`.
2. Stop new clipping work if source cleanup is planned. The migrator still copies active records, but it will retain any source conversation with an active runtime lease, non-terminal Pi task, or processing clipping version.
3. Set `DB_PATH`, `PI_DURABLE_DB_PATH`, and `LOCAL_CONTENT_BASE_PATH` for the same content and SQLite roots used by the application.
4. Keep the Pi database and its `-wal`/`-shm` sidecars available. The apply path creates a mode-0600 backup before writing the app database.
5. Confirm the sole Console/Gateway runtime owner is stopped and its lease is closed. Do not use an environment variable change as a substitute for stopping an already-running process.

The DDL, historical backfill and optional source cleanup are separate operations. A failed or stopped release is recovered with a forward repair or a disaster-recovery restore; application rollback does not down-migrate the database or delete assistant rows.

## Dry-run

The default is read-only with respect to both SQLite databases:

```sh
DB_PATH=./dev-data/sqlite.db \
PI_DURABLE_DB_PATH=./dev-data/pi-durable.sqlite \
LOCAL_CONTENT_BASE_PATH=./dev-data/local \
bun run assistant:discussions:migrate
```

The command prints a plan and writes a JSON manifest under `ASSISTANT_MIGRATION_BACKUP_DIR` (or the database directory's `assistant-migration-backups` folder). It preserves Pi system prompt sections as system messages alongside normal model content. Unknown attribution, invalid manifests, unreferenced conversations, and source conflicts are listed as quarantined records with their raw source payloads.

Before apply, inspect the manifest counts for `ready`, `quarantined`, `blocked`, and `skipped` items. Any quarantine or conflict requires resolving the source/identity first; it must not be converted into a guessed frontend user.

## Apply and resume

Use `--apply` after reviewing the dry-run manifest. Repeating the command is the supported resume operation; source IDs, hashes, deterministic target IDs, and the ledger make completed records no-ops. An existing target conversation can advance to a newer clipping version only when its recorded identity, memo, and target URL still match; a different target URL remains blocked without replacing the existing binding.

```sh
ASSISTANT_MIGRATION_BACKUP_DIR=./dev-data/assistant-migration-backups \
bun run assistant:discussions:migrate --apply
```

The `assistant_migration_state` row reports structural migration readiness separately from backfill progress. `assistant_migration_items` records each source conversation/message/partial and its hash, target ID, state, raw payload, and quarantine reason. A blocked run can be inspected and resumed after the source or identity issue is resolved.

The public clipping chat remains unavailable while the migration gate reports pending/blocked state. New installations with no legacy Pi discussion references may pass the gate without a backfill; legacy references require a complete successful ledger state.

## Cleanup

Cleanup is opt-in and requires both `--apply` and `--cleanup`:

```sh
bun run assistant:discussions:migrate --apply --cleanup
```

Before deleting a source conversation, the command verifies target rows and hashes, re-reads the source, re-checks the runtime lease, active clipping version, and Pi tasks inside a write transaction, and skips protected or changed source records. Quarantined source payloads are never deleted. The backup manifest and `assistant_migration_backups` row are retained for recovery evidence.

After cleanup, rerun the dry-run and verify that completed source IDs are no-ops, quarantined items remain present, and the target conversation/message/citation counts are unchanged. Keep the backup and migration ledger for the retention period required by the deployment policy.

## Validation and release handoff

Run the deterministic contract checks before exposing the public clipping chat:

```sh
bun run db:migrations:validate
bun test tests/lib/assistant-discussion-migration.test.ts \
  tests/lib/site-assistant-migration.test.ts \
  src/server/assistant/migration-gate.test.ts
```

The app-owned schema and migration gate must be green, the source and target paths must be distinct, and `PRAGMA integrity_check` must return `ok` for both databases. The runtime owner may be restarted only after validation passes. Real provider calls, OAuth, production deployment and public-cache invalidation are separate release gates.
