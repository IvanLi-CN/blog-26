# SPEC: Nature Frontend Redesign Without DaisyUI

- Spec ID: `n8ure`
- Status: `done`
- Owner: `main-agent`

## Related ADRs

- [ADR 0001: Project Detail MDX Authoring](../../adr/0001-project-detail-mdx-authoring.md)
- [ADR 0002: Mobile Public Header Scroll Model](../../adr/0002-mobile-public-header-scroll.md)
- [ADR 0003: Public Mobile Content Stream](../../adr/0003-public-mobile-content-stream.md)
- [ADR 0007: Ambient WebGPU Capability Profile](../../adr/0007-ambient-webgpu-capability-profile.md)

## 1. Background

The public blog frontend currently mixes content-focused pages with DaisyUI theme tokens and component classes.
That keeps the UI tied to rectangular, component-library-driven styling and prevents a coherent nature-inspired visual language.
We need a frontend-owned design system that keeps routes and content behavior stable while replacing the public presentation layer with a calmer, more organic interface.

## 2. Goals

1. Replace DaisyUI-driven public styling with a dedicated Nature design system for the visitor-facing frontend.
2. Keep public routes, data fetching, metadata, comments, tags, search, and established memo behavior unchanged, except for title resolution, metadata compatibility, and optional-title presentation defined by the [memo-title-semantics Spec](../memo-title-semantics/SPEC.md).
3. Reduce theme behavior to `light`, `dark`, and `system`, driven by a custom `data-ui-theme` runtime.
4. Provide deterministic visual verification for the redesigned public pages through a stable local preview surface and recorded screenshots.

## 3. Non-goals

- No admin panel redesign or admin-only component migration.
- No API, search, comment moderation, or sync workflow changes except the cross-layer memo title contract owned by [memo-title-semantics](../memo-title-semantics/SPEC.md). Project detail content now has an Astro MDX authoring path described by ADR 0001.
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
- The ambient public scene uses a transparent native-DPR WebGPU Canvas for normal-motion pages. The page's themed CSS background remains below the canvas; WebGPU draws three wind paths and the responsive leaf count with premultiplied alpha, pauses while the document is hidden, and uses requestAnimationFrame as a clock for approximately 30Hz visible submissions. Adapter limits are checked against the native-DPR backing and fixed seed buffer before the first resize; an internal `performanceScore` of 2 keeps the complete WebGPU scene, while score 1 keeps WebGPU and omits only the non-essential leaf outline. A score of 0 or an actual initialization/device failure uses SVG rather than lowering DPR. Queue completion timing, frame timing, private browser fields, vendor tables, and hardware heuristics never select a renderer or detail tier. Reduced-motion users and environments without a usable WebGPU adapter receive one complete deterministic SVG scene with three wind paths and the responsive leaf count. WebGPU initialization or device loss must fall back to SVG without leaving an animation scheduler running.
- Public route transitions expose a non-blocking pending indicator anchored to the site header. The indicator floats below the header frame without shifting document flow, sets page busy state while navigation is preparing, and clears after the next page load.
- Article and memo detail pages preserve server-rendered Markdown content for first paint while deferring interactive Markdown hydration until the content approaches the viewport; neither page may expose a persistent live loading state or static interaction guidance after content is readable.

### 4.4 Responsive control and code density

- At `min-width: 1024px` with a fine pointer, public text actions use a `36px` target; navigation, icon controls, and link-style badges use a `32px` target.
- Outside that desktop condition, interactive public controls use a minimum `44px` target. Static status badges remain compact and do not imply an interactive hit area.
- `MarkdownRenderer` owns the public Markdown code surface. Dark code blocks use a low-brightness green surface, AA-readable foreground and syntax tokens, `12px` vertical by `14px` horizontal padding, and a `12px` radius. Horizontal overflow and code folding remain available.
- Below `640px`, public page containers keep `12px` viewport gutters, content panels use `16px` horizontal padding, and surface radii step down to `16px`, `14px`, and `12px`. Structural wrappers may flatten to the page background when a nested surface adds no scanning or interaction value. Touch targets remain at least `44px`; the reduced spacing must not be achieved by shrinking interactive controls.
- Below `640px`, the homepage and Memos use a 移动内容流: chronological order, dates, and content-type metadata remain, while the decorative timeline rail, nodes, and connectors are removed. The homepage event entry follows the compact Memos item pattern, with only the article/Memo type icon immediately before the date; the desktop-only type text chip is not rendered visually in the narrow flow, but its text remains available to assistive technology.
- Below `375px`, mobile content-flow gaps, shell gutters, and section spacing compact further so the reading column gains width; below `360px`, navigation labels may collapse to their already-labelled icons.

### 4.5 Static search deep links

