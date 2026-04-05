# SPEC: Nature Frontend Redesign Without DaisyUI

- Spec ID: `n8ure`
- Status: `in-progress`
- Last Updated: `2026-04-05`
- Owner: `main-agent`

## 1. Background

The public blog frontend currently mixes content-focused pages with DaisyUI theme tokens and component classes.
That keeps the UI tied to rectangular, component-library-driven styling and prevents a coherent nature-inspired visual language.
We need a frontend-owned design system that keeps routes and content behavior stable while replacing the public presentation layer with a calmer, more organic interface.

## 2. Goals

1. Replace DaisyUI-driven public styling with a dedicated Nature design system for the visitor-facing frontend.
2. Keep public routes, data fetching, metadata, comments, tags, search, and memo behavior unchanged.
3. Reduce theme behavior to `light`, `dark`, and `system`, driven by a custom `data-ui-theme` runtime.
4. Provide deterministic visual verification for the redesigned public pages through a stable local preview surface and recorded screenshots.

## 3. Non-goals

- No admin panel redesign or admin-only component migration.
- No content model, API, search contract, comment moderation, or sync workflow changes.
- No repository-wide DaisyUI dependency removal in the same change.
- No Storybook adoption for this task.

## 4. Contract

### 4.1 Theme runtime

- The public frontend uses `light`, `dark`, and `system` only.
- The root document stores the resolved public theme in `data-ui-theme`.
- Legacy `data-theme` stays synchronized to `light` or `dark` only for un-migrated surfaces that still expect it.

### 4.2 Public styling boundary

- Public pages and their shared components must not rely on DaisyUI classes such as `btn`, `card`, `badge`, `alert`, `input`, `dropdown`, `navbar`, `loading`, `modal`, or `tabs`.
- Public pages and their shared components must not rely on DaisyUI semantic color tokens such as `bg-base-*`, `text-base-*`, `border-base-*`, `text-primary`, or similar public-facing theme shortcuts.
- The public frontend instead uses custom CSS variables, custom surface/button/input classes, and page-specific layout primitives.

### 4.3 Visual language

- The public shell uses soft gradients, translucent surfaces, organic radii, and low-frequency ambient motion.
- Reading-heavy pages keep motion density lower than index/list pages.
- Reduced-motion users receive the same layout and hierarchy with heavily reduced animation and particle effects.

## 5. Acceptance criteria

1. `/`, `/posts`, `/posts/[slug]`, `/memos`, `/memos/[slug]`, `/tags`, `/tags/[...tagSegments]`, `/search`, `/about`, and `/projects` render with the Nature design system in `light`, `dark`, and `system`.
2. The public theme toggle exposes only `light`, `dark`, and `system`.
3. Public-path source checks fail if DaisyUI public classes or DaisyUI semantic color tokens reappear in the guarded frontend files.
4. `/theme-test` acts as a stable visual preview surface for the shared public design language.
5. Existing public behaviors keep working: search, pagination, tag navigation, comments, memo browsing, markdown rendering, and theme persistence.
6. Reduced-motion mode disables or significantly softens particles, gooey motion, and ripple effects without harming usability.

## 6. Validation

- `bun run check:public-no-daisy`
- `git diff --name-only -- '*.ts' '*.tsx' '*.css' '*.json' '*.md' | xargs bunx biome check`
- `bun test src/lib/__tests__/theme.test.ts`
- `BASE_URL=http://localhost:30091 WEBDAV_URL=http://localhost:30090 PORT=30091 WEBDAV_PORT=30090 PLAYWRIGHT_REUSE_APP=true PLAYWRIGHT_REUSE_WEBDAV=true bunx playwright test tests/e2e/guest/nature-front-coverage.spec.ts tests/e2e/guest/theme-contrast.spec.ts tests/e2e/guest/posts-title-contrast.spec.ts tests/e2e/guest/memos-guest.spec.ts tests/e2e/guest/posts-visibility.spec.ts --project=guest-chromium`
- `bun run check` is still blocked by pre-existing repository-wide issues outside this scope:
  - `biome.jsonc` schema mismatch against the globally installed Biome CLI
  - existing admin/editor lint findings unrelated to the public Nature redesign

## 7. Visual Evidence

- Evidence captured against local branch `th/nature-front-redesign` at base HEAD `494cf5f` plus the uncommitted frontend redesign worktree state.
- Assets stored under `docs/specs/n8ure-nature-front-ui/assets/`.

PR: include
![Home light](./assets/home-light.png)

PR: include
![Home dark](./assets/home-dark.png)

PR: include
![Theme test light](./assets/theme-test-light.png)

PR: include
![Post detail dark](./assets/post-detail-dark.png)

![Search mobile light](./assets/search-mobile-light.png)

## 8. Change log

- 2026-04-05: Created spec for the public Nature redesign and DaisyUI decoupling.
