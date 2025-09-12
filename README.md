# Ivan's Blog - Next.js Migration

This is the Next.js version of Ivan's Blog, migrated from Astro 5.0.

## Development

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

Environment variables: create a local file and tweak values

```bash
cp .env.pre .env.local
# Key vars: ADMIN_EMAIL, SSO_EMAIL_HEADER_NAME (default: Remote-Email),
# DB_PATH (default: ./sqlite.db), WEBDAV_URL, LOCAL_CONTENT_BASE_PATH, etc.
```

### Start Dev Environment

```bash
# Recommended on first run: init DB and sample data
bun run dev-db:reset
bun run dev-data:generate   # optional: generate dev content data

# Start Next.js (with WebDAV dev server)
bun run dev
```

- App URL: `http://localhost:3000` by default; if `PORT` is set in `.env.local` (example: `25090`), that port takes effect.
- WebDAV dev server: `http://localhost:25091`

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

- For deeper E2E guidance, see `docs/e2e-testing.md`.

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
- `ADMIN_EMAIL` and `SSO_EMAIL_HEADER_NAME` (if your proxy injects email SSO)
- Content sources: `WEBDAV_URL`, `LOCAL_CONTENT_BASE_PATH`, etc.

### How To Log In

- Option A (recommended for automation/integration): Remote-Email header injection
  - Inject an admin email via request header; the server reads `SSO_EMAIL_HEADER_NAME` (default: `Remote-Email`).
  - This repo enables it in `playwright.config.ts`:

    ```ts
    // excerpt
    extraHTTPHeaders: {
      [process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email"]:
        process.env.ADMIN_EMAIL || "admin@test.com",
    }
    ```

- Option B (dev/test only): Privileged endpoints (use fetch in the browser)
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

### ⚡ Quick Reset Guide

**One-click Complete Reset**:

```bash
# Reset database + Generate development data + Start development environment
bun run dev-db:reset && bun run dev-data:generate && bun run dev
```

**Common Scenarios**:

```bash
# Reset development database only (keep files)
bun run dev-db:reset

# Regenerate test data only
bun run test-data:clean && bun run test-data:generate

# Check development environment status
bun run dev-db:check && bun run webdav:check

# Start complete development environment (WebDAV + Next.js)
bun run dev
```

### 🛠️ Detailed Operation Flow

#### 1. Data Cleanup Strategy

**Cleanup Order** (to avoid foreign key constraint conflicts):

1. Stop all service processes
2. Clear cache data (Redis, build cache)
3. Clear database (by dependency: comments → posts/memos → users)
4. Clear file system data
5. Clear temporary files

**Safe Cleanup Commands**:

```bash
# Force delete database (use with caution)
bun run drop-db --force

# Clean test data files
bun run test-data:clean

# Clear build cache
rm -rf .next/
```

#### 2. Database Rebuild Process

**Standard Rebuild Process**:

```bash
# 1. Delete existing database
bun run drop-db --force

# 2. Run database migrations
bun run migrate

# 3. Populate seed data
bun run seed

# Or use one-click command for development
bun run dev-db:reset
```

**Seed Data Description**:

- Create test users (<test1@example.com>, <test2@example.com>)
- Initialize system configuration
- **Does not include** content data (posts/memos obtained through content sync)

#### 3. Content Source Regeneration

**Generate Test Content**:

```bash
# Generate development environment test data
bun run test-data:generate

# Verify generated data
bun run test-data:verify

# Clean test data
bun run test-data:clean
```

**Content Sync Process**:

1. Start WebDAV server: `bun run webdav:dev`
2. Access admin interface: `http://localhost:25090/admin/content-sync`
3. Trigger content sync or wait for automatic sync
4. Check sync logs and status

### 📜 Script Tools Reference

#### Database Management Scripts

| Script | Function | Usage |
|--------|----------|-------|
| `migrate` | Run database migrations | `bun run migrate` |
| `seed` | Populate seed data | `bun run seed [--clear] [--check]` |
| `drop-db` | Delete database file | `bun run drop-db [--force]` |
| `dev-db:reset` | Reset development database | `bun run dev-db:reset` |
| `dev-db:check` | Check development database | `bun run dev-db:check` |
| `test-db:reset` | Reset test database | `bun run test-db:reset` |
| `test-db:check` | Check test database | `bun run test-db:check` |
| `db:which` | Show current database path | `bun run db:which` |

#### Content Management Scripts

| Script | Function | Usage |
|--------|----------|-------|
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

- **OpenAI API** for AI features
- **LlamaIndex** for RAG functionality
- **Redis** for caching (ioredis)

### Development Tools

- **Biome 2.0.4** for code formatting and linting
- **Playwright** for E2E testing (see `docs/e2e-testing.md`)
