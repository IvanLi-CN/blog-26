# Ivan's Blog - Next.js Migration

This is the Next.js version of Ivan's Blog, migrated from Astro 5.0.

## Development

### One-Click Setup

For a fresh checkout or worktree, run:

```bash
./scripts/setup.sh               # add --with-e2e to install Playwright browsers
# or equivalently
bun run setup
# legacy/alternate entry (same behavior)
# legacy/alternate entry (removed)
# bun run prepare:dev --with-db
```

What it does:

- Installs dependencies with `bun install`.
- Installs git hooks via `lefthook` (pre-commit, commit-msg with commitlint).
- Validates dev ports: defaults to `PORT=25090`, `WEBDAV_PORT=26091`; overrides allowed via env. Ports must be free, otherwise the script exits with error. No `.env` files are created.
- Resets dev DB and seeds sample content by default (pass `--no-db` to skip).
- Does not perform a content sync. To import Markdown content, use the admin page
  (`/admin/content-sync`) or run `bun run dev-sync:trigger` after exporting the
  required environment variables (`DB_PATH`, `LOCAL_CONTENT_BASE_PATH`, `WEBDAV_URL`).
- Optional E2E browsers install (`--with-e2e`).

Flags: `--dry-run`, `--force-env`, `--no-db`, `--with-e2e`.
Deprecated: `--with-db` (now default behavior).
Env overrides: `PORT=<web_port> WEBDAV_PORT=<webdav_port>`

### Worktree Development (Quick Start)

```bash
git worktree add -b feat/some-change ../blog-nextjs-wt-some-change
./scripts/setup.sh

# (Recommended for worktrees: run services separately on non-default ports)
nohup dufs dev-data/webdav --port 25601 --allow-all --enable-cors --log-format combined \
  >tmp/webdav-25601.log 2>&1 & echo $! >tmp/webdav-25601.pid

nohup env PORT=25600 DB_PATH=./dev-data/sqlite.db \
  LOCAL_CONTENT_BASE_PATH=./dev-data/local \
  WEBDAV_URL=http://localhost:25601 \
  bun --bun next dev --turbopack \
  >tmp/next-25600.log 2>&1 & echo $! >tmp/next-25600.pid

DB_PATH=./dev-data/sqlite.db \
  LOCAL_CONTENT_BASE_PATH=./dev-data/local \
  WEBDAV_URL=http://localhost:25601 \
  bun run dev-sync:trigger
```

Stop services afterwards with `kill $(cat tmp/next-25600.pid)` and `kill $(cat tmp/webdav-25601.pid)`.

### Prerequisites

- Bun ≥ 1.0 and SQLite (file-based, no separate service required)
- Optional: Playwright browsers (for E2E), dufs (WebDAV for dev/test)

```bash
# Install deps
bun install

# Install Playwright browsers (for E2E)
bunx playwright install

# Install dufs (WebDAV)
brew install dufs       # or: cargo install dufs
```

Environment variables

The repo includes `.env.development` with sane dev defaults (no ports defined):

```env
DB_PATH=./dev-data/sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/local
```

To customize locally, create `.env.local` (e.g., if you must pin ports for parallel worktrees):

```bash
cp .env.development .env.local
# edit only what you need locally; do not commit
```
### Start Dev Environment

```bash
# Recommended on first run: init DB and sample data
bun run dev-db:reset
bun run dev-data:generate   # optional: generate dev content data

# Export environment variables (required for correct data sources)
export DB_PATH=./dev-data/sqlite.db
export LOCAL_CONTENT_BASE_PATH=./dev-data/local
export WEBDAV_URL=http://localhost:25601   # match the WebDAV port you plan to use

# Import both local and WebDAV fixtures (requires WebDAV dev server, see notes below)
bun run dev-sync:trigger

# Start Next.js (with WebDAV dev server)
bun run dev
```

- App URL: `http://localhost:3000` by default; if `PORT` is set in `.env.local` (example: `25090`), that port takes effect.
- WebDAV dev server: `http://localhost:25091`

#### Trigger Content Sync (manual)

- Admin UI: visit `/admin/content-sync` (login via the dev endpoints in this README), then run a full or incremental sync.
- CLI (local + WebDAV → DB): `bun run dev-sync:trigger` (env vars required as above).

#### Reset Dev Data

