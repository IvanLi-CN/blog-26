# Implementation

## Current State

- The gateway owns the remaining compatibility endpoints through Bun handlers.
- The development and test stacks no longer start an internal Next process.
- The old Next app/page tree, config, proxy, instrumentation, integrated server, and Next lint entrypoints have been removed.
- Shared styles used by Astro moved to `src/styles/`.
- Active docs and package metadata describe the Astro public site, admin SPA, and Bun gateway runtime.

## Compatibility Notes

- `/api/dev/*` remains available outside production for dev-auth and content sync test workflows.
- `/api/test/*` remains available for Playwright and server tests according to each handler's environment guard.
- `/api/trpc/*` remains as gateway-owned compatibility for legacy client/test flows that still speak tRPC.
- `/api/tags/organize` remains as a compatibility alias for the admin tag organization contract.

## Verification Status

- `bun install`: passed.
- `bun run check`: passed, 351 files checked.
- `bun run test`: passed, 339 tests.
- `bun run build`: passed for prebuild, Astro public site, admin SPA, and backend gateway bundle.
- `WEB_PORT=25700 HEADLESS=true bunx playwright test tests/e2e/guest/astro-front-phase1.spec.ts tests/e2e/admin/admin-spa-phase2.spec.ts tests/e2e/guest/dev-auth.spec.ts tests/e2e/user/session-header-auth.spec.ts`: public/admin smoke passed; dev-auth/session compatibility was filtered by project `testMatch` before the config update.
- `WEB_PORT=25720 HEADLESS=true bunx playwright test tests/e2e/guest/dev-auth.spec.ts tests/e2e/user/session-header-auth.spec.ts`: passed.
- `WEB_PORT=30020 HEADLESS=true bunx playwright test tests/e2e/guest/rss.spec.ts tests/e2e/guest/dev-auth.spec.ts tests/e2e/user/session-header-auth.spec.ts`: passed, 19 tests.
- Static active-path scan for `next`, `@next/*`, `nextjs-toploader`, `next dev`, `next.config`, `src/app`, `src/pages`, `INTERNAL_NEXT_PORT`, `/_next`, and `next/*`: passed.
- `bun pm why next`: reports no package matching `next` in the lockfile.
- GitHub Actions workflow scan: active CI/release/E2E paths no longer use Next runtime markers; the Docker smoke test now asserts the gateway-owned health shape.

## Review Status

- First review finding: `/api/test/*` needed an explicit production gate. The gateway now serves dev/test compatibility endpoints only outside production or when `ENABLE_DEV_ENDPOINTS=true`, with router coverage.
- Second review finding: `/rss.xml` compatibility redirect needed to remain available. The gateway now redirects `/rss.xml` to `/feed.xml`, and RSS Playwright coverage is included in the guest project.
- CI finding: Docker smoke still expected the removed `legacyNext` health payload. The workflow now checks the static public site, admin build, and gateway API health fields.
- Final review: no in-scope blocking findings.

## Documentation Status

- `project_doc_disposition=update`: current project docs and metadata were refreshed for the Astro public site, admin SPA, and Bun gateway runtime.
- `solution_disposition=none`: no reusable cross-task solution document was needed beyond this owning spec.
