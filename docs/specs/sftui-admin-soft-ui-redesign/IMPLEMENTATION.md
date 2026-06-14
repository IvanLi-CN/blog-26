# Admin Soft UI Redesign Implementation

Implementation state is tracked here while the `sftui` spec is active.

## Current Direction

- Use the approved Soft UI prompt as the visual source of truth.
- Ignore conflicting hard black-border template examples from the prompt because they violate the prompt's own forbidden rules.
- Preserve existing route, data, auth, and editor behavior while replacing the admin visual system.
- Keep all new reusable interaction primitives behind local components.
- Keep admin demo mode pure frontend and mock-only so it can be opened without sessions, seeded data, or backend services.

## Delivery Notes

- Storybook coverage is required for new and changed shared components.
- Visual evidence must be written back to the spec and shown in chat before PR handoff.
- Demo mode is toggled on real admin URLs with `?demo=true|false`, remembered in `localStorage`, and never exposed through a standalone demo route.
- The real admin `main.tsx` dynamically installs `setupAdminDemoApiMocks()` only when remembered demo mode is active, then renders the normal TanStack Router instance and shipped route tree.
- Demo interactions are powered by mocked `/api/admin/*` and `/api/files/*` responses while navigation, filtering, dialogs, editor tabs, file browsing, saving, and route transitions use the real admin pages and components.
- The demo editor uses the real nested content repository tree, real AppShell route sidebar, and real `UniversalEditor` surface.
- The critique pass removes redundant card-like page headers across the demo, replaces large metric tiles with compact status strips, consolidates repeated LLM advanced controls, and removes the token page's non-actionable operation preview block.
- The audit pass fixes measurable demo quality issues: unnamed form controls, missing sync progress semantics, touch targets below 44px, compressed mobile editor tab labels, and visible API key values.
- The editor tab toolbar keeps mobile touch targets at 44px while restoring compact desktop density for tabs, close controls, and adjacent toolbar actions.
- The editor exposes WYSIWYG, Source, and side-by-side 对照 modes; there is no editor Preview mode. 对照 mode uses Milkdown's readonly support for the rendered pane and keeps Markdown source as the only editable pane.
- The demo editor fixture includes headings, lists, blockquotes, inline code, and a `tsx` fenced code block so rendering can be verified in all editor modes.
- The demo UI avoids visible implementation-mode explanatory copy; mock-only behavior remains an implementation detail of the real admin route bootstrap.
- New empty post saves are blocked client-side when the editor body is still blank, and the banner now shows a natural-language validation message instead of raw serialized Zod issue arrays.
- Admin API error mapping now preserves structured validation details for editor/post flows so the SPA can present stable friendly messages while keeping server-side validation authoritative.
- The editor accessibility pass names the hidden attachment upload field, SourceEditor textarea, and Crepe link input to avoid unlabeled form controls.
- The editor frontmatter pass renders YAML as one inline block inside WYSIWYG and compare mode, auto-sizes the textarea so the full metadata stays visible without an inner scrollbar, exposes a visible focus ring on keyboard focus, aligns the frontmatter text column with the body text column, and removes the extra top margin on the first rendered heading so the body starts in the same vertical rhythm as the metadata block.
- The desktop AppShell sidebar width is controlled by `--admin-sidebar-width` in the shell grid, can be resized through a grip-style separator embedded in the sidebar card's right edge, exposes width values to assistive technology, shows a tooltip for discoverability, supports arrow-key/Home/End adjustment plus double-click reset to the default width, persists to `localStorage`, and reflows the main workspace instead of overlaying it.
- The desktop sidebar intentionally keeps its outer Soft UI card effect. Route-specific panels and session state render as lightweight internal sections, not nested cards, to avoid card nesting while preserving the left panel's visual container.

## Validation

- `bun run check`
- `bun run admin:build`
- `bun run check:public-no-daisy`
- `DB_PATH=./dev-data/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/local CONTENT_SOURCES=local bun run build`
- `bun run build-storybook`
- `bun run test`
- `WEB_PORT=61130 PORT=61130 SITE_PORT=61131 bun run test:e2e -- --project=admin-chromium`
- `BASE_URL=http://127.0.0.1:17500 ADMIN_EMAIL=admin@example.com bunx playwright test tests/e2e/admin/post-editor-markdown-modes.spec.ts --project=admin-chromium`
- `WEB_PORT=50590 SITE_PORT=50591 bunx playwright test tests/e2e/admin/post-editor-markdown-modes.spec.ts --project=admin-chromium`
- `bunx biome check apps/admin/src/styles.css tests/e2e/admin/post-editor-markdown-modes.spec.ts`

The production build requires explicit database and content-source environment variables in this worktree. Without them it falls back to `./sqlite.db`, which is not the seeded development database.
