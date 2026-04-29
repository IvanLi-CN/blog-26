# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ivan's Blog is a personal content system built around an Astro public site, a Vite React admin SPA, and a Bun gateway/backend. It supports local and WebDAV content sources, SQLite with Drizzle ORM, tRPC-compatible server routers, public/admin HTTP APIs, MCP, and AI-assisted content workflows.

**Tech Stack**: Astro, Vite, React 19, TypeScript, Tailwind CSS, tRPC, Drizzle ORM, SQLite, Bun runtime.

## Essential Commands

### Development

```bash
./scripts/setup.sh
bun run dev
bun run site:dev
bun run admin:dev
bun run gateway:dev
bun run dev-db:reset
```

`bun run dev` starts the WebDAV helper, Astro public site, admin SPA, and Bun gateway. In worktrees, set explicit `PORT` and `WEBDAV_PORT` values before starting services.

### Testing

```bash
bun run test
bun run test:watch
bun run test:precommit
bun run test:e2e
bun run test:e2e:ui
bun run test-env:reset
bun run test-server:start
```

E2E tests start the gateway-backed stack and use `ENABLE_DEV_ENDPOINTS=true` only for compatibility test endpoints.

### Code Quality

```bash
bun run check
bun run fix
```

### Build & Deploy

```bash
bun run prebuild
bun run build
bun run start
bun run docker:build
```

`bun run build` produces `site-dist/`, `admin-dist/`, and `backend-dist/`. Production starts through `bun run gateway:start`.

## Architecture

### Runtime Surfaces

- Public site: Astro pages under `site/`, built to `site-dist/`.
- Admin UI: Vite React SPA under `apps/admin/`, built to `admin-dist/`.
- Gateway/backend: Bun server in `scripts/start-gateway.ts`, serving `/api/public/*`, `/api/admin/*`, `/api/files/*`, `/api/trpc/*`, `/api/health`, `/mcp`, admin assets, and public static assets.
- Dev/test endpoints: `/api/dev/*` and `/api/test/*` are gateway-owned and disabled in production unless `ENABLE_DEV_ENDPOINTS=true`.

### Content Management

- Local files: configured by `LOCAL_CONTENT_BASE_PATH`.
- WebDAV: configured by `WEBDAV_URL`, `WEBDAV_USERNAME`, and `WEBDAV_PASSWORD`.
- SQLite cache: posts, memos, comments, users, embeddings, sync state, and admin settings.

Content ingestion lives in `src/server/jobs/` and `src/lib/content-sources/`.

### APIs

- Server routers live in `src/server/routers/`.
- Gateway-owned HTTP adapters live under `src/server/*-api/`.
- tRPC compatibility is exposed through `src/server/trpc-http.ts`.
- MCP transport lives in `src/server/mcp-http.ts`.

### Authentication

Production traffic uses SSO/header identity plus session cookies, implemented in `src/lib/auth-utils.ts`. Local and E2E flows use `/api/dev/login` and `/api/dev/register` when dev endpoints are enabled. Admin access is determined by `ADMIN_EMAIL`.

### AI Features

AI-assisted search, model settings, tag organization, and vectorization live under `src/lib/ai/`, `src/server/services/`, and admin routers. Configure provider keys through environment variables or the admin settings surface.

## Important Patterns

- Use Bun for dependency, script, and test commands.
- Keep environment data isolated: `dev-data/` for development and `test-data/` for automated tests.
- Use `DB_PATH` explicitly when running database scripts.
- Use `PUBLIC_*` variables for browser-visible configuration.
- Use `LOCAL_MEMOS_PATH` for server memo roots and `PUBLIC_LOCAL_MEMOS_PATH` for client-visible memo root hints.
- Commit messages use Conventional Commits in English, with a body and signoff.

## Key Files

- `astro.config.mjs`: Astro public-site config.
- `apps/admin/vite.config.ts`: admin SPA config.
- `scripts/start-gateway.ts`: Bun gateway entrypoint.
- `docker-entrypoint.sh`: container runtime entrypoint.
- `playwright.config.ts`: E2E stack config.
- `drizzle.config.ts`: database migration config.
- `biome.jsonc`: formatting and linting config.
- `scripts/README.md`: script inventory.
