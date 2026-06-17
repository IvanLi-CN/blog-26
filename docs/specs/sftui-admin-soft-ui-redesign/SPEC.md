# SPEC: Admin Soft UI Redesign

- Spec ID: `sftui`
- Status: `in-progress`
- Owner: `main-agent`

## 1. Background

The admin SPA is functionally complete but visually hard to trust for repeated author and operator work. This redesign replaces the admin visual system with a Soft UI direction while keeping the existing `/admin/*` SPA ownership, browser-visible API contracts, auth semantics, and editor capabilities.

The existing admin code is only a source of route, data, and behavior truth. Its styling, typography, spacing, and layout are not design references for this work.

## 2. Goals

1. Redesign the full `apps/admin` interface using the approved Soft UI style: large radii, low-saturation surfaces, soft shadows, clear focus states, and friendly but precise controls.
2. Treat light and dark themes as equal first-class themes.
3. Cap the primary workspace near `1440px` on wide screens while keeping navigation and workflows efficient.
4. Provide mobile-compatible navigation, tables, forms, and editor surfaces.
5. Wrap approved Radix primitives behind local admin components instead of scattering primitive imports through pages.
6. Capture deterministic Storybook and browser visual evidence before PR handoff.

## 3. Non-goals

- No server/API contract migration.
- No full UI kit adoption.
- No new DaisyUI usage in shipped admin surfaces.
- No `@radix-ui/react-icons`; admin icons stay on `lucide-react`.
- No redesign of public Astro pages.

## 4. UI Library Policy

The redesign keeps React, Tailwind CSS 4, local shadcn-style primitives, lucide, Iconify for existing tag-icon surfaces, Inter, TanStack Router/Query, Milkdown, and Storybook.

The redesign adds Radix primitives for accessible local components:

- `@radix-ui/react-dialog`
- `@radix-ui/react-dropdown-menu`
- `@radix-ui/react-popover`
- `@radix-ui/react-tabs`
- `@radix-ui/react-select`
- `@radix-ui/react-tooltip`
- `@radix-ui/react-checkbox`
- `@radix-ui/react-radio-group`
- `@radix-ui/react-label`
- `@radix-ui/react-separator`

Existing `@radix-ui/react-slot` and `@radix-ui/react-switch` remain part of the local component foundation.

## 5. Scope

In scope:

- Admin theme tokens and global CSS.
- Local admin component primitives.
- Admin shell, navigation, responsive page frame, and mobile drawer.
- Dashboard, posts, editor, comments, content sync, schedules, schedule detail, schedule run detail, tags, tag icons, PATs, LLM settings, preview, and not-found states.
- Storybook state galleries for shared components and representative admin surfaces.
- Pure frontend admin demo mode for fast visual and interaction testing without auth or backend services.

Out of scope:

- Changing `/api/admin/*` response shapes.
- Moving `/memos` admin actions into the SPA.
- Removing DaisyUI from unrelated legacy/internal dependencies.

## 6. Acceptance Criteria

1. Every migrated admin route remains usable through the existing `apps/admin` router.
2. Browser requests still use the existing admin API and editor/file contracts.
3. The new shell uses a left functional navigation model on desktop and an accessible drawer pattern on mobile.
4. Main admin content is constrained to approximately `1440px` on wide screens.
5. Light and dark themes both render complete Soft UI surfaces with clear focus, hover, disabled, loading, empty, warning, success, and destructive states.
6. Shared controls use local wrappers over Radix primitives where approved.
7. Shipped admin files do not introduce DaisyUI classes.
8. Storybook covers the redesigned primitives and representative page states.
9. Visual evidence covers desktop, tablet, and mobile views for key admin workflows before PR handoff.
10. Demo mode is toggled only on real `/admin/*` URLs with `?demo=true|false`, and the choice is remembered in `localStorage`.
11. Demo-specific code is limited to API mocking and the tiny bootstrap needed to enable that mock layer; no standalone demo route exists, and the shell, pages, router, editor, navigation, and shared components are the shipped admin implementation.
12. The demo editor preserves the shipped editor interaction model: real file-tree and navigation modes share the left sidebar, opening content creates or activates editor tabs, tab state is independent per file, and WYSIWYG / Source / 对照 are the available editor modes. 对照 mode uses a read-only Milkdown rendered pane beside the editable Markdown source pane.
13. The editor renders Markdown syntax consistently across modes: Source mode keeps raw Markdown syntax visible, while WYSIWYG and the read-only compare preview render headings, lists, blockquotes, inline code, fenced code blocks, and syntax highlighting.
14. The desktop admin left sidebar is resizable with a visible drag handle embedded inside the right edge of the sidebar card, persists its width in `localStorage`, supports keyboard adjustment, exposes an accessible vertical separator with current width values, provides a discoverability tooltip, supports double-click reset to the default width, and uses the shell grid so widening the sidebar reduces the main workspace width instead of overlapping content. The sidebar keeps its outer card effect, while route-specific panels and user/build details render as lightweight sections instead of nested cards.

