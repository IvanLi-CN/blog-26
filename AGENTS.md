# Repository Guidelines

## Project Structure

Source lives under `src/`, shared UI under `src/components/`, libraries under `src/lib/`, server code under `src/server/`, the public Astro app under `site/`, the admin SPA under `apps/admin/`, scripts under `scripts/`, and E2E tests under `tests/e2e/`.

## Build, Test, and Development

- Install dependencies with `bun install`.
- Start the dev stack with `bun run dev`.
- Build with `bun run build` and serve with `bun run start`.
- Lint and format with `bun run check` / `bun run fix`.
- Use `bun run migrate`, `bun run seed`, `bun run dev-db:reset`, and `bun run test-env:reset` for database workflows.

### Ports and Env

- Default gateway port: `25090`.
- In worktrees, choose a free alternate `PORT` before starting services.
- Export `DB_PATH` and `LOCAL_CONTENT_BASE_PATH` before running sync, dev, or test flows.
- The project now uses only the local filesystem content root; no remote content-source service should be started or documented.

## Testing

- Unit and integration tests: `bun run test`
- E2E tests: `bun run test:e2e`
- Reset test data first with `bun run test-env:reset` when needed.

## Verification

- Set `ADMIN_EMAIL` when a flow requires admin access.
- Prefer the dev login API for manual local verification: `POST /api/dev/login`.
- Avoid introducing proxy-based auth shortcuts that mask authorization regressions.

## Commits

- Use Conventional Commits in English.
- Run `bun run check` and relevant tests before asking for review.
