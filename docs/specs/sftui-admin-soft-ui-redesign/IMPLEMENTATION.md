# Admin Soft UI Redesign Implementation

Implementation state is tracked here while the `sftui` spec is active.

## Current Direction

- Use the approved Soft UI prompt as the visual source of truth.
- Ignore conflicting hard black-border template examples from the prompt because they violate the prompt's own forbidden rules.
- Preserve existing route, data, auth, and editor behavior while replacing the admin visual system.
- Keep all new reusable interaction primitives behind local components.

## Delivery Notes

- Storybook coverage is required for new and changed shared components.
- Visual evidence must be written back to the spec and shown in chat before PR handoff.

## Validation

- `bun run check`
- `bun run check:public-no-daisy`
- `DB_PATH=./dev-data/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/local CONTENT_SOURCES=local bun run build`
- `bun run build-storybook`
- `bun run test`
- `WEB_PORT=61130 PORT=61130 SITE_PORT=61131 bun run test:e2e -- --project=admin-chromium`

The production build requires explicit database and content-source environment variables in this worktree. Without them it falls back to `./sqlite.db`, which is not the seeded development database.