- The static `/search/` document must inspect the runtime URL before the first paint. When a non-blank `q` is present, the search input, query-aware status, and full loading skeleton expose the decoded keyword until React search results are ready.
- On narrow viewports, the public site header uses the same content-width container as the page body. Its primary navigation stays visible as the second header row; theme selection and RSS remain directly available without a navigation menu. The RSS control keeps a compact 36px visual frame so it does not compete with the theme selector.
- At `640px–1023px`, the public header keeps the brand and tool controls on the first row and primary navigation on the second. The navigation stays left-aligned with a fixed `16px` gap between links; the gap must not exceed the average content width of a navigation link. Unused row width remains to the right rather than stretching or centering the group.
- While the search island is pending hydration, its build-time empty state stays `hidden`, `inert`, and `aria-hidden`. The query-aware bootstrap is the only visible and accessible search surface.
- The bootstrap fills keyword nodes with `textContent` and the input `value`; it must not inject URL-derived HTML.
- The bootstrap hands off in place only after the React island emits its component-level ready signal from a committed query-aware render, including after Astro ClientRouter swaps. Missing, empty, or whitespace-only `q` values bypass it and keep the existing exploration state.
- If the island does not become ready within a bounded interval, the bootstrap keeps the keyword visible, replaces the result skeleton with an accessible loading-failure message, and offers a page reload instead of waiting indefinitely.
- At `438x852` and below the `sm` breakpoint, the query panel prioritizes the title, input, loading state, and result-type controls. The page-title kicker is omitted at every breakpoint so `搜索内容` remains the sole page-purpose label; its descriptive copy and redundant non-loading no-result summary recede on narrow viewports, while the first result surface starts in the first half of the viewport; desktop spacing and the no-keyword exploration state remain unchanged.
- The search query field uses the shared `nature-input-shell` color surface without an elevated shadow. Its compact 48px search variant uses a visible 1px border, 20px corners, and a 2px focus ring so the field remains recognizable without dominating adjacent controls or results.

### 4.6 Project media

- Project cards and detail heroes use a stable 4:5 poster frame. Cards with a repository-provided poster display that artwork without added text or a scrim. Cards without poster media use the domain fallback and project copy as their placeholder. Detail-page posters display supplied artwork without text or an overlay; the title and descriptions remain in the adjacent detail content.
- Versioned source PNGs live only under `site/assets/projects/posters-source/`. `generate:project-posters` creates ignored AVIF and WebP variants at 480w and 960w, dimensions, and a no-larger-than-2-KiB inline WebP preview. Neither `public/projects/posters/` nor `site-dist/projects/posters/` may contain a raw PNG source.
- Versioned social-preview source PNGs live only under `site/assets/projects/social-source/`. `generate:project-social-previews` creates ignored AVIF and WebP variants at 640w and 1280w, intrinsic dimensions, and a no-larger-than-2-KiB inline WebP preview. Neither `public/projects/social/` nor `site-dist/projects/social/` may contain a raw PNG source.
- Each generated 480w AVIF/WebP variant is limited to 100/150 KiB and each 960w variant to 250/350 KiB. The visual-order first three renderable posters may transfer at most 750 KiB as AVIF or 1.05 MiB as WebP at 960w.
- Each generated 640w social-preview AVIF/WebP variant is limited to 100/150 KiB and each 1280w variant to 250/350 KiB.
- Non-themed posters expose AVIF-first responsive `picture` candidates with WebP fallback, intrinsic dimensions, and a `sizes` contract. The light/dark poster pair binds only the resolved theme candidate at runtime, clears loading state on a theme change, and leaves the low-resolution preview and domain fallback visible on failure. Social previews use the same AVIF-first responsive contract, with a stable 2:1 frame and theme-aware candidate binding.
- On `/projects`, the first catalog poster uses `eager` and `fetchpriority=high`; every later catalog poster stays lazy. Detail-page poster media is eager and high priority.
- Poster and social-preview reveals use a 180ms opacity transition only when motion is allowed. Reduced-motion mode removes that transition without changing the fallback or layout.
- Project detail pages render a social preview only when a generated repository-provided asset exists. The image keeps a stable 2:1 intrinsic ratio and does not reserve a fixed height outside that ratio.

### 4.7 Project catalog and detail content

- Project cards expose only available online, documentation, and repository shortcuts. The online shortcut prefers the formal site over Demo; the documentation shortcut prefers official documentation over a documentation site.
- Project detail pages list all available public entries in the sidebar. The sidebar may also contain an H2/H3 table of contents when the MDX body has at least three headings.
- Project bodies live under `site/content/projects/` and remain continuous, project-specific prose. A missing body falls back to verified catalog material without generic filler cards.
- A project may provide paired `-light` and `-dark` poster or social-preview files. Complete pairs follow the resolved public theme, including the first page load and subsequent theme changes; incomplete pairs fall back to the single project asset or the existing generated poster surface.
- The project catalog uses six single-name groups: 开发工具 (3), 效率工具 (2), Web 产品 (2), 硬件产品 (3), 设备控制 (3), and 运维工具 (2). Every group stays within three cards, and the homepage selects one representative project from each group.
- The `/projects` page uses the title `项目` and shows the public-project and product-domain totals in its introduction. All domain groups share one surface, with subtle horizontal separators between sections and a horizontal poster rail in each group.
- Project title and shortcut links reflow when narrow space or enlarged text requires it; they must remain visible and must not create horizontal page overflow.

### 4.8 Mobile public header motion

- Below `640px`, every `BaseLayout` public page uses one real header element in
  normal document flow. It does not create a fixed clone, switch to a separate
  scroll container, or replace the header with a transform-driven duplicate.
- The header measures its complete height `H` and exposes a visible offset
  `V∈[0,H]` through sticky `top=V-H`. Positive document scroll movement reduces
  `V` one-for-one until the header is fully offscreen.
