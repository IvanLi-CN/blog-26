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

## 7. Validation

- `bun run check`
- `bun run check:public-no-daisy`
- `bun run build`
- `bun run build-storybook`
- Existing admin Playwright coverage for auth, SPA routing, PATs, memos/admin where relevant, and LLM settings
- Browser visual verification from deterministic local preview or Storybook surfaces

## 8. Visual Evidence

Evidence source: deterministic local production preview using seeded Playwright test data.

Evidence binding: `c1ade722`

Capture notes:

- `target_program=local test preview app`
- `capture_scope=browser-viewport`
- `viewport_strategy=playwright-viewport`
- `source_type=mock_ui`

![Dashboard desktop light](./assets/admin-dashboard-desktop-light.png)

![Posts desktop light](./assets/admin-posts-desktop-light.png)

![Editor desktop light](./assets/admin-editor-desktop-light.png)

![Content sync tablet light](./assets/admin-content-sync-tablet-light.png)

![LLM settings desktop dark](./assets/admin-llm-settings-desktop-dark.png)

![PAT destructive dialog desktop light](./assets/admin-pat-delete-dialog-desktop-light.png)

![Dashboard mobile dark](./assets/admin-dashboard-mobile-dark.png)
