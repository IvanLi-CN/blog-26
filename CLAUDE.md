# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ivan's Blog - A modern personal blog system built with Next.js 15, featuring multi-source content management (local files, WebDAV), SQLite database with Drizzle ORM, tRPC for type-safe APIs, and AI-powered features including vector search and content analysis.

**Tech Stack**: Next.js 15.5.3 (App Router), React 19, TypeScript 5, Tailwind CSS 4, tRPC 11.5, Drizzle ORM 0.44.5, SQLite, Bun runtime

## Essential Commands

### Development

```bash
# First-time setup (installs deps, git hooks, resets dev DB)
./scripts/setup.sh
# Add --with-e2e to also install Playwright browsers
# Add --no-db to skip database reset

# Start dev server (Next.js + WebDAV)
bun run dev                    # Uses PORT env var or default 3000
bun run dev:next              # Next.js only (no WebDAV)

# Reset development environment
bun run dev-db:reset          # Drop + migrate + seed dev database
bun run dev-data:clean        # Clean generated dev content files
bun run dev-data:generate     # Generate dev content data
```

### Testing

```bash
# Unit tests (Bun test)
bun run test                  # All unit tests
bun run test:watch           # Watch mode
bun run test:precommit       # Pre-commit test subset (runs in git hook)

# E2E tests (Playwright)
bun run test:e2e             # Run all E2E tests
bun run test:e2e:ui          # Interactive UI mode
bun run test:e2e:debug       # Debug mode with DevTools
bun run test:e2e:headed      # Show browser UI

# Test environment setup
bun run test-env:reset       # Full test env reset (DB + WebDAV content)
bun run test-server:start    # Manual test server (port 25090)
```

**Note**: E2E tests automatically start test services (Next.js on 25090, WebDAV on 25091). See `tests/e2e/README.md` for detailed guidance.

### Code Quality

```bash
bun run check               # Biome format + lint check
bun run fix                 # Biome auto-fix
```

### Database

```bash
# Development database (DB_PATH=./dev-data/sqlite.db)
bun run migrate             # Run migrations
bun run seed               # Populate seed data
bun run dev-db:check       # Health check + statistics
bun run dev-db:posts       # List posts in dev DB
bun run dev-db:schema      # Show schema info

# Test database (DB_PATH=./test-data/sqlite.db)
bun run test-db:reset      # Reset test database
bun run test-db:check      # Test DB health check

# Utility
bun run db:which           # Show current DB_PATH
```

### Build & Deploy

```bash
bun run prebuild           # Generate version info (auto-runs before build)
bun run build             # Production build
bun run start             # Start production server
bun run docker:build      # Build Docker image
```

## Architecture

### Content Management System

The blog uses a **multi-source content architecture** with intelligent syncing:

- **Local File System**: configurable via `LOCAL_CONTENT_BASE_PATH` (disabled if unset; use `dev-data/local/` or `test-data/local/` during development/testing)
- **WebDAV Remote**: Configured via `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`
- **SQLite Cache**: Posts, memos, and metadata cached in database for fast access

**Content Sync Flow**:
1. Content ingestion jobs scan local/WebDAV sources (`src/server/jobs/`)
2. SHA-256 hash comparison for incremental updates (`contentHash` in DB)
3. Multi-source priority: Newest content wins based on `lastModified`
4. Admin UI for manual sync triggers at `/admin/data-sync`

**Key Libraries**:
- Content sources: `src/lib/content-sources/`
- Sync jobs: `src/server/jobs/sync-content.ts`, `src/server/jobs/sync-webdav-content.ts`
- Markdown processing: `src/lib/markdown-utils.ts`

### Database Schema

**Main Tables** (`src/lib/schema.ts`):
- `posts`: Article cache (id, slug, title, body, contentHash, source, filePath)
- `memos`: Short-form notes/thoughts (id, content, images, visibility)
- `comments`: Nested comments with moderation
- `users`: User accounts (admin via `ADMIN_EMAIL` env)
- `postEmbeddings`: Vector embeddings for AI search (OpenAI text-embedding-3-small)
- `personalAccessTokens`: API tokens with environment-specific prefixes