- Reverse movement is classified from a rolling `100ms` sample window. A
  reverse displacement below `12px` does not switch the active gesture; a
  reverse speed at or above `0.3px/ms` is eligible to restore the header one
  for one. Slow reverse movement does not actively reveal a fully hidden header;
  reaching the document origin restores the expanded endpoint.
- A release settles only after about `120ms` without effective movement. A
  hidden progress of at least `50%` snaps fully closed; fast reverse recovery of
  at least `20%` of the full header height snaps fully open; smaller gestures
  return to their gesture-start endpoint. While a touch contact is active,
  pauses do not settle the gesture; `touchend` or `touchcancel` starts the
  release settling window. Once a touch gesture has started moving the header,
  every subsequent document delta follows one-for-one in either direction
  until release; reverse speed and distance gates apply only before that direct
  follow mode starts.
- Fully collapsed descendants are removed from sequential Tab order. Programmatic
  focus entering the header expands it before focus delivery. `ResizeObserver`
  remeasures the header, Astro ClientRouter swaps reset the controller, reduced
  motion removes only the settling transition, and inner scroll containers are
  ignored.

### 4.9 Timeline and primary-action semantics

- A desktop timeline node represents one chronological content event. Every article and Memo event uses the same closed circular frame, dimensions, border, elevation, and connection rhythm at desktop; type must not remove or weaken that frame.
- Content type is secondary metadata. An icon and restrained semantic tint distinguish articles from Memos; desktop mixed-content surfaces may retain a visible text label when it improves clarity, but mobile content flows use only the inline icon and do not render a type text chip.
- Narrow layouts use 移动内容流 for the homepage and Memos: the rail, nodes, and connectors are absent, while the event order, date, and inline type icon remain. The icon is placed immediately before the date, matching the Memos item rhythm.
- `--nature-secondary-rgb` is the canonical RGB token for the public secondary color. Timeline rails, nodes, and other public components must use that name rather than introducing alternate names for the same color role.
- A primary action with text or an icon uses paired `--nature-action-primary-bg` and `--nature-action-primary-fg` tokens. The foreground must maintain at least a 4.5:1 contrast ratio against every visible default, hover, and focus background. A multi-stop gradient is allowed only when every declared stop is verified at or above 4.5:1; the homepage article action uses this verified gradient treatment (`#4e7e60` to `#294e3a` in light mode, `#88c1a0` to `#4f966e` in dark mode), while the search submit keeps the solid token background.
- The resolved primary-action pairs are `#477956` on `#f7fff8` in light mode and `#88c1a0` on `#0f1613` in dark mode. Shared public component selectors have one authoritative stylesheet so these pairs cannot drift between duplicate implementations.

### 4.10 Optional memo titles

- The public Nature frontend omits the visible title when a memo's resolved public title is absent. It does not substitute a slug or generated filename.
- Titleless memo cards and detail pages retain their date, type, tags, excerpt or body, and detail navigation. Protocol metadata fallbacks and title-resolution rules are defined by the memo-title-semantics Spec.

## 5. Acceptance criteria

1. `/`, `/posts`, `/posts/[slug]`, `/memos`, `/memos/[slug]`, `/tags`, `/tags/[...tagSegments]`, `/search`, `/about`, and `/projects` render with the Nature design system in `light`, `dark`, and `system`.
2. The public theme toggle exposes only `light`, `dark`, and `system`.
3. Public-path source checks fail if DaisyUI public classes or DaisyUI semantic color tokens reappear in the guarded frontend files.
4. `/theme-test` acts as a stable visual preview surface for the shared public design language.
5. Existing public behaviors keep working: search, pagination, tag navigation, comments, memo browsing, markdown rendering, and theme persistence.
6. Reduced-motion mode disables or significantly softens particles, gooey motion, and ripple effects without harming usability.
7. Same-site Markdown links, including same-origin absolute URLs, navigate in the current tab, while external Markdown links keep a new tab target and safe `rel` attributes.
8. Query-bearing search deep links keep the decoded keyword visible before, during, and after island hydration without exposing the no-keyword empty state or duplicate accessible controls; at `393px`, the public header aligns to the body container, exposes `Main navigation` as its second row, and keeps theme selection plus RSS directly available.
9. At a `438x852` mobile viewport with a non-empty query, the first result surface begins at or before `y=426`, leaving at least half of the first viewport for search results.
10. Public desktop and touch control density follow the `36px` / `32px` and `44px` contracts respectively without enlarging static status badges.
11. Public Markdown rendering never depends on a light highlighter stylesheet; dark code blocks retain readable syntax colors, horizontal overflow, and folding behavior.
12. Public pages at `393px` and `320px` do not overflow horizontally, keep `44px` touch targets, and use the compact mobile spacing and radius contract without changing desktop density.
13. Project posters render in 4:5 frames with a continuously readable image or placeholder state, responsive AVIF/WebP candidates, explicit dimensions, priority behavior, and reduced-motion-safe reveal behavior. Available social previews render in a stable intrinsic 2:1 frame with responsive AVIF/WebP candidates, and complete light/dark asset pairs follow the resolved public theme on first load and changes.
14. Poster asset generation and production builds fail when a raw public PNG, a missing generated variant, an oversized variant, or an oversized first-row transfer is detected.
15. The project catalog contains 15 entries across the six groups above; `/projects/spoti-bind` renders SpotiBind, and the homepage presents six featured projects derived from those groups. The project index shows both catalog totals, presents its groups in one shared surface, and keeps all poster titles and shortcuts usable at narrow widths and enlarged text.
16. On mobile public routes, the header follows the documented scroll, speed,
    release-settling, focus-order, resize, router, and reduced-motion contracts;
    desktop public behavior remains unchanged.
