# CLAUDE.md

## Project Overview

Ivan's Blog is a personal content system built around an Astro public site, a Vite React admin SPA, and a Bun gateway/backend. The repository uses SQLite with Drizzle ORM, local Markdown content roots, tRPC-compatible routers, public/admin HTTP APIs, MCP, and AI-assisted workflows.

## Essential Commands

```bash
./scripts/setup.sh
bun run dev
bun run site:dev
bun run admin:dev
bun run gateway:dev

bun run test
bun run test:e2e
bun run test-env:reset

bun run check
bun run fix

bun run build
bun run start
```

## Runtime Model

- Public site: `site/`
- Admin SPA: `apps/admin/`
- Gateway/backend: `scripts/start-gateway.ts`
- Content source: local filesystem only, configured by `LOCAL_CONTENT_BASE_PATH`
- Database: SQLite, configured by `DB_PATH`

## Important Notes

- Use Bun for scripts, builds, and tests.
- Keep development data under `dev-data/` and automated test data under `test-data/`.
- Set `ADMIN_EMAIL` when a verification flow needs admin access.
- Use `LOCAL_MEMOS_PATH` for server memo roots and `PUBLIC_LOCAL_MEMOS_PATH` for client-visible memo root hints.
