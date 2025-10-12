# Repository Guidelines

## Project Structure & Module Organization

Source lives under `src/`, with page routes and API handlers in `src/app/`. Shared UI and providers sit in `src/components/`, while core libraries and utilities live under `src/lib/` (tests colocated in `src/lib/__tests__/`). Server routers inhabit `src/server/`. Scripts for database, content, and tooling are in `scripts/`. End-to-end specs are stored in `tests/e2e/`, and static assets in `public/`. Path alias `@/*` maps to `src/*` in TypeScript.

## Build, Test, and Development Commands

Install dependencies with `bun install`. Run the full dev stack using `bun run dev` (Next.js plus WebDAV).
Primary checkout uses `25090` (web) and `25091` (WebDAV). For worktrees, do not use these ports.
Set custom ports via env vars as noted in "Worktree Development".
Produce a production build via `bun run build`, then serve it using `bun run start`.
Lint and format with `bun run check`; auto-fix via `bun run fix`. Run ESLint using `bun run lint`.
For database workflows use `bun run migrate`, `bun run seed`, or `bun run dev-db:reset`.

### Dev Services & Ports (Agents)

- Defaults: `25090` (web), `25091` (WebDAV). These are used by the default Playwright config as well.
- Override via env when needed (no new config required):
  - `WEB_PORT` or `PORT`: overrides the web server port used by tests and dev.
  - `WEBDAV_PORT` or `DAV_PORT`: overrides the WebDAV port used by tests.
  - `BASE_URL`: overrides the Playwright base URL (otherwise derived from `WEB_PORT`).
  - `WEBDAV_URL`: overrides the WebDAV base URL (otherwise derived from `WEBDAV_PORT`).
- Reuse vs. new ports:
  - If a compatible dev stack is already running on the default ports and matches the current codebase/data, prefer reusing it (Playwright `reuseExistingServer: true`).
  - If defaults are busy or incompatible, pick unused ports and pass overrides, e.g.
    - `WEB_PORT=25190 WEBDAV_PORT=25191 bun run dev` (manual) and/or
    - `WEB_PORT=25190 WEBDAV_PORT=25191 bun run test:e2e` (Playwright will start/stop servers for tests).
  - Do not hijack unrelated processes on 25090/25091. Validate availability first: `lsof -iTCP:25090,25091 -sTCP:LISTEN -n`.

### Long-running commands & background management

These conventions apply to any automation agent (Codex, CI, or human-operated scripts) that cannot dedicate a foreground terminal to a persistent service.

- **Starting services in the background**: use `nohup bun run dev >tmp/dev.log 2>&1 & echo $! >tmp/dev.pid` (or a similar PID+log pattern) to launch the full dev stack without blocking. The `tmp/` directory keeps transient artefacts out of the repo.
- **Stopping services**: issue `kill $(cat tmp/dev.pid)` once downstream tasks finish, wait for the process to exit (`kill -0` loop if needed), then remove the PID file (`rm tmp/dev.pid`). Ensure required ports are free before a new launch.
- **Monitoring**: inspect or tail logs via `tail -f tmp/dev.log`; rotate or truncate long-lived logs inside the same directory to avoid unbounded growth.
- **Other scripts that persist**: `bun run dev:next`, `bun run start`, `bun run webdav:dev`, `bun run test-server:start`, and direct calls to `bun run src/scripts/start-integrated-server.ts` all remain active until terminated. Manage each with its own PID file/log pair if they run concurrently.
- **Playwright utilities**: interactive helpers—`bun run test:e2e:ui`, `bun run test:e2e:debug`, `bun run test:e2e:headed`, and `bun run test:e2e:report` (Playwright’s report viewer)—block until the UI is closed. Schedule an explicit `SIGINT`/`kill` in automated pipelines if they must be invoked.

## Coding Style & Naming Conventions

The project relies on Biome for formatting (2-space indent, max width 100, double quotes, trailing commas). ESLint extends `next/core-web-vitals` with strict TypeScript checks. Follow existing file naming patterns; prefer descriptive, kebab-case filenames within features. Leverage `@/*` imports instead of relative traversals to keep modules readable.

## Testing Guidelines

Unit and integration tests run with Bun's test runner via `bun run test`; keep specs close to the code they cover or under `src/lib/__tests__/`. E2E scenarios use Playwright in `tests/e2e/`; execute with `bun run test:e2e` (install browsers using `bunx playwright install`). Reset or seed test data with `bun run test-env:reset` and `bun run test-data:generate` before long runs.

## Runtime Verification Access

- Before invoking any runtime verification workflow, validate whether the scenario explicitly requires administrator permissions. Record the decision in your run notes so downstream agents understand the context.
- When admin access *is* required:
  - Set `ADMIN_EMAIL` for all relevant processes (Next.js dev server, Playwright, MCP tooling). Prefer `.env.local`; or prefix commands, e.g. `ADMIN_EMAIL=admin@example.com bun run dev`.
  - Playwright tests emulate SSO via `extraHTTPHeaders` using `SSO_EMAIL_HEADER_NAME` (defaults to `Remote-Email`). Do not run any reverse proxy in development.
  - For manual local verification in development, use the dev login API to establish a session: `POST /api/dev/login { email: ADMIN_EMAIL }` (only available in dev/test). Avoid proxy-based header injection during manual checks.
- When admin access is *not* required, state that explicitly and omit any header/session helpers to avoid masking authorization regressions during verification.

## Commit & Pull Request Guidelines

Commit messages must follow Conventional Commits (English subject ≤72 chars, body required). Example: `feat(memos): add lightbox for images` followed by rationale and test notes. Pull requests should summarize behavior changes, link related issues, document any new migrations, and attach screenshots or logs for UI or UX updates. Run `bun run check` and relevant tests before requesting review.

## Security & Configuration Tips

Store secrets in `.env.local`; never commit them. SQLite paths default to `./dev-data/sqlite.db` for development and `./test-data/sqlite.db` for automated tests. For production deployments, ensure the `DB_PATH` environment variable points at the desired volume (Docker default: `/app/data/sqlite.db`).

## Worktree Development (Concise)

- Create worktree and branch:
  - `git worktree add -b <branch> ../blog-nextjs-wt-<slug>`
- Initialize the new worktree with the setup script (required):
  - Default ports: `PORT=25090`, `WEBDAV_PORT=26091`.
  - If a default port is in use, supply available ports via environment variables. The script validates availability and exits on conflict. It does not create or modify any `.env*` files.
  - Examples:
    - `./scripts/setup.sh` (regenerates dev DB+data by default)
    - `./scripts/setup.sh --no-db` (skip DB reset and dev data generation)
- Run the dev stack:
  - `PORT=<web_port> bun run dev` (Next.js uses `PORT`; WebDAV helper will choose a free port near 25091 and print it in logs.)
  - Alternatively start services separately if needed.