## 7. Validation

- `bun run check`
- `bun run check:public-no-daisy`
- `bun run build`
- `bun run build-storybook`
- Existing admin Playwright coverage for auth, SPA routing, PATs, memos/admin where relevant, and LLM settings
- Browser visual verification from deterministic local preview or Storybook surfaces

## 8. Visual Evidence

This section keeps only the final, currently valid screenshots grouped by workflow.

Shared capture contexts:

- Seeded preview baseline: deterministic local production preview using Playwright test data, `target_program=local test preview app`, `capture_scope=browser-viewport`, `viewport_strategy=playwright-viewport`, `source_type=mock_ui`, evidence binding `c1ade722`
- Real admin route verification: local Vite admin preview on shipped `/admin/*` routes with demo API mocks enabled through `?demo=true` and `localStorage["admin-demo-mode"]`

### Route Baseline

These screenshots show the shipped Soft UI direction across major routes, themes, and viewport classes.

![Dashboard desktop light](./assets/admin-dashboard-desktop-light.png)

![Posts desktop light](./assets/admin-posts-desktop-light.png)

![Editor desktop light](./assets/admin-editor-desktop-light.png)

![Content sync tablet light](./assets/admin-content-sync-tablet-light.png)

![LLM settings desktop dark](./assets/admin-llm-settings-desktop-dark.png)

![PAT destructive dialog desktop light](./assets/admin-pat-delete-dialog-desktop-light.png)

![Dashboard mobile dark](./assets/admin-dashboard-mobile-dark.png)

### Editor Workspace

Verified on `/admin/posts/editor?demo=true&slug=react-hooks-deep-dive`.

- Markdown mode parity: WYSIWYG renders formatted content, Source keeps raw Markdown syntax, and 对照 pairs the editable source pane with a read-only Milkdown preview
- Sidebar reflow: width persists and the shell grid reallocates space from main content instead of overlapping it; measured `272px => 1168px` and `404px => 1036px`
- File workflow: file actions share one toolbar, inline rename stays in place, the tree fills the available sidebar height, and the sidebar remains free of removed remote-source UI
- File-tree keyboard contract: `Enter` on the focused file or directory enters inline rename, `Space` keeps the primary open/expand action, and directories also support `ArrowRight` / `ArrowLeft` for explicit expand and collapse
- File-tree write clarity: create / rename / move / copy / delete show row-level pending feedback on the affected items so the operator can see which entry is submitting without relying on toast timing alone; rename failures keep inline editing active, tint the input into an error state without adding inline error copy or shifting row layout, and keep the error toast visible until dismissed
- Validation clarity: saving a brand-new blank article stops in-place with a natural-language banner instead of exposing raw validation issue arrays
- Real-root file creation: creating a file inside a configured root such as `Hardware/` succeeds immediately and enters inline rename without surfacing an uninitialized local-source error
- Empty-file and viewport behavior: a newly created empty file opens immediately, editor surfaces keep full-height layout, and scrolling stays inside the editing panes
- Card hierarchy: only the outer sidebar/editor shells keep the framed card treatment; inner editor regions stay flat
- Frontmatter editing rhythm: WYSIWYG keeps frontmatter as a single inline YAML block, shows the complete metadata without an internal scrollbar, preserves visible keyboard focus, aligns YAML and body text columns, preserves keyboard-entered spaces and new lines, and keeps the body heading within the same vertical writing rhythm instead of dropping it into a large gap
- Tab overflow and preview-open behavior: editor tabs stay on one text-line height with truncated long titles, new tabs appear from the left, dirty tabs show a dot rather than status text, hover tooltips expose the full title and saved/unsaved status, close and overflow actions are pure icon buttons, overflow opens a vertical list of all open files on desktop, the same control becomes a third-party bottom drawer on mobile, and file-tree single click uses one replaceable italic temporary tab until double click or real editing makes it permanent

![Admin demo editor WYSIWYG Markdown rendering](./assets/demo/editor-focused-dark-wysiwyg-markdown-code.trimmed.png)

