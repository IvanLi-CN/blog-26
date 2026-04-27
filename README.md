# Ivan's Blog - Astro Public + Admin SPA

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![Astro](https://img.shields.io/badge/Astro-6.1.4-FF5D01?logo=astro&logoColor=white)](https://astro.build/)
[![Legacy Next](https://img.shields.io/badge/Legacy_Next-16.2.2-black?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-0.45.2-8A2BE2)](https://orm.drizzle.team/)
[![tRPC](https://img.shields.io/badge/tRPC-11.16.0-2596BE)](https://trpc.io/)
[![Playwright](https://img.shields.io/badge/Playwright-1.59.1-45ba4b?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.0-000000?logo=bun&logoColor=white)](https://bun.sh/)

This repository serves the public site through Astro, the admin through a Vite/React SPA, and
retains a legacy internal Next runtime for remaining APIs, preview, and compatibility paths.

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
- Validates dev ports: defaults to `PORT=25090`, `WEBDAV_PORT=25091`; overrides allowed via env. Ports must be free, otherwise the script exits with error. No `.env` files are created.
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
git worktree add -b feat/some-change ../blog-25-wt-some-change
./scripts/setup.sh

export DB_PATH=./dev-data/sqlite.db
export LOCAL_CONTENT_BASE_PATH=./dev-data/local
export PORT=25600
export WEBDAV_PORT=25601
export WEBDAV_URL=http://localhost:25601

PORT=$PORT WEBDAV_PORT=$WEBDAV_PORT WEBDAV_URL=$WEBDAV_URL \
  DB_PATH=$DB_PATH LOCAL_CONTENT_BASE_PATH=$LOCAL_CONTENT_BASE_PATH \
  bun run dev

bun run dev-sync:trigger
```

For long-running sessions, use your team-approved background strategy and keep logs/process ownership explicit.

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

AI runtime defaults

- Environment variables still provide the initial defaults for AI-backed features:
  - `OPENAI_API_KEY`
  - `OPENAI_API_BASE_URL` or `OPENAI_BASE_URL`
  - `CHAT_COMPLETION_MODEL` / `TAG_AI_MODEL`
  - `EMBEDDING_MODEL_NAME`
  - `RERANKER_MODEL_NAME`
- Admin overrides saved from `/admin/llm-settings` take precedence over those env values at runtime and are stored in SQLite.
- API keys saved from the admin UI are encrypted at rest and require `LLM_SETTINGS_MASTER_KEY` on the server to write or decrypt persisted secrets.
- Model catalog data is refreshed during `bun run prebuild` from OpenRouter when available, but builds fall back to the repo-tracked catalog metadata if the refresh is unavailable.
- `LLM_MODEL_CATALOG_REFRESH_TIMEOUT_MS` can shorten or extend the build-time OpenRouter refresh timeout; `LLM_SETTINGS_TEST_TIMEOUT_MS` does the same for admin-side provider test requests.

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

# Start the hybrid dev stack (gateway + Astro + admin SPA + legacy Next)
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

# Start test services only (manual verification): gateway-backed test stack + WebDAV
bun run test-server:start

# Run E2E tests (automatically starts services)
bun run test:e2e
```

- Install browsers before running tests: `bunx playwright install`
- Default ports in test: gateway `25090`, WebDAV `25091`

- For deeper E2E guidance, see `tests/e2e/README.md`.

### Build & Run Staging

```bash
# Prebuild (generate version info)
bun run prebuild

# Build the local verification assets (frontend SSG + admin SPA + backend runtime bundle)
bun run build

# Start backend/admin runtime (make sure .env.local or env vars are configured)
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
  - Local content root: set `LOCAL_CONTENT_BASE_PATH=./dev-data/local` to enable local source
  - WebDAV (dufs): `http://localhost:25091` serving `./dev-data/webdav`
  - Notes: `bun run dev-db:*` now targets `./dev-data/sqlite.db` for reset/check/schema

- Test (E2E and local test server)
  - `DB_PATH`: `./test-data/sqlite.db`
  - Local content root: set `LOCAL_CONTENT_BASE_PATH=./test-data/local` when tests need local content
  - WebDAV (dufs): `http://localhost:25091` serving `./test-data/webdav`
  - Notes: Playwright and `bun run test-env:*` are wired to the paths above

- Production/Staging
  - Docker image default: `DB_PATH=/app/data/sqlite.db`
  - Persisted volume: `./docker-data:/app/data` in `docker-compose.yml`
  - WebDAV: set `WEBDAV_URL` (basic auth optional via `WEBDAV_USERNAME/WEBDAV_PASSWORD`)
  - Local content (optional): `LOCAL_CONTENT_BASE_PATH=/app/data/local` (disabled unless set)

Essentials

- Single source of truth for DB location is `DB_PATH`. Scripts and Playwright use environment-specific defaults above.
- Local content is **disabled unless `LOCAL_CONTENT_BASE_PATH` is explicitly set**. Use `./dev-data/local` (dev) or `./test-data/local` (test) if you need the local source.
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
├── app/                     # Legacy Next runtime: compatibility APIs, preview/dev/test pages
├── components/              # Shared React components that remain in the Next-owned tree
├── lib/                     # Shared runtime libraries and API clients
├── server/                  # Compatibility routers used by gateway/public/admin APIs
apps/
├── admin/                   # Vite + React + TanStack Router admin SPA
site/
├── pages/                   # Astro public frontend routes
├── components/              # Astro/shared public UI components
scripts/
├── start-gateway.ts         # Single-port gateway for public/admin/legacy runtime ownership
docs/specs/
└── */SPEC.md                # Delivery specs and follow-up runtime contracts
```

## 🔄 Development Environment Data Regeneration

This project uses a multi-source content management system that supports both local file system and WebDAV remote storage. During development, you may need to reset environment data. This section provides a complete operation guide.

### 📋 System Architecture Overview

**Data Storage Layers**:

- **SQLite Database** - Primary data storage (posts, memos, comments, users, etc.)
- **Local File System** - Development content (`src/content/`, `dev-data/local/`)
- **WebDAV Remote Storage** - Remote content sync (`dev-data/webdav/`, `test-data/webdav/`)
- **Cache Layer** - Redis cache, Next build cache (`.next/`), and generated site/admin build output

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

- **Astro 6.1.4** for the public site
- **Vite + React 19.2.4** for the admin SPA
- **Next.js 16.2.2** as the legacy internal runtime for compatibility paths
- **TypeScript 5.x**
- **Tailwind CSS 4.x** + shadcn/ui for shipped admin UI, with DaisyUI retained only for legacy/internal surfaces

### Backend & Database

- **tRPC 11.5.1** for type-safe APIs
- **Drizzle ORM 0.44.5** with SQLite (via `bun:sqlite`)

### AI & Search

- **OpenAI-compatible runtime config** for chat, embedding, and rerank workflows
- **Admin-managed LLM settings** persisted in SQLite with env fallback defaults
- **OpenRouter + curated fallback catalog** for model picker metadata
- **LlamaIndex** for RAG functionality
- **Redis** for caching (ioredis)

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
- Absolute URLs are generated using `NEXT_PUBLIC_SITE_URL` / `PUBLIC_SITE_URL`.
- Set `PUBLIC_SITE_BASE_PATH=/` for the `ivanli.cc` custom-domain deploy. Use `/blog-26` only if you intentionally publish to the raw project Pages URL.

### Development Tools

- **Biome 2.2.4** for code formatting and linting
- **Playwright 1.55.0** for E2E testing (see `tests/e2e/README.md`)

## 🚀 PR Label Release

This repository uses a PR label-driven release contract for PRs targeting `main`.

- Required PR labels:
  - exactly one `type:*`: `type:major` / `type:minor` / `type:patch` / `type:docs` / `type:skip`
  - exactly one `channel:*`: `channel:stable` / `channel:rc`
  - at least one `release:*`: `release:frontend` and/or `release:backend`
  - `type:major` additionally requires both `release:frontend` and `release:backend`
- Gate:
  - `PR Label Gate` fails early for missing/conflicting/unknown labels.
- Trigger:
  - release workflow runs from successful `CI/CD Pipeline` on `main` (`workflow_run`).
- Outputs:
  - frontend stable: `frontend-vX.Y.Z` tag + GitHub Release + GitHub Pages deploy
  - frontend rc: `frontend-vX.Y.Z-rc.<sha7>` tag + prerelease + GitHub Pages deploy
  - backend stable: `backend-vX.Y.Z` tag + GitHub Release + GHCR `:backend-vX.Y.Z` (and `:backend-latest` only when that commit is the current `main` head)
  - backend rc: `backend-vX.Y.Z-rc.<sha7>` tag + prerelease + GHCR `:backend-vX.Y.Z-rc.<sha7>`
  - docs/skip: no release artifacts

### Frontend content bundle in CI

- `release:frontend` builds must provide `PUBLIC_CONTENT_BUNDLE_URL` in GitHub secrets.
- Preferred value: `https://ivanli.cc/api/public/snapshot` so Pages always builds from the live public dataset instead of a manually exported dev bundle.
- If that live snapshot route is unavailable on the public mirror, point the secret at the repo-hosted fallback bundle instead: `https://raw.githubusercontent.com/IvanLi-CN/blog-26/public-content-bundle/public-bundles/live/public-snapshot.json`.
- The workflow downloads the content bundle, reuses the included `public-snapshot.json`, then runs Astro SSG.
- Configure repository variables before the first Pages release:
  - `PUBLIC_SITE_URL=https://ivanli.cc`
  - `PUBLIC_SITE_BASE_PATH=/`
  - `PUBLIC_API_BASE_URL=https://ivanli.cc`
- If legacy project-Pages values are still stored in repo variables, the release workflow automatically normalizes them to the root custom domain whenever `public/CNAME` is present.
- Pages frontend runtime API/file requests are rewritten against `PUBLIC_API_BASE_URL`, which must point at the live backend origin.
- The shipped target is the `ivanli.cc` custom domain. Keep the raw project Pages URL only as a fallback/debug endpoint.

For details and troubleshooting, see `docs/runbooks/pr-label-release.md`.