**Migrations**: Auto-generated in `drizzle/` via `drizzle-kit generate` (edit `src/lib/schema.ts`, then run `bun run migrate`)

### tRPC API Structure

**Router Organization** (`src/server/routers/`):
- `posts.ts`: Public post listing, detail, search
- `memos.ts`: Memos CRUD, visibility control
- `comments.ts`: Comment submission, moderation, nested replies
- `reactions.ts`: Emoji reactions for posts/comments
- `auth.ts`: Session management, user profile
- `search.ts`: AI-powered semantic search
- `admin/`: Admin-only routers (data sync, content management, PAT management)

**Key Files**:
- Server setup: `src/server/trpc.ts`
- Router aggregation: `src/server/router.ts`
- Client: `src/lib/trpc.ts`
- Provider: `src/components/TRPCProvider.tsx`

### Authentication System

**Two auth modes** (configured via env):

1. **SSO Header Injection** (production): Proxy injects `Remote-Email` header (or `SSO_EMAIL_HEADER_NAME`), verified in `src/middleware.ts`
2. **Dev Endpoints** (dev/test only): `/api/dev/login` and `/api/dev/register` set session cookies

**Admin Detection**: User email matches `ADMIN_EMAIL` env var

**Implementation**: `src/lib/auth.ts`, `src/lib/auth-utils.ts`

### AI Features

**Vector Search** (`src/lib/ai/`):
- Embeddings: OpenAI text-embedding-3-small (1536 dimensions)
- Storage: `postEmbeddings` table with BLOB vectors
- Search: Cosine similarity via LlamaIndex
- Indexing: Background jobs update embeddings on content changes

**Configuration**: Requires `OPENAI_API_KEY` env var

## Important Patterns

### Environment-Specific Data Paths

Each environment uses isolated directories to prevent data conflicts:

- **Development**: `DB_PATH=./dev-data/sqlite.db`, local content in `./dev-data/local`, WebDAV in `./dev-data/webdav`
- **Test**: `DB_PATH=./test-data/sqlite.db`, local content in `./test-data/local`, WebDAV in `./test-data/webdav`
- **Production**: `DB_PATH=/app/data/sqlite.db` (Docker), WebDAV via `WEBDAV_URL`

Always use `DB_PATH` env var for scripts. Test scripts in `playwright.config.ts` override this automatically.

### Git Commit Standards