```bash
# Reset dev DB (drop + migrate + seed)
bun run dev-db:reset

# Clean and (re)generate dev content files
bun run dev-data:clean && bun run dev-data:generate

# Quick health checks
bun run dev-db:check && bun run webdav:check
```

### Start Test Environment

```bash
# One-shot reset + prepare test fixtures
bun run test-env:reset

# Start test services only (manual verification): Next.js (test) + WebDAV
bun run test-server:start

# Run E2E tests (automatically starts services)
bun run test:e2e
```

- Install browsers before running tests: `bunx playwright install`
- Default ports in test: app `25090`, WebDAV `25091`

- For deeper E2E guidance, see `tests/e2e/README.md`.

### Build & Run Staging

```bash
# Prebuild (generate version info)
bun run prebuild

# Build Next.js assets
bun run build

# Start (make sure .env.local or env vars are configured)
bun run start
```

Important env hints:

- `NODE_ENV=production`, `PORT=25090` (example)
- `DB_PATH` should point to a persistent location (e.g., `./sqlite.db` or a mounted volume)
-
- Content sources: `WEBDAV_URL`, `LOCAL_CONTENT_BASE_PATH`, etc.

### Environment Storage Layout (Paths)

To remove ambiguity, the project standardizes where content and database files live per environment. These are the effective defaults unless you override with env vars.

- Development
  - `DB_PATH`: `./dev-data/sqlite.db`
  - Local content root: `./dev-data/local`
  - WebDAV (dufs): `http://localhost:25091` serving `./dev-data/webdav`
  - Notes: `bun run dev-db:*` now targets `./dev-data/sqlite.db` for reset/check/schema

- Test (E2E and local test server)
  - `DB_PATH`: `./test-data/sqlite.db`
  - Local content root: `./test-data/local`
  - WebDAV (dufs): `http://localhost:25091` serving `./test-data/webdav`
  - Notes: Playwright and `bun run test-env:*` are wired to the paths above

- Production/Staging
  - Docker image default: `DB_PATH=/app/data/sqlite.db`
  - Persisted volume: `./docker-data:/app/data` in `docker-compose.yml`
  - WebDAV: set `WEBDAV_URL` (basic auth optional via `WEBDAV_USERNAME/WEBDAV_PASSWORD`)
  - Local content (optional): `LOCAL_CONTENT_BASE_PATH=/app/data/local` (disabled unless set)

Essentials

- Single source of truth for DB location is `DB_PATH`. Scripts and Playwright use environment-specific defaults above.
- Local content location is governed by `LOCAL_CONTENT_BASE_PATH` and defaults to `./dev-data/local` (dev) or `./test-data/local` (test).
- WebDAV URL must be explicit; the dev/test dufs server binds to `25091` and serves the matching directory under `dev-data/` or `test-data/`.

Quick sanity commands

```bash
# Show which DB this shell session points to
bun run db:which

# Validate path config and env
bun run -i scripts/validate-config.ts
```

### How To Log In

- Dev/test only: Privileged endpoints (use fetch in the browser)
  - These endpoints set a `Set-Cookie` session; the simplest way is to run them in the browser console so the cookie is stored for the current origin.
  - Open the app in a browser (e.g., `http://localhost:25090`), then in DevTools Console run:

    ```js
    // Login
    await fetch('/api/dev/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: 'admin@test.com' }),
    }).then(r => r.json()).then(console.log);

    // Or register + login
    await fetch('/api/dev/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ nickname: 'Dev', email: 'dev@example.com' }),
    }).then(r => r.json()).then(console.log);
    ```

  - Production blocks these endpoints and returns 404.

### Personal Access Tokens

- Entry point: Admin dashboard → "More" → "Personal Access Tokens" (`/admin/pats`) with list, create,
  and revoke actions.
- Default prefixes follow the environment: development `blog-pat-`, production `blog-prod-pat-`,
  and test `blog-test-pat-`. The backend validates prefixes to prevent cross-environment reuse.
- Optional environment variables:
  - `BLOG_PAT_ENV` / `BLOG_RUNTIME_ENV` / `PAT_ENVIRONMENT` / `APP_ENV` / `NEXT_PUBLIC_SITE_ENV` set the
    environment tag (for example `staging`) and emit tokens like `blog-<env>-pat-…`.
  - `BLOG_PAT_PREFIX` overrides the entire prefix (highest precedence).