![Admin demo editor Source Markdown syntax](./assets/demo/editor-focused-dark-source-markdown-code.trimmed.png)

![Admin demo editor compare source and Milkdown preview](./assets/demo/editor-focused-dark-compare-markdown-code.trimmed.png)

![Admin demo editor with default sidebar width](./assets/demo/sidebar-resize-default-272.trimmed.png)

![Admin demo editor with expanded sidebar width](./assets/demo/sidebar-resize-expanded-404.trimmed.png)

![Admin demo editor with discoverable sidebar grip](./assets/demo/sidebar-resize-grip-default-272.trimmed.png)

![Admin demo editor focused sidebar grip with tooltip](./assets/demo/sidebar-resize-grip-focused-tooltip.trimmed.png)

![Admin demo editor sidebar card with flattened inner sections](./assets/demo/sidebar-card-flattened-inner-sections.trimmed.png)

![Admin editor with unified file toolbar](./assets/demo/admin-editor-file-toolbar-unified.png)

![Admin editor file tree inline rename](./assets/demo/admin-editor-file-tree-inline-rename.png)

![Admin editor file tree keyboard Enter enters inline rename](./assets/demo/admin-editor-file-tree-enter-rename.trimmed.png)

![Admin editor file tree row-level rename pending state](./assets/demo/admin-editor-file-tree-rename-pending.trimmed.png)

![Admin editor file tree keeps rename editing active with persistent error feedback](./assets/demo/admin-editor-file-tree-rename-error-retry.trimmed.png)

![Admin editor file tree fills available sidebar height](./assets/demo/admin-editor-sidebar-plain-file-icon-counts.png)

![Admin editor blocks blank new-post saves with a friendly banner](./assets/demo/admin-editor-empty-post-friendly-error.png)

![Admin editor creates files inside the Hardware root and enters inline rename](./assets/demo/admin-editor-hardware-create-file-inline-rename.png)

![Admin editor opens a newly created empty file](./assets/demo/admin-editor-empty-file-open.trimmed.png)

![Admin editor empty file surface fills the editor height](./assets/demo/admin-editor-empty-file-height-fixed.trimmed.png)

![Admin editor compare mode fits viewport height with internal pane scrolling](./assets/demo/admin-editor-viewport-height-compare.trimmed.png)

![Admin editor workspace with nested cards removed](./assets/demo/admin-editor-de-nested-workspace.trimmed.png)

![Admin editor frontmatter block and tightened body rhythm](./assets/demo/frontmatter-body-gap-tightened.png)

![Admin editor frontmatter keyboard spaces and new lines](./assets/demo/frontmatter-whitespace-input.trimmed.png)

![Admin editor tab overflow desktop floating list](./assets/demo/admin-editor-tab-overflow-storybook-desktop.trimmed.png)

![Admin editor tab overflow mobile bottom drawer](./assets/demo/admin-editor-tab-overflow-web-demo-mobile-bottom-drawer.trimmed.png)

PR: include
source_type=storybook_canvas; target_program=mock-only; capture_scope=browser-viewport; sensitive_exclusion=N/A; submission_gate=approved
![Admin editor readable floating toast feedback](./assets/demo/admin-editor-readable-toast-feedback.png)

### Posts Workspace And Shell Chrome

Verified on `/admin/posts?demo=true`.

- Filter alignment: labels and controls share a single grid rhythm with `0px` top and bottom deltas, and batch actions stay on one line
- Desktop density: desktop controls render at `40px` height with `12px` radius while keeping the aligned filter rhythm
- Sidebar footer and bottom actions: the left sidebar keeps compact identity details, theme toggle, and public-site entry; branch/version/commit clutter is absent
- Main chrome cleanup: the right content area has no duplicated theme/public-site controls or workspace breadcrumb row
- Header compaction: the page header measures `76px` high on desktop and the title block centerline aligns with the action group
- Console state: no application errors were observed during these checks; the only known noise was `favicon.ico 404` on some captures

![Admin sidebar compact session footer without branch or version blocks](./assets/demo/admin-sidebar-compact-session.trimmed.png)

![Admin posts filter controls aligned on a shared grid](./assets/demo/admin-posts-filter-aligned.trimmed.png)

![Admin posts desktop controls with compact density](./assets/demo/admin-posts-desktop-density-compact.trimmed.png)

![Admin sidebar bottom actions with main top row removed](./assets/demo/admin-sidebar-bottom-actions-main-top-removed.trimmed.png)

![Admin compact page header aligned with actions](./assets/demo/admin-page-header-compact-aligned.trimmed.png)
