# Tantivy persistence and synchronization probe

This is a standalone synthetic validation crate, not a production synchronizer. Engine version is pinned by the parent workspace to Tantivy 0.26.2; SQLite uses bundled rusqlite 0.40.2. No private content is read or uploaded.

## Reproduction

Run `cargo run --locked -p tantivy-sync-validation` from this validation workspace inside an available session-owned Agent VM. The `--locked` command requires the root workspace's initial authorized build to have generated Cargo.lock; before that, dependency resolution and the initial build must run in an authorized environment without `--locked`. A host run requires an explicit owner-authorized exception. Record the actual OS, Rust toolchain, command, exit status, and raw output alongside any execution result. The program creates disposable SQLite and index directories, prints named assertions, then removes fixtures via TempDir cleanup. Its `uncommitted-child` subprocess exits with code 77 before commit and without Rust destructors; this is process termination, not a machine power-loss test.

## Project source boundary

`src/lib/content-sources/manager.ts:355` clears all posts, `:566` upserts current filesystem projections, and `:649` deletes removed projections. `src/server/routers/admin/files.ts:382` removes stale rows and `:456`/`:459` restores scoped snapshots through delete and reinsert. `src/server/clipping/service.ts:104` and `:115` replace reading-body projections when clipping changes or is disabled. `src/server/mcp.ts:251` deletes indexed rows directly; MCP also mutates source frontmatter before reconciliation. `src/server/routers/admin/posts.ts` and `src/server/routers/memos.ts` own additional insert/update/delete paths. Tags are a JSON column on posts, so an UPDATE trigger covers their projected changes. `src/server/router.ts` composes routers rather than owning one universal mutation hook.

`src/server/clipping/projection.ts:isClippingRowPublic` checks authored filesystem frontmatter and denies missing/unreadable authority. This boundary is stronger than merely checking stale SQLite/index public flags. `src/lib/search/content-search.ts:176` and `:187` currently filter SQLite public/draft fields. New search and RAG must retain authority checks before providing candidate text to a model and immediately before returning results.

## Proposed ownership and guarantees

SQLite owns transactional post rows and trigger-generated outbox events. Tantivy owns term deletion, document indexing, commit visibility, disk reopening, and the writer directory lock. The project owns event schemas, retention, SQL transaction isolation, checkpoint order, retries, generation/version readiness, access checks, worker lifecycle, rebuild cutover, and deployment ownership. Tantivy does not automatically synchronize SQLite or files.

The probe processes ordered IDs and reads each ID's current SQLite projection, deleting the stable ID before re-adding it. This intentionally coalesces intermediate states and demonstrates replay, not immutable per-event snapshots. A production implementation needs a consistent SQLite read transaction and a generation/request-watermark protocol before it can claim the request-start snapshot contract. Never prune an outbox event before the corresponding successful index commit and durable checkpoint; never use index-stored content directly as authoritative LLM input.

## Results

The authorized session-owned Agent VM retry succeeded after the two earlier guest-agent timeouts. The parent workspace build completed with exit 0; this agent ran `./target/debug/tantivy-sync-validation` from `/workspace/tantivy-validation/tantivy` on 2026-10-08T16:53Z and obtained exit 0 with fourteen named PASS assertions. Raw output is preserved in [native-results.txt](./native-results.txt). There was no host native build or execution.

The tested environment is Debian 13.7, Linux 6.12.111+deb13-amd64, x86_64, rustc 1.91.0 and cargo 1.91.0. Workspace dependency pins are Tantivy 0.26.2 and bundled rusqlite 0.40.2; the actual bundled SQLite runtime reported `3.53.2`. These results establish Linux evidence for this synthetic probe only.

| Case group | Status | Evidence |
| --- | --- | --- |
| Insert; body/tag/slug/type updates; public/draft changes; stable IDs across equal slugs | PASS | Old terms disappear; replacement terms resolve; private-to-public restoration reaches the watermark; equal slugs across types retain two distinct IDs. |
| SQLite transaction rollback; outbox watermark and stored-version authorization guard | PASS | Rolled-back insert leaves no outbox event; stale version 2 is read from Tantivy and rejected against current version 3/private/draft SQLite authority; aborted writer batch leaves checkpoint unchanged. |
| Reader reload; single-writer lock; idempotent upsert/delete replay | PASS | Manual reader sees the commit only after reload; second writer is rejected; duplicate upserts retain one live ID and duplicate deletes leave none. |
| Process exit after commit before checkpoint; pre-commit termination; restart and replay | PASS | Child commits version 3 then exits 77 without checkpoint/destructors; parent sees committed version with old checkpoint, replays to one live ID, and advances checkpoint. Another child exits before commit; reopening sees only previous commits and writer lock can be acquired. |
| Bulk clear and full rebuild from current projection | PASS | Twenty committed rows become zero after deletion events; authoritative current-state replay rebuilds one surviving row. |
| Real filesystem/clipping permissions; commit I/O failure; power loss; production multi-instance ownership; performance | NOT_TESTED | Outside this probe's validated scope. |

The permission PASS applies to the synthetic SQL authority guard, not to production search/LLM call sites or real clipping filesystem access. The checkpoint PASS demonstrates ordering in this probe and abort/process-exit recovery; it does not inject a genuine Tantivy commit error. The process-exit cases are actual subprocess termination with destructor bypass, not power-loss durability tests.

## Limits and cost

The probe uses one 15 MB writer budget and 20 synthetic bulk rows. It provides no corpus performance SLA, Bun/native-bridge claim, Windows/macOS build claim, genuine commit-I/O failure injection, machine-power-loss durability claim, or production multi-instance ownership validation. Actual filesystem/clipping permission checks are not integration-tested by this crate. Aborting a batch tests that project code does not advance the checkpoint before commit; a real commit failure remains untested. Filesystem mutation and SQLite trigger transactions are separate, so the proposed outbox cannot make source-file changes atomic with SQLite reconciliation.
