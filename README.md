# Ivan's Blog

Astro public site, Vite/React admin SPA, and Bun gateway for a local-file-backed content system.

## Stack

- Astro public site in `site/`
- Admin SPA in `apps/admin/`
- Bun gateway and APIs in `src/server/`
- SQLite via Drizzle ORM
- Local Markdown content under `LOCAL_CONTENT_BASE_PATH`

## Quick Start

```bash
bun run setup

bun run dev-sync:trigger
bun run dev
```

`bun run setup` installs dependencies, installs hooks, creates `.env.local` when missing, leases worktree-local ports, and prepares dev data. `bun run dev` starts Astro, the admin SPA, and the Bun gateway.

For linked worktrees, the first checkout triggers the same bootstrap automatically through `lefthook post-checkout`. If automatic bootstrap fails, checkout still succeeds and the recovery command is:

```bash
bun run worktree:bootstrap -- --force
```

## Web Demo

A Web Demo is a separate build-time artifact of the shipped web application. It reuses the official product routes with deterministic local fixtures or in-memory API mocks; it is not a Storybook story, component iframe, static screenshot, or copied page. The live artifact cannot be switched into Demo mode by a query string or browser storage.

Build both public and admin Demo artifacts with:

```bash
bun run web-demo:build
```

The command creates `web-demo-site-dist/` and `web-demo-admin-dist/` without replacing `site-dist/` or `admin-dist/`. It prepares deterministic local content, a public snapshot, and a Playbook fixture before building. The Admin mock API is installed before the real router renders, and all Demo mutations stay in memory.

Each Demo artifact includes the shared Inspector on the official route. It exposes the current scene, persona, network condition, data density, refresh/reset actions, simulated in-memory save, shareable `d_*` state, and recent simulated mutations. It is a control surface for the Demo build only; it does not grant permissions or send writes to a real backend.

For an interactive public Demo during development, start the Demo build:

```bash
bun run web-demo:site
```

Open the official route:

```text
http://127.0.0.1:${SITE_PORT}/memos/
```

For the Admin Demo, start the separately configured Vite Demo build:

```text
bun run web-demo:admin
http://127.0.0.1:${ADMIN_PORT}/admin/dashboard
```

The public Memo list uses the same shipped Astro `/memos/` route and deterministic 2,400-record fixture in the Demo artifact. The build also emits the corresponding official Memo detail routes so sample links remain usable; the live build does not emit those Demo-only records. Storybook remains the component state gallery; it is not the page evidence source.

## Environment

Required for normal local development:

The recommended local development contract is `.env.local`, created on first bootstrap when missing. By default it contains:

```bash
DB_PATH=./dev-data/sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/local
CONTENT_SOURCES=local
PORT=<leased gateway port>
SITE_PORT=<leased site port>
ADMIN_PORT=<leased admin port>
```

Useful optional variables:

- `SITE_PORT`: Astro dev port; bootstrap leases a worktree-local value on first setup
- `ADMIN_PORT`: admin SPA dev port; bootstrap leases a worktree-local value on first setup
- `BASE_URL`: Playwright override
- `ADMIN_EMAIL`: admin identity for dev/test verification

The native `/playbook/` column consumes validated public Release assets. Production activation, content update inputs, console cache configuration and rollback are described in the [Style Playbook publishing runbook](docs/runbooks/style-playbook-publishing.md). Local builds stay offline unless explicitly configured.

The app only reads content from the local content root. There is no remote content-source runtime.

## Core Commands

```bash
bun run dev
bun run build
bun run start

bun run check
bun run fix
bun run test
bun run test:e2e

bun run migrate
bun run seed
bun run dev-db:reset
bun run test-env:reset
bun run test:worktree-bootstrap
```

## Data Layout

- Dev DB: `./dev-data/sqlite.db`
- Test DB: `./test-data/sqlite.db`
- Dev content root: `./dev-data/local`
- Test content root: `./test-data/local`
- Docker DB default: `/app/data/sqlite.db`

Content sync imports Markdown from the configured local content root into SQLite caches and search indexes.

## Search Index Operations

Migrations create the `posts_search_fts` SQLite FTS5 `trigram` index for post and memo slugs, titles, excerpts, bodies, and tags. SQLite triggers keep it synchronized with inserts, updates, deletes, and post/memo type changes. The application does not rebuild the index during startup.

Check or explicitly rebuild the index with:

```bash
DB_PATH=./dev-data/sqlite.db bun scripts/db-tools.ts search-index check
DB_PATH=./dev-data/sqlite.db bun scripts/db-tools.ts search-index rebuild
```

The check command is read-only and reports missing, extra, duplicate, or stale rows. The rebuild command is writable and should be used only when the check reports drift. Public search applies `draft=false AND public=true` at query time; administrator search keeps its existing visibility and status rules.

## Testing

```bash
bun run test
bun run test-env:reset
bun run test:e2e
bun run test:e2e:project -- admin
bun run test:e2e:targeted
bun run test:e2e:experimental
```

`bun run test:e2e` is the canonical full Playwright suite. It runs every `tests/e2e/**/*.spec.ts`
except specs explicitly tagged `@targeted` or `@experimental`, and includes `guest`, `admin`,
`user`, and `mcp` projects under the same taxonomy used by CI.

Playwright uses the integrated local-only stack defined in `playwright.config.ts`. The full local
runner resets fixtures once, builds once, then executes isolated per-project runs in parallel.

## Worktree Bootstrap

- Auto bootstrap runs only on the first branch checkout of a new linked worktree.
- A missing linked-worktree `.env.local` inherits the primary worktree's local configuration when that source is usable; only `PORT`, `SITE_PORT`, and `ADMIN_PORT` are re-leased for the target.
- If the primary source is unavailable or unusable, bootstrap falls back to the generated default environment without blocking checkout.
- Existing `.env.local` files are never overwritten by bootstrap.
- Older `.env.local` files without `SITE_PORT` / `ADMIN_PORT` stay valid; bootstrap derives those ports from `PORT` at runtime.
- Later branch switches do not rerun full bootstrap automatically.
- If `LOCAL_CONTENT_BASE_PATH` points outside `./dev-data`, bootstrap syncs that real content root but refuses to generate destructive dev fixtures into it.
- Manual rerun path: `bun run worktree:bootstrap -- --force`
- Preview-only path: `bun run worktree:bootstrap -- --force --dry-run`
- Bootstrap failures print the failed phase plus one recovery command directly in the checkout terminal.
- Smoke test: `bun run test:worktree-bootstrap`

## Build and Run

```bash
bun run build
bun run start
```

Production and container runs require a persistent `DB_PATH` and, when content sync is needed, a mounted `LOCAL_CONTENT_BASE_PATH`.
