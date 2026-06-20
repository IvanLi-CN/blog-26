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
- The admin preview routes now act as authoring preview surfaces inside the Soft UI shell: post preview borrows the public article detail rhythm including its hero placement, while memo preview stays aligned with the public memo detail shell without adding a hero. Neither route imports the public Nature UI skin or tail modules.
- New empty post saves are blocked client-side when the editor body is still blank, and the banner now shows a natural-language validation message instead of raw serialized Zod issue arrays.
- Admin API error mapping now preserves structured validation details for editor/post flows so the SPA can present stable friendly messages while keeping server-side validation authoritative.
- The editor accessibility pass names the hidden attachment upload field, SourceEditor textarea, and Crepe link input to avoid unlabeled form controls.
- The editor frontmatter pass renders YAML as one inline block inside WYSIWYG and compare mode, auto-sizes the textarea so the full metadata stays visible without an inner scrollbar, exposes a visible focus ring on keyboard focus, aligns the frontmatter text column with the body text column, preserves in-progress whitespace such as keyboard-entered spaces and new lines, and removes the extra top margin on the first rendered heading so the body starts in the same vertical rhythm as the metadata block.
- The editor file contract now distinguishes `markdown` from `text` content explicitly. Extensionless and whitelisted text files open in true plain-text mode, stay Source-only, disable preview and attachment insertion, preserve image/video/Markdown/HTML references as raw text, and save without triggering content sync. Unsupported file types and text-editable files above `2 MiB` return friendly structured open errors instead of generic request failures.
- The frontmatter block now uses a local CodeMirror YAML editor in WYSIWYG mode only. It shares one diagnostics rule set with the editor save gate, provides field-name completion, boolean/date/category/tag suggestions, warns on unknown keys without deleting them, keeps diagnostics compact in the block header, and still anchors each problem to the offending line with line-range highlighting, line-end markers, and lint gutter indicators before blocking both database and file saves on frontmatter errors.
- Frontmatter save handling now runs a non-destructive style auto-fix pass for `tags` list indentation before validation persists the document. The save path rewrites only inconsistent list indentation into standard YAML array form, surfaces a compact informational toast when a style fix was applied, and then pushes the normalized document back into the live `UniversalEditor` instance so the tab status returns to `已保存` instead of being re-dirtied by stale in-memory content.
- The desktop AppShell sidebar width is controlled by `--admin-sidebar-width` in the shell grid, can be resized through a grip-style separator embedded in the sidebar card's right edge, exposes width values to assistive technology, shows a tooltip for discoverability, supports arrow-key/Home/End adjustment plus double-click reset to the default width, persists to `localStorage`, and reflows the main workspace instead of overlaying it.
- The desktop sidebar intentionally keeps its outer Soft UI card effect. Route-specific panels and session state render as lightweight internal sections, not nested cards, to avoid card nesting while preserving the left panel's visual container.
- Editor content changes now carry `programmatic` versus `user` metadata from Milkdown through `UniversalEditor` into the editor page. Initial Milkdown serialization, image URL normalization, and readonly preview synchronization can update the controlled editor state without marking a tab dirty; frontmatter edits, Source edits, WYSIWYG input, attachment insertion, and other real user changes still mark the tab dirty immediately.
- File-tree single click opens or reuses one replaceable temporary file tab. Double click promotes that file tab to permanent, and the first real edit also pins a temporary tab. Existing permanent or dirty tabs are activated rather than duplicated or replaced. Temporary tabs render their title in italic so preview state is visible without extra labels.
- File-tree keyboard rename is intentionally separated from the double-click permanent-tab gesture: `Enter` enters inline rename for the focused file or directory, while `Space` preserves the primary open/expand action and directories also honor `ArrowRight` / `ArrowLeft` for explicit expand/collapse.
- File-tree write operations surface row-level pending feedback on the affected entries and disable duplicate actions while requests are in flight, so create / rename / move / copy / delete do not look like silent no-ops.
- File-tree rename failures now roll back into the inline input instead of dropping the operator out of edit mode, with a restrained danger-tinted field treatment that does not add inline error copy or change the row height, while a persistent toast keeps the failure cause visible during correction.
- File-tree context actions now share one derived command model across the row-level context menu, blank-area context menu, and the row "more actions" dropdown. The admin UI exposes a local Radix-backed `ContextMenu` wrapper beside the existing dropdown/popover wrappers, so the file-tree menu portal escapes the sidebar card's `overflow-hidden` and filter chain, applies viewport collision handling, and keeps the same command set, disabled states, and destructive rules regardless of whether the operator right-clicks, uses the keyboard context-menu trigger, or opens the kebab menu.
- The editor tab strip is a single-line measured component with bounded tab widths and truncated labels. New tabs are inserted at the left edge so the most recent file appears first. Dirty state is represented by a dot inside tabs and overflow rows; the visible tab text never includes saved/unsaved status, while hover tooltips expose the full title and saved/unsaved status. Close and overflow controls are icon-only buttons, with background and outline appearing on hover/focus.
- Tabs that do not fit move behind a right-aligned overflow trigger. Desktop renders a floating vertical list of all open files. Mobile uses the third-party `vaul` drawer primitive through the local UI wrapper, with `data-vaul-drawer-direction="bottom"`, fixed positioning, full viewport width, bottom edge pinned to the viewport, a drawer handle, and internal list scrolling when needed.
- Storybook includes an `EditorTabOverflow` state gallery for the new tab strip behavior, including the desktop overflow list and mobile drawer surface.
- E2E coverage asserts opening frontmatter/image/table files stays saved until user edits, real edits show only the dirty dot in tabs, hover exposes status text, temporary tabs are italic, double-clicked tabs become permanent, tab rows do not wrap, and the mobile overflow surface is a bottom `vaul` drawer pinned to the viewport edges.

