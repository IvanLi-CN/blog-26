# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` Next.js App Router pages and API routes.
- `src/components/` React components; providers and UI primitives included.
- `src/lib/` Core libs (DB, utilities, content sources, tests in `__tests__/`).
- `src/server/` tRPC server, routers, integrated HTTP server entry.
- `scripts/` Database, content, WebDAV, and test utilities.
- `tests/e2e/` Playwright specs and helpers; reports in `test-results/`.
- `public/` static assets. Path alias: `@/* → src/*` (see `tsconfig.json`).

## Build, Test, and Development Commands
- Install: `bun install` (Bun ≥1.0).
- Dev (Next.js + WebDAV): `bun run dev`.
- Build: `bun run build` (runs `scripts/generate-version.ts` then `next build`).
- Start production: `bun run start`.
- Lint/format: `bun run check` (Biome), `bun run fix`, `bun run lint` (ESLint).
- DB workflows: `bun run migrate`, `bun run seed`, `bun run dev-db:reset`.
- Unit/integration: `bun run test` (Bun test runner).
- E2E: `bun run test:e2e` (install browsers first: `bunx playwright install`).

## Coding Style & Naming Conventions
- Formatting via Biome (auto-run by lefthook): 2-space indent, LF, width 100, double quotes, semicolons, ES5 trailing commas, organized imports.
- ESLint: extends `next/core-web-vitals` and TypeScript rules; TypeScript is strict.
- Follow existing file naming patterns; do not rename without reason. Use `@/*` imports.

## Testing Guidelines
- Unit/integration tests live alongside modules or in `src/lib/__tests__/` as `*.test.ts`.
- E2E specs live in `tests/e2e/` as `*.spec.ts`; start via `bun run test:e2e`.
- For E2E debugging: `bun run test:e2e:ui` or `bun run test:e2e:debug`.
- Test data utilities: `bun run test-env:reset`, `bun run test-data:generate`, `bun run test-sync:trigger`.

## Commit & Pull Request Guidelines
- Conventional Commits enforced by commitlint (English-only): `feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert`.
- Header ≤72 chars, no trailing period; body required with a blank line; subject/body must be English.
- Example: `feat(memos): add lightbox for images` + body explaining rationale and tests.
- PRs: clear description, link issues, include test plan/commands; attach screenshots for UI; update docs when behavior changes.

## Security & Configuration Tips
- Keep secrets in `.env.local` (never commit). DB is controlled via `DB_PATH`.
  - Dev default: `./dev-data/sqlite.db`
  - Test default: `./test-data/sqlite.db`
  - Docker prod default: `/app/data/sqlite.db` (via compose volume)
- E2E requires `dufs` for WebDAV; see `README.md` and `tests/e2e/README.md`.

## Agent-Specific Notes
- Keep patches minimal and scoped; prefer `rg` for search.
- Run `bun run check` and relevant tests before submitting.