- **Conventional Commits**: Use `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, etc.
- **English Only**: Commitlint enforces English in subject and body (no Chinese characters)
- **Git Hooks**: Lefthook runs Biome formatting + unit tests pre-commit, commitlint on commit-msg
- **Never use `--no-verify`** to bypass hooks unless explicitly debugging hook issues

### Personal Access Tokens (PAT)

- Admin UI: `/admin/pats` (create, list, revoke)
- **Environment prefixes**: `blog-pat-` (dev), `blog-prod-pat-` (prod), `blog-test-pat-` (test)
- Override via `BLOG_PAT_PREFIX` or detect via `BLOG_PAT_ENV`/`NEXT_PUBLIC_SITE_ENV`
- Storage: SHA-256 hashes only (plaintext shown once on creation)

### WebDAV Development

- Dev server: `bun run webdav:dev` (uses `dufs` on port 25091)
- Check connection: `bun run webdav:check`
- List files: `bun run webdav:list`
- Configured via `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`

### Test Data Management

- **Generate**: `bun run test-data:generate` (creates memos + posts in `test-data/webdav/`)
- **Verify**: `bun run test-data:verify` (checks frontmatter, file counts)
- **Clean**: `bun run test-data:clean`
- **Full Reset**: `bun run test-env:reset` (DB + files + trigger sync)

## Common Workflows

### Adding a New Feature

1. Create feature branch (use conventional naming: `feat/feature-name`, `fix/bug-name`)
2. Update database schema if needed:
   - Edit `src/lib/schema.ts`
   - Run `bunx drizzle-kit generate` (creates migration in `drizzle/`)
   - Run `bun run migrate` to apply
3. Implement tRPC router in `src/server/routers/` (add to `src/server/router.ts`)
4. Add React components in `src/components/`
5. Write unit tests alongside code (Bun test)
6. Write E2E tests if user-facing (Playwright in `tests/e2e/`)
7. Run quality checks: `bun run fix && bun run test && bun run test:e2e`
8. Commit with conventional format: `feat: add feature description`

### Debugging Content Sync

1. Check DB state: `bun run dev-db:posts` (lists posts with source/contentHash)
2. Verify WebDAV connection: `bun run webdav:check`
3. Check sync logs: View `/admin/data-sync` page or enable debug logging in `src/server/jobs/`
4. Manual trigger: Use admin UI at `/admin/data-sync` or call tRPC `admin.triggerSync` mutation
5. Inspect content sources: `src/lib/content-sources/local-file-system.ts`, `src/lib/content-sources/webdav-source.ts`

### Running Parallel Worktrees

To work on multiple features simultaneously:

```bash
# Main repo stays on main branch
git worktree add -b feat/feature-a ../blog-worktree-a
cd ../blog-worktree-a
./scripts/setup.sh           # Installs deps, sets up DB, git hooks
# Optional: Override ports in .env.local to avoid conflicts
echo "PORT=25092" > .env.local
echo "WEBDAV_PORT=25093" >> .env.local
bun run dev
```

Each worktree has isolated `dev-data/` and `.next/` directories.

## Key Configuration Files

- `drizzle.config.ts`: Drizzle ORM config (schema path, DB credentials)
- `next.config.ts`: Next.js settings (standalone output, external bundling for Bun)
- `tsconfig.json`: TypeScript config (path alias `@/*` → `./src/*`)
- `playwright.config.ts`: E2E test config (test/admin projects with header injection)
- `lefthook.yml`: Git hooks (pre-commit: Biome + unit tests, commit-msg: commitlint)
- `commitlint.config.cjs`: Conventional commits + English-only enforcement
- `biome.json`: Code formatting and linting (superset of Prettier + ESLint)

## Scripts Directory

See `scripts/README.md` for full documentation. Key utilities:

- `generate-version.ts`: Auto-generates version from Git (format: `YYYYMMDD-hash`)
- `migrate.ts`: Drizzle migration runner
- `seed.ts`: Populate test users and system config (`--clear` to clean, `--check` to verify)
- `db-tools.ts`: Database inspection (schema, posts, comments, statistics)
- `webdav-tools.ts`: WebDAV file management (`list`, `get`, `search`)
- `generate-test-data.ts`: Create test memos/posts (`--dev` for dev env, `--clean` to remove)

## Dependencies and Tooling

- **Runtime**: Bun ≥ 1.0 (do NOT use npm/yarn/pnpm)
- **Database**: SQLite file-based (no external service)
- **Linting**: Biome (replaces ESLint + Prettier)
- **Testing**: Bun test (unit), Playwright (E2E)
- **WebDAV Dev Server**: dufs (`brew install dufs` or `cargo install dufs`)
- **Optional**: Docker for production builds

## Production Deployment

1. **Build**: `bun run build` (generates `.next/standalone/`)
2. **Docker**: `bun run docker:build` or use provided Dockerfile
3. **Environment**: Set `NODE_ENV=production`, `DB_PATH`, `ADMIN_EMAIL`, `WEBDAV_URL`, `OPENAI_API_KEY`
4. **Start**: `bun run start` (or `node .next/standalone/server.js`)

See `docker-compose.yml` for volume mapping and environment examples.
