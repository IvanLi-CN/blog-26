# Repository Guidelines

## Project Structure & Module Organization

Source lives under `src/`, with page routes and API handlers in `src/app/`. Shared UI and providers sit in `src/components/`, while core libraries and utilities live under `src/lib/` (tests colocated in `src/lib/__tests__/`). Server routers inhabit `src/server/`. Scripts for database, content, and tooling are in `scripts/`. End-to-end specs are stored in `tests/e2e/`, and static assets in `public/`. Path alias `@/*` maps to `src/*` in TypeScript.

## Build, Test, and Development Commands

Install dependencies with `bun install`. Run the full dev stack using `bun run dev` (Next.js plus WebDAV). Both development and test environments must bind the web service to port `25090` and the WebDAV service to port `25091` to stay compliant with shared infrastructure. Produce a production build via `bun run build`, then serve it using `bun run start`. Lint and format the codebase with `bun run check`; auto-fix minor issues using `bun run fix`. Execute ESLint rules through `bun run lint`. For database workflows use `bun run migrate`, `bun run seed`, or `bun run dev-db:reset` as required.

### Long-running commands & background management

These conventions apply to any automation agent (Codex, CI, or human-operated scripts) that cannot dedicate a foreground terminal to a persistent service.

- **Starting services in the background**: use `nohup bun run dev >tmp/dev.log 2>&1 & echo $! >tmp/dev.pid` (or a similar PID+log pattern) to launch the full dev stack without blocking. The `tmp/` directory keeps transient artefacts out of the repo.
- **Stopping services**: issue `kill $(cat tmp/dev.pid)` once downstream tasks finish, wait for the process to exit (`kill -0` loop if needed), then remove the PID file (`rm tmp/dev.pid`). Always verify that ports `25090/25091` are free before a new launch.
- **Monitoring**: inspect or tail logs via `tail -f tmp/dev.log`; rotate or truncate long-lived logs inside the same directory to avoid unbounded growth.
- **Other scripts that persist**: `bun run dev:next`, `bun run start`, `bun run webdav:dev`, `bun run test-server:start`, `bun run dev:proxy` (`scripts/local-proxy.ts`), and direct calls to `bun run src/scripts/start-integrated-server.ts` all remain active until terminated. Manage each with its own PID file/log pair if they run concurrently.
- **Playwright utilities**: interactive helpers—`bun run test:e2e:ui`, `bun run test:e2e:debug`, `bun run test:e2e:headed`, and `bun run test:e2e:report` (Playwright’s report viewer)—block until the UI is closed. Schedule an explicit `SIGINT`/`kill` in automated pipelines if they must be invoked.

## Coding Style & Naming Conventions

The project relies on Biome for formatting (2-space indent, max width 100, double quotes, trailing commas). ESLint extends `next/core-web-vitals` with strict TypeScript checks. Follow existing file naming patterns; prefer descriptive, kebab-case filenames within features. Leverage `@/*` imports instead of relative traversals to keep modules readable.

## Testing Guidelines

Unit and integration tests run with Bun's test runner via `bun run test`; keep specs close to the code they cover or under `src/lib/__tests__/`. E2E scenarios use Playwright in `tests/e2e/`; execute with `bun run test:e2e` (install browsers using `bunx playwright install`). Reset or seed test data with `bun run test-env:reset` and `bun run test-data:generate` before long runs.

## Runtime Verification Access

- Before invoking any runtime verification workflow, validate whether the scenario explicitly requires administrator permissions. Record the decision in your run notes so downstream agents understand the context.
- When admin access *is* required:
  - Ensure `ADMIN_EMAIL` is populated and shared across every process involved (Next.js dev server, Playwright, MCP tooling). Prefer defining it in `.env.local`; otherwise prefix the command, e.g. `ADMIN_EMAIL=admin@example.com SSO_EMAIL_HEADER_NAME=Remote-Email bun run dev`.
  - Keep `SSO_EMAIL_HEADER_NAME` aligned with the upstream proxy (defaults to `Remote-Email`). Both the app (`src/lib/auth.ts`) and Playwright (`playwright.config.ts`) read this value to inject the same header.
  - When launching Playwright or MCP-driven checks, export the same variables so the shared config issues the admin header automatically: `ADMIN_EMAIL=admin@example.com bun run test:e2e`. MCP tools that reuse the Playwright runner inherit the header list; custom MCP clients must set `[SSO_EMAIL_HEADER_NAME]=ADMIN_EMAIL` in `extraHTTPHeaders` before triggering runtime verification.
  - For manual browsing through the local reverse proxy (`scripts/local-proxy.ts`), start it with matching env so the proxy injects the correct admin header.
- When admin access is *not* required, state that explicitly and omit the header injection to avoid masking authorization regressions during verification.

## Commit & Pull Request Guidelines

Commit messages must follow Conventional Commits (English subject ≤72 chars, body required). Example: `feat(memos): add lightbox for images` followed by rationale and test notes. Pull requests should summarize behavior changes, link related issues, document any new migrations, and attach screenshots or logs for UI or UX updates. Run `bun run check` and relevant tests before requesting review.

## Security & Configuration Tips

Store secrets in `.env.local`; never commit them. SQLite paths default to `./dev-data/sqlite.db` for development and `./test-data/sqlite.db` for automated tests. For production deployments, ensure the `DB_PATH` environment variable points at the desired volume (Docker default: `/app/data/sqlite.db`).