- Tokens are persisted as SHA-256 hashes only; revoked tokens remain recorded but become unusable
  immediately.

## 📁 Project Structure

```text
src/
├── app/                    # Next.js App Router pages
│   ├── api/trpc/          # tRPC API routes
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   └── TRPCProvider.tsx   # tRPC client provider
├── lib/                   # Core libraries
│   ├── db.ts             # Database connection
│   ├── schema.ts         # Database schema
│   └── trpc.ts           # tRPC client
├── server/               # tRPC server
│   ├── router.ts         # Main router
│   └── trpc.ts           # tRPC setup
└── utils/                # Utility functions
```

## 🔄 Development Environment Data Regeneration

This project uses a multi-source content management system that supports both local file system and WebDAV remote storage. During development, you may need to reset environment data. This section provides a complete operation guide.

### 📋 System Architecture Overview

**Data Storage Layers**:

- **SQLite Database** - Primary data storage (posts, memos, comments, users, etc.)
- **Local File System** - Development content (`src/content/`, `dev-data/local/`)
- **WebDAV Remote Storage** - Remote content sync (`dev-data/webdav/`, `test-data/webdav/`)
- **Cache Layer** - Redis cache, build cache (`.next/`)

**Content Sync Mechanism**:

- SHA-256 hash-based incremental sync
- Multi-source priority management
- Intelligent conflict resolution strategy

### 📜 Script Tools Reference

#### Database Management Scripts

| Script | Function | Usage |
|--------|----------|-------|
| `migrate` | Run database migrations | `bun run migrate` |
| `seed` | Populate seed data (creates test users and initializes system configuration) | `bun run seed [--clear] [--check]` |
| `drop-db` | Delete database file | `bun run drop-db [--force]` |
| `dev-db:reset` | Reset development database | `bun run dev-db:reset` |
| `dev-db:check` | Check development database | `bun run dev-db:check` |
| `test-db:reset` | Reset test database | `bun run test-db:reset` |
| `test-db:check` | Check test database | `bun run test-db:check` |
| `db:which` | Show current database path | `bun run db:which` |

#### Content Management Scripts

| Script | Function | Usage |
|--------|----------|-------|
| `dev-data:generate` | Generate development content data | `bun run dev-data:generate` |
| `dev-data:clean` | Clean development content data | `bun run dev-data:clean` |
| `test-data:generate` | Generate test data | `bun run test-data:generate` |
| `test-data:clean` | Clean test data | `bun run test-data:clean` |
| `test-data:verify` | Verify test data | `bun run test-data:verify` |

#### WebDAV Tools

| Script | Function | Usage |
|--------|----------|-------|
| `webdav:dev` | Start development WebDAV server | `bun run webdav:dev` |
| `webdav:check` | Check WebDAV connection | `bun run webdav:check` |
| `webdav:list` | List WebDAV directory | `bun run webdav:list` |

## 🛠 Tech Stack

### Core Framework

- **Next.js 15.4.6** with App Router
- **React 19.1.0**
- **TypeScript 5.x**
- **Tailwind CSS 4.x** + daisyUI

### Backend & Database

- **tRPC 11.4.3** for type-safe APIs
- **Drizzle ORM 0.44.2** with SQLite
- **better-sqlite3** for database connection

### AI & Search

## 🔔 Subscribe

Your readers can follow updates via standard syndication formats. All endpoints support HTTP caching with `ETag` and `Last-Modified`:

- Main RSS: `/feed.xml` (`Content-Type: application/xml`)
- Main Atom: `/atom.xml` (`Content-Type: application/atom+xml`)
- Main JSON Feed: `/feed.json` (`Content-Type: application/feed+json`)
- Memos RSS: `/memos/feed.xml`
- Tag RSS: `/tags/[tag]/feed.xml` (replace `[tag]` with actual tag)

Notes:
- Limit items via `?limit=30` (defaults to 30, max 50).
- Short URL `/rss.xml` permanently redirects to `/feed.xml`.
- Absolute URLs are generated using `NEXT_PUBLIC_SITE_URL` (falls back to site config when unset).

- **OpenAI API** for AI features
- **LlamaIndex** for RAG functionality
- **Redis** for caching (ioredis)

### Development Tools

- **Biome 2.0.4** for code formatting and linting
- **Playwright** for E2E testing (see `tests/e2e/README.md`)