## Validation

- `bun run check`
- `bun run admin:build`
- `bun run check:public-no-daisy`
- `DB_PATH=./dev-data/sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/local CONTENT_SOURCES=local bun run build`
- `bun run build-storybook`
- `bun test apps/admin/src/components/preview-detail.test.tsx`
- `PLAYWRIGHT_START_PUBLIC_MEDIA_SIDECAR=0 PLAYWRIGHT_TEST_PROJECT=admin WEB_PORT=<leased> SITE_PORT=<leased+3> ADMIN_PORT=<leased+4> bunx playwright test tests/e2e/admin/preview-detail.spec.ts --project=admin`
- `bun test src/lib/__tests__/frontmatter-document.test.ts`
- `bun run test`
- `WEB_PORT=61130 PORT=61130 SITE_PORT=61131 bun run test:e2e -- --project=admin-chromium`
- `BASE_URL=http://127.0.0.1:17500 ADMIN_EMAIL=admin@example.com bunx playwright test tests/e2e/admin/post-editor-markdown-modes.spec.ts --project=admin-chromium`
- `WEB_PORT=50590 SITE_PORT=50591 bunx playwright test tests/e2e/admin/post-editor-markdown-modes.spec.ts --project=admin-chromium`
- `bunx biome check apps/admin/src/styles.css tests/e2e/admin/post-editor-markdown-modes.spec.ts`
- `bun run check`
- `bun run admin:build`
- `bun run build-storybook`
- `bunx playwright test tests/e2e/admin/post-editor-markdown-modes.spec.ts --project=admin -g "file tree more-actions menu can escape the sidebar card while staying inside the viewport|file tree right-click menu and more-actions menu expose the same command set|file tree keyboard menu key opens the current file menu without losing selection"`
- `WEB_PORT=63900 PORT=63900 bun run test:e2e -- --project=admin-chromium tests/e2e/admin/post-editor-markdown-modes.spec.ts`
- `WEB_PORT=39450 PORT=39450 SITE_PORT=39451 ADMIN_PORT=39452 bunx playwright test tests/e2e/admin/post-editor-markdown-modes.spec.ts --project=admin -g "WYSIWYG frontmatter block accepts keyboard spaces and new lines"`
- `bun test apps/admin/src/editor/universal-editor.test.tsx src/lib/__tests__/frontmatter-document.test.ts`
- `bunx biome check apps/admin/src/editor/universal-editor.tsx apps/admin/src/editor/universal-editor.test.tsx apps/admin/src/pages/editor.tsx src/lib/frontmatter-document.ts src/lib/__tests__/frontmatter-document.test.ts tests/e2e/admin/post-editor-markdown-modes.spec.ts`
- `PLAYWRIGHT_DISABLE_WEBSERVER=1 BASE_URL=http://127.0.0.1:25094 bunx playwright test tests/e2e/admin/post-editor-markdown-modes.spec.ts --grep "saving auto-fixes frontmatter tags indentation style|WYSIWYG frontmatter block auto-sizes to short content"`

The production build requires explicit database and content-source environment variables in this worktree. Without them it falls back to `./sqlite.db`, which is not the seeded development database.
