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
bun install
./scripts/setup.sh

export DB_PATH=./dev-data/sqlite.db
export LOCAL_CONTENT_BASE_PATH=./dev-data/local
export PORT=25090

bun run dev-sync:trigger
bun run dev
```

`bun run dev` starts Astro, the admin SPA, and the Bun gateway. The default web port is `25090`.

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

```bash
DB_PATH=./dev-data/sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/local
PORT=25090
```

Useful optional variables:

- `SITE_PORT`: Astro dev port, defaults to `PORT + 3`
- `ADMIN_PORT`: admin SPA dev port, defaults to `25094`
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

## Build and Run

```bash
bun run build
bun run start
```

Production and container runs require a persistent `DB_PATH` and, when content sync is needed, a mounted `LOCAL_CONTENT_BASE_PATH`.
