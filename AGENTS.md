# Repository Guidelines

## Project Structure & Module Organization

Source lives under `src/`, with page routes and API handlers in `src/app/`. Shared UI and providers sit in `src/components/`, while core libraries and utilities live under `src/lib/` (tests colocated in `src/lib/__tests__/`). Server routers inhabit `src/server/`. Scripts for database, content, and tooling are in `scripts/`. End-to-end specs are stored in `tests/e2e/`, and static assets in `public/`. Path alias `@/*` maps to `src/*` in TypeScript.

## Build, Test, and Development Commands

Install dependencies with `bun install`. Run the full dev stack using `bun run dev` (Next.js plus WebDAV). Produce a production build via `bun run build`, then serve it using `bun run start`. Lint and format the codebase with `bun run check`; auto-fix minor issues using `bun run fix`. Execute ESLint rules through `bun run lint`. For database workflows use `bun run migrate`, `bun run seed`, or `bun run dev-db:reset` as required.

## Coding Style & Naming Conventions

The project relies on Biome for formatting (2-space indent, max width 100, double quotes, trailing commas). ESLint extends `next/core-web-vitals` with strict TypeScript checks. Follow existing file naming patterns; prefer descriptive, kebab-case filenames within features. Leverage `@/*` imports instead of relative traversals to keep modules readable.

## Testing Guidelines

Unit and integration tests run with Bun's test runner via `bun run test`; keep specs close to the code they cover or under `src/lib/__tests__/`. E2E scenarios use Playwright in `tests/e2e/`; execute with `bun run test:e2e` (install browsers using `bunx playwright install`). Reset or seed test data with `bun run test-env:reset` and `bun run test-data:generate` before long runs.

## Commit & Pull Request Guidelines

Commit messages must follow Conventional Commits (English subject ≤72 chars, body required). Example: `feat(memos): add lightbox for images` followed by rationale and test notes. Pull requests should summarize behavior changes, link related issues, document any new migrations, and attach screenshots or logs for UI or UX updates. Run `bun run check` and relevant tests before requesting review.

## Security & Configuration Tips

Store secrets in `.env.local`; never commit them. SQLite paths default to `./dev-data/sqlite.db` for development and `./test-data/sqlite.db` for automated tests. For production deployments, ensure the `DB_PATH` environment variable points at the desired volume (Docker default: `/app/data/sqlite.db`).
