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

A Web Demo is a real browser route served by the shipped web application with deterministic demo data enabled. It is not a Storybook story, component iframe, static screenshot, or isolated visual fixture.

The admin Web Demo uses the normal Vite admin SPA routes with `?demo=true`. Demo mode installs frontend API mocks in `apps/admin/src/main.tsx`, remembers the setting in `localStorage["admin-demo-mode"]`, and keeps the real router, shell, pages, editor, navigation, and components in use. It does not require auth, seeded data, or a backend service.

For the editor demo, start the admin SPA and open:

```text
http://127.0.0.1:${ADMIN_PORT}/admin/posts/editor?demo=true&slug=react-hooks-deep-dive
```

Storybook remains useful for component state galleries and visual evidence, but it is not the Web Demo surface.

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

## Testing

```bash
bun run test
bun run test-env:reset
bun run test:e2e
```

Playwright uses the integrated local-only stack defined in `playwright.config.ts`.

## Worktree Bootstrap

- Auto bootstrap runs only on the first branch checkout of a new linked worktree.
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