17. Desktop article and Memo timelines retain the shared circular node frame and connector rhythm; below `640px`, the homepage and Memos render a 移动内容流 with no rail, node, or connector, and place the type icon immediately before the date. The mobile type text chip is omitted without horizontal overflow.
18. Public primary actions meet a 4.5:1 foreground/background contrast ratio in light and dark themes for default, hover, and focus states.

19. Public memo surfaces omit an absent resolved title without substituting a slug, while preserving available date, type, tags, excerpt or body, and detail navigation; cross-layer resolution and protocol metadata follow the memo-title-semantics Spec.

## 6. Validation

- `bun run check:public-no-daisy`
- `git diff --name-only -- '*.ts' '*.tsx' '*.css' '*.json' '*.md' | xargs bunx biome check`
- `bun test src/lib/__tests__/theme.test.ts`
- `bun test tests/lib/project-poster-assets.test.ts`
- `bun test tests/lib/project-social-preview-assets.test.ts`
- `bun run generate:project-posters && PROJECT_POSTER_REQUIRE_DIST=1 bun run verify:project-posters`
- `DB_PATH=$(pwd)/test-data/sqlite.db LOCAL_CONTENT_BASE_PATH=$(pwd)/test-data/local CONTENT_SOURCES=local NEXT_PUBLIC_SITE_URL=http://localhost:30090 PUBLIC_SITE_URL=http://localhost:30090 bun run build`
- `BASE_URL=http://localhost:30090 PLAYWRIGHT_REUSE_APP=true DB_PATH=$(pwd)/test-data/sqlite.db LOCAL_CONTENT_BASE_PATH=$(pwd)/test-data/local CONTENT_SOURCES=local bunx playwright test tests/e2e/guest/astro-front-phase1.spec.ts tests/e2e/guest/hover-stability.spec.ts tests/e2e/guest/nature-front-coverage.spec.ts --project=guest`
- `PLAYWRIGHT_START_PUBLIC_MEDIA_SIDECAR=0 bunx playwright test --project=guest --grep "Code Block Rendering"`
- `bun run build-storybook`
- `bun run check`
- `bun test src/lib/__tests__/public-header-scroll.test.ts`
- `BASE_URL=http://localhost:30090 PLAYWRIGHT_REUSE_APP=true bunx playwright test tests/e2e/guest/nature-front-coverage.spec.ts --project=guest --grep "public header scroll|mobile header"

## Visual Evidence

### Project index grouped panel

- The public project index is captured at desktop (`1780px × 1071px`) and mobile (`393px × 852px`) sizes in light and dark themes after the grouped-panel refinement.
- Source type `ui_demo`; target program `Ego Browser`; capture scope `browser-viewport`; the owner confirmed that these images accurately show the current page.

![Project index desktop light](./assets/projects-index-grouped-desktop-light.png)

![Project index desktop dark](./assets/projects-index-grouped-desktop-dark.png)

![Project index mobile light](./assets/projects-index-grouped-mobile-light.png)

![Project index mobile dark](./assets/projects-index-grouped-mobile-dark.png)

### Project media showcase

- Evidence captured from the local Astro project catalog and detail pages after the final poster and social-preview assets were installed.
- The project wall uses a stable 4:5 presentation: media-backed catalog cards display supplied artwork without a copy layer or scrim, while media-free placeholders retain the fallback copy. Detail-page posters display supplied artwork without an overlay or added copy. Project detail pages show generated social previews in a stable 2:1 frame, and Tavily Hikari plus LoadLynx select matching light and dark variants from the active public theme.
- Source type `ui_demo`; target program `Chrome`; capture scope `browser-viewport`; sensitive exclusion `N/A`.

- OctoRill detail-page evidence was captured from the local Astro `ui_demo` at `1440px × 1100px` with the current poster and social-preview sources. Both themes select their matching `-light` and `-dark` poster and social-preview variants.

![OctoRill detail light](./assets/octo-rill-detail-light.png)

![OctoRill detail dark](./assets/octo-rill-detail-dark.png)

- Evidence binding `61146e8e2c450730eba77501b7f01b7b10dd0939` baseline to the current candidate; source type `ui_demo`, target program `mock-only`, capture scope `browser-viewport`, requested mobile viewport `393px × 852px`, viewport strategy `devtools-emulate`, margin policy `trim_only`, evidence surface `page`, sensitive exclusion `N/A`. The current candidate preserves the captured rest-state layout; the keyboard-focus summary expansion is covered by the focused guest Playwright contract.

![Current project wall light](./assets/projects-wall-light-current.png)

![Current project wall dark](./assets/projects-wall-dark-current.png)

![Current project wall light mobile](./assets/projects-wall-light-mobile-current.png)

![Current project wall dark mobile](./assets/projects-wall-dark-mobile-current.png)

![SpotiBind detail light](./assets/project-spoti-bind-light.png)

![SpotiBind detail dark](./assets/project-spoti-bind-dark.png)

![SpotiBind detail light mobile](./assets/project-spoti-bind-light-mobile.png)

![SpotiBind detail dark mobile](./assets/project-spoti-bind-dark-mobile.png)

![Project wall dark](./assets/projects-wall-dark.png)


![Tavily Hikari detail light](./assets/project-tavily-hikari-light.png)


![Tavily Hikari detail dark](./assets/project-tavily-hikari-dark.png)


![LoadLynx detail dark](./assets/project-loadlynx-dark.png)

### Project content migration

- Evidence captured from the current static Astro output after the 15 project bodies were compiled. Five representative groups were checked at desktop and `393px × 852px` mobile viewports in both light and dark themes; Hero, public-entry sidebar, optional TOC, continuous MDX prose, and footer remained readable without horizontal overflow. LoadLynx was rechecked after narrowing the ACK statement to the message types confirmed by its protocol sources.
- Source type `ui_demo`; target program `mock-only`; capture scope `browser-viewport`; viewport strategy `devtools-emulate`; margin policy `trim_only`; evidence surface `page`; sensitive exclusion `N/A`.
- Evidence binding: implementation commit `087e3031`; the LoadLynx capture set was refreshed after the factual content correction, while the page layout and rendered contracts remained unchanged.
- Representative captures: [Tavily Hikari desktop light](./assets/project-content-migration/tavily-hikari-desktop-light.webp), [Tavily Hikari mobile dark](./assets/project-content-migration/tavily-hikari-mobile-dark.webp), [SpotiBind desktop light](./assets/project-content-migration/spoti-bind-desktop-light.webp), [SpotiBind mobile dark](./assets/project-content-migration/spoti-bind-mobile-dark.webp), [LoadLynx desktop light](./assets/project-content-migration/loadlynx-desktop-light.webp), [LoadLynx mobile dark](./assets/project-content-migration/loadlynx-mobile-dark.webp), [Tuckmark desktop dark](./assets/project-content-migration/tuckmark-desktop-dark.webp), [Tuckmark mobile light](./assets/project-content-migration/tuckmark-mobile-light.webp), [XP desktop dark](./assets/project-content-migration/xp-desktop-dark.webp), and [XP mobile light](./assets/project-content-migration/xp-mobile-light.webp). Paired captures for each project and theme are stored beside these files.

- Evidence captured for the Mains Aegis light/dark poster and social-preview pair after importing the upstream dark campaign assets.
- The project wall and detail page keep the light artwork in light mode and select the matching dark artwork in dark mode without changing the surrounding layout.

![Mains Aegis project wall light](./assets/mains-aegis-projects-light.png)

![Mains Aegis project wall dark](./assets/mains-aegis-projects-dark.png)

![Mains Aegis detail light](./assets/mains-aegis-detail-light.png)

![Mains Aegis detail dark](./assets/mains-aegis-detail-dark.png)

- Evidence captured against local branch `th/nature-front-redesign` on the refreshed Nature frontend worktree state after the width, comment-form, and code-highlighting fixes.
- Assets stored under `docs/specs/nature-front-ui/assets/`.

![Home light](./assets/home-light.png)

![Home dark](./assets/home-dark.png)

![Theme test light](./assets/theme-test-light.png)

![Post detail dark](./assets/post-detail-dark.png)

![Search mobile light](./assets/search-mobile-light.png)

![Comment form fixed](./assets/comment-form-fixed.png)

![Code highlight fixed](./assets/code-highlight-fixed.png)

### Responsive control and dark code surface

- Evidence binding `7b2e49e54b241941b30c5350351d3a1392336471`; source type `storybook_canvas`, target program `mock-only`, capture scope `iframe-element`, sensitive exclusion `N/A`.
- Fine-pointer desktop keeps the public navigation compact at `32px`, Memo text actions at `36px`, and code at `12px × 14px` with a `12px` radius. The coarse-pointer mobile canvas restores `44px` navigation targets while retaining the same readable dark code surface. Both canvases confirm that the obsolete article interaction hint is absent.
- The dedicated desktop and mobile code stories use media-free Markdown fixtures so code-surface evidence does not depend on image-facade availability.

![Public dark code desktop](./assets/public-dark-code-desktop.png)

![Public dark code mobile](./assets/public-dark-code-mobile.png)

### Current mobile density refresh

- Evidence binding `7b2e49e54b241941b30c5350351d3a1392336471`; source type `storybook_canvas`, target program `mock-only`, capture scope `iframe-element`, requested viewport `393px × 852px`, sensitive exclusion `N/A`.
- The current mobile canvas keeps the public search controls and result cards aligned to the 12px shell gutter while retaining touch-sized actions.

![Public mobile density current](./assets/public-mobile-density-current.png)

### Project poster mobile radius

- Evidence binding `fd345db7e5cf08f380d7f009e0c3d8e35450fbb9`; source type `storybook_canvas`, target program `mock-only`, capture scope `element`, requested viewport `393px × 852px`, viewport strategy `storybook-viewport`, margin policy `require_margin`, evidence surface `component`, sensitive exclusion `N/A`.
- The compact ProjectPoster keeps a restrained `14px` mobile radius instead of inheriting the larger desktop compact radius, preserving visual density in narrow project cards.

![Public project poster mobile radius](./assets/public-project-poster-mobile-radius-current.png)

### Narrow mobile search density

- Evidence bound to implementation commit `59d66e54`; source type `storybook_canvas`, target program `mock-only`, capture scope `iframe element`, requested viewport `320x700`, viewport strategy `storybook-viewport`, margin policy `trim_only`, sensitive exclusion `N/A`.
- The narrow search state keeps its query panel at the mobile spacing contract, uses low-luminance surfaces for the filters and recommended terms, preserves 44px interactive controls, and does not overflow horizontally.

![Public narrow mobile search](./assets/public-search-narrow-mobile-dark.png)

### Ambient renderer selection

- Evidence binding `ce3e3963478d1ebee21cc909683114ed31e99fe6c6a14343f10a0257744d7c28`; source type `ui_demo`, target program `Ego Browser`, capture scope `browser-viewport`, and final production renderer `WebGPU with complete static SVG fallback`.
- The WebGPU scene and SVG fallback preserve the three wind paths and responsive leaf count in light, dark, and reduced-motion states. The WebGPU backing store uses the exact CSS size multiplied by the native device-pixel ratio; the SVG path is vector-scaled through its viewBox. Both paths pause or remain static while the document is hidden, and a failed WebGPU lifecycle must not leave an animation scheduler running. The renderer decision is recorded in [ADR 0007](../../adr/0007-ambient-webgpu-capability-profile.md); ADR 0004, ADR 0005, and ADR 0006 remain historical decision and benchmark records.

![Ambient renderer desktop light](./assets/ambient-webgpu-final-desktop-light.png)

![Ambient renderer mobile dark reduced motion](./assets/ambient-svg-final-mobile-dark-reduced.png)

## Context and Scope

This topic owns the public Nature frontend shell and its visitor-facing page surfaces. The project index, project detail routes, semantic public-entry shortcuts, project-specific MDX bodies, responsive reading layout, and their visual evidence are in scope. Memo title resolution is owned by the [memo-title-semantics Spec](../memo-title-semantics/SPEC.md); this topic owns its visible treatment. Backend APIs, admin surfaces, and the poster/social-preview generation pipelines remain outside this topic's project-detail content contract.

## Requirements

- `REQ-NATURE-MEMO-TITLE`: Public memo surfaces MUST omit an absent resolved title without substituting a slug, while preserving the date, type, tags, available excerpt or body, and detail navigation; resolution and protocol metadata rules are owned by the [memo-title-semantics Spec](../memo-title-semantics/SPEC.md).

- `REQ-NATURE-PROJECT-CATALOG`: The project catalog MUST own project identity, discovery copy, media references, and semantic public entries; card shortcuts MUST prefer the formal site over Demo, official documentation over a documentation site, and the public repository as the source entry.
- `REQ-NATURE-PROJECT-DETAIL-MDX`: Project detail bodies MUST be project-specific MDX with build-time slug validation, optional reviewed static content blocks, and a verified catalog-only fallback when no body exists.
- `REQ-NATURE-PROJECT-READING`: Project detail pages MUST keep the Hero free of duplicate external links, expose all available entries in the sidebar, and place the sidebar before the body on narrow screens while preserving readable heading navigation.
- `REQ-NATURE-PROJECT-INTERACTION`: Project-wall summaries MUST remain one-line and ellipsized at rest, expose their full text on keyboard focus, and keep icon-only external shortcuts weak at rest but usable on hover, focus, and touch.

## Verification

- `VER-NATURE-MEMO-TITLE`: covers: `REQ-NATURE-MEMO-TITLE`; public list and detail rendering checks verify title omission, retained content metadata, and working detail navigation for titleless memos.

- `VER-NATURE-PROJECT-CATALOG`: covers: `REQ-NATURE-PROJECT-CATALOG`; semantic-entry unit tests and the static site build verify precedence, labels, missing-entry omission, and public output.
- `VER-NATURE-PROJECT-DETAIL-MDX`: covers: `REQ-NATURE-PROJECT-DETAIL-MDX`; MDX loader/TOC tests, the migrated detail routes, the static build, and the detail-route fallback branch verify slug validation, reviewed block rendering, compiled bodies, and safe catalog-only fallback behavior for projects without a body.
- `VER-NATURE-PROJECT-READING`: covers: `REQ-NATURE-PROJECT-READING`; focused guest Playwright coverage and the desktop/mobile light/dark page evidence verify sidebar order, TOC behavior, spacing, and responsive stacking.
- `VER-NATURE-PROJECT-INTERACTION`: covers: `REQ-NATURE-PROJECT-INTERACTION`; focused guest Playwright coverage verifies rest-state truncation, focus-visible expansion, shortcut names/targets, and hover/focus contrast behavior.

### Desktop header search width

- Evidence bound to implementation commit `1aa481c5`; source type `storybook_canvas`, target program `mock-only`, capture scope `browser-viewport`, requested viewport `1280x720`, viewport strategy `storybook default`, sensitive exclusion `N/A`.
- The desktop search shell is `288px × 36px`. Its width balances the adjacent theme surface and RSS control cluster (`299px`) without changing the header's established vertical control sizes.

![Public desktop header search width](./assets/public-header-search-width-balanced-desktop.png)

### Desktop header control heights

- Evidence bound to implementation commit `0233f4a9`; source type `storybook_canvas`, target program `mock-only`, capture scope `browser-viewport`, requested viewport `browser default`, viewport strategy `storybook canvas`, sensitive exclusion `N/A`.
- On fine-pointer desktop, the search shell, theme-toggle outer surface, and RSS action are each exactly `36px` high with matching top and bottom edges. The mobile story separately measures search, theme selection, and RSS at `44px` each.

![Public dark desktop header control heights](./assets/public-header-controls-unified-dark-desktop.png)

### Medium-width header navigation

- Evidence bound to implementation commit `1c5305c858372668272bca2a20d6294e50382e44`, captured from the deterministic local Astro Demo in dark theme at `772x599` and `1023x800` CSS px. Source type `ui_demo`, target program `mock-only`, capture scope `browser-viewport`, viewport strategy `Playwright CSS viewport`, margin policy `trim_only`, sensitive exclusion `N/A`.
- The four links stay left-aligned on the second header row. Their fixed `16px` gaps remain below the measured `52px` average content width, and the page has no horizontal overflow. Guest E2E also covers the `640px` lower boundary.

![Medium-width public header at 772px](./assets/public-header-medium-compact-772-dark.png)

![Medium-width public header at 1023px](./assets/public-header-medium-compact-1023-dark.png)

### Compact mobile density (historical)

- Historical evidence bound to implementation commit `d7c1f8c4`; source type `ui_demo`, target program `mock-only`, capture scope `browser-viewport`, sensitive exclusion `N/A`.
- The controlled static fixture uses `393px × 852px` and `320px × 700px` viewports. Both keep the mobile header, main container, and footer on the same `12px` left/right gutter, use a `16px` maximum surface radius, and preserve `44px` navigation targets.
- Its `320px` timeline-rail compaction claim is superseded: the current homepage and Memos stream remove the rail, nodes, and connectors below `640px`. See “Memo timeline across breakpoints” for current Memos evidence.

![Public mobile density at 393px](./assets/public-mobile-density-393.png)

![Public mobile density at 320px](./assets/public-mobile-density-320.png)

### Memo timeline across breakpoints

- Evidence bound to implementation commit `f2e752a1c69a320a6427ffd29e2e5c88ceaeac19`; source type `ui_demo`, target program `mock-only`, capture scope `browser-viewport`, viewport strategy `Playwright CSS viewport`, margin policy `trim_only`, evidence surface `page`, sensitive exclusion `N/A`.
- The deterministic local production preview contains five Memos. Desktop captures use `1440px × 1200px` in dark and light themes; narrow captures use `393px × 852px` and `320px × 700px` in dark theme.
- Desktop retains the timeline rail and clock metadata. At both mobile widths, the rail, node, connector, and clock icon are hidden; the Memo type icon appears immediately before its date, the accessible type name remains available, and the list has no horizontal overflow.
- Guest E2E compares each homepage and Memos entry's type, date, and href sequence between desktop and mobile viewports. At `393px`, every mobile entry also verifies a non-overlapping type-icon/date gap of at most `9px`; the density matrix checks homepage and Memos overflow at `393px`, `375px`, `360px`, and `320px`. The reduced-motion check verifies the computed panel transition duration remains at or below `0.01ms`.

![Memos stream desktop dark](./assets/memo-stream-desktop-dark.png)

![Memos stream desktop light](./assets/memo-stream-desktop-light.png)

![Memos stream mobile 393px dark](./assets/memo-stream-mobile-393-dark.png)

![Memos stream mobile 320px dark](./assets/memo-stream-mobile-320-dark.png)

### Related posts responsive cards

- Evidence bound to local HEAD `f0606193b047c9e2e466fd17cac9e1a98a811ed1` from the stable local Astro preview.
- Desktop keeps four equal cards, tablet keeps two reduced-height wide cards, and mobile keeps one adaptive column where no-cover cards omit the media block.

![Related posts desktop](./assets/related-posts-desktop.png)

![Related posts tablet](./assets/related-posts-tablet.png)

![Related posts mobile](./assets/related-posts-mobile.png)

### Home and memos timeline restoration (historical)

- Historical evidence captured from the stable production gateway preview on local branch `th/timeline-visual-restore`, before the mobile content-stream contract.
- Desktop retains a shared timeline rail and node rhythm across `/` and `/memos`; the mobile screenshots below in the compact-density section supersede this section's rail-on-mobile presentation.

![Home timeline light](./assets/home-timeline-light-final.png)

![Home timeline dark](./assets/home-timeline-dark-final.png)

![Memos timeline light](./assets/memos-timeline-light-final.png)

![Memos timeline dark](./assets/memos-timeline-dark-final.png)

![Home timeline mobile](./assets/home-timeline-mobile.png)

![Memos timeline mobile](./assets/memos-timeline-mobile.png)

### Public timeline node and primary-action accessibility (historical)

- Historical evidence captured from the deterministic local Astro preview after the timeline and action-token fixes, before the mobile content-stream contract. The four current-only candidates were compared against `main@4fb46c58892c1c2c0e8e7de0b1767c499e623264` and shown for owner confirmation.
- Source type `ui_demo`; target program `mock-only`; capture scope `browser-viewport`; desktop viewport `1440px × 1100px`; requested mobile viewport `393px × 852px`; viewport strategy `devtools-emulate`; margin policy `trim_only`; evidence surface `page`; sensitive exclusion `N/A`.
- Article and Memo nodes share a closed circular frame, visible border, shadow, and continuous connector on desktop. These mobile captures show the earlier rail-and-label treatment; current mobile content-stream evidence supersedes them.
- The search submit solid primary-action tokens measure `4.9826:1` in light mode and `8.8970:1` in dark mode for default, hover, and focus states. The homepage article CTA verifies every gradient stop at or above `4.5:1` and retains a visible `3px` outline with `3px` offset.

![Public timeline and CTA light desktop](./assets/home-timeline-cta-light-desktop.png)

![Public timeline and CTA dark desktop](./assets/home-timeline-cta-dark-desktop.png)

![Public timeline and CTA light mobile](./assets/home-timeline-cta-light-mobile.png)

![Public timeline and CTA dark mobile](./assets/home-timeline-cta-dark-mobile.png)

### Memo detail hierarchy

- Evidence bound to local HEAD `0ed11b57` from Storybook mock stories for the public memo detail shell.
- Memo detail renders as a single card instead of a split header/body pair.
- Time, type, title, tags, and Markdown body live inside the same surface so short memos read as one unit.

![Memo detail hierarchy](./assets/memo-detail-hierarchy.png)

### Hover stability on dense public lists

- Evidence captured from the local hover-stability preview on `2026-04-11` using the shared `nature-hover-hitbox` + `nature-hover-lift` contract.
- The outer hitbox stays stationary while the inner surface carries the lifted shadow/border state, preventing hover thrash near the lower edge of related-post cards, tag cards, search results, and tag badges.

![Hover stability - related posts](./assets/hover-stability-related-posts.png)

![Hover stability - tags grid](./assets/hover-stability-tags-grid.png)

![Hover stability - search results](./assets/hover-stability-search-results.png)

### Search interface redesign

- Evidence captured from Storybook mock canvas for the public search page on branch `th/search-interface-redesign`.
- The page now renders the deep-linked query in the first paint, uses query-aware status, exposes type filters with counts, and presents result cards with readable content type, keyword-aware snippets, highlight marks, and relevance metadata.
- Keyword snippet evidence was captured with Chrome DevTools from the controlled Storybook canvas served on a local preview lease.
- Search stories render only the real search component. Header and full-page behavior must be verified against the actual public route, not a Storybook shell that imitates production-only components.
- Prompt states use a shared status panel for initial, loading, empty, error, and filtered-empty stories, keeping the message aligned to the content grid with a stronger icon, title, description, and recovery action.
- Empty, error, and filtered-empty recovery actions now use recommended search terms. The public API generates suggestions with the configured chat LLM when available and falls back to public content tags, titles, and excerpts when it is not configured.
- Empty-result recovery keeps concept-direction fallback terms even when strict result validation finds no current hit, so the user still gets query-related generalized, related, sibling, and alternative search routes instead of unrelated popular terms.
- Empty-result recommendations now render as a single compact retry strip instead of a grouped explanation panel. The strip appears only for true no-result searches, keeps generalized/related/sibling/alternative labels as subdued metadata, and lets each term immediately launch a new pushed search route.
- Markdown excerpts are cleaned before rendering: emphasis syntax, escaped inline-code markers, and HTML line-break artifacts are removed, while line breaks, indentation, and code-like command snippets remain readable across multiple lines.
- The search page now prioritizes the search box as the primary tool, keeps relevance percentages as subdued metadata, presents recovery terms by generalized, related, sibling, and alternative directions, and uses compact result rows for faster scanning.

![Search redesign light](./assets/search-redesign-results.png)

![Search redesign dark](./assets/search-redesign-dark.png)

![Search redesign mobile](./assets/search-redesign-mobile.png)

![Search keyword snippets](./assets/search-highlight-snippets.png)

### Query-aware search viewport evidence

- Evidence captured from the real production static search route at `/search/?q=SSH`, not from a Storybook shell.
- `Storybook覆盖=已通过`; `视觉证据目标源=target_app_window`; `视觉证据=存在`; `聊天回图=已展示`; `证据落盘=已落盘`.
- `证据绑定sha=98a280d63e2363c9bce0fd279c474ed429b6e7cc`; `submission_gate=approved`.

Desktop viewport evidence:

- `source_type=target_app_window`; `target_program=Chrome`; `capture_scope=browser-viewport`; `sensitive_exclusion=only the search preview page`; `viewport=1762x1169 CSS px`.

![Search query field desktop viewport](./assets/search-query-frame-desktop-1762x1169.jpg)

Mobile viewport evidence:

- `source_type=target_app_window`; `target_program=Chromium production preview`; `capture_scope=browser-viewport`; `sensitive_exclusion=only the search preview page`; `viewport=393x852 CSS px`.

![Search query field mobile viewport](./assets/search-query-frame-mobile-393x852.png)

![Search Storybook with site layout](./assets/search-story-layout-results.png)

![Search empty state bolder](./assets/search-empty-state-bolder.png)

![Search recommended recovery terms](./assets/search-empty-recommendations.png)

![Search Markdown snippets](./assets/search-markdown-snippets.png)

![Search fast tool results](./assets/search-tool-fast-results.png)

![Search recovery directions](./assets/search-tool-recovery.png)

![Search recommendations single row](./assets/search-recommendations-single-row.png)

![Search recommendations single row dark](./assets/search-recommendations-single-row-dark.png)

![Search recommendations single row mobile](./assets/search-recommendations-single-row-mobile.png)
