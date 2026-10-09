# SPEC: Nature Frontend Redesign Without DaisyUI

- Spec ID: `n8ure`
- Status: `active`
- Owner: `main-agent`

## Related ADRs

- [ADR 0001: Project Detail MDX Authoring](../../adr/0001-project-detail-mdx-authoring.md)
- [ADR 0002: Mobile Public Header Scroll Model](../../adr/0002-mobile-public-header-scroll.md)
- [ADR 0003: Public Mobile Content Stream](../../adr/0003-public-mobile-content-stream.md)
- [ADR 0011: Shared Ambient Leaf Atlas](../../adr/0011-shared-ambient-leaf-atlas.md)

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
- No new Storybook infrastructure; ambient component evidence uses the existing Storybook installation.

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
- The 环境背景层 provides atmosphere. Primary reading content uses a theme-aware 阅读承载层 so text remains readable over the moving background: translucent white in light mode and an equivalently legible dark surface in dark mode. Normal-sized reading text maintains at least a 4.5:1 contrast ratio against the composited surface.
- Reading-heavy pages keep motion density lower than index/list pages.
- Reduced-motion users receive the same layout and hierarchy with heavily reduced animation and particle effects.
- The ambient public scene uses a transparent native-DPR WebGPU Canvas over the existing Nature CSS background. A shared vector definition owns broad and willow blades, curved stems, primary ribs, and secondary veins. Blade fill opacity is `0.035`, outline/primary-rib opacity is `0.14`, and secondary-vein opacity is `0.07`; vector stroke widths are `1.5`, `1.6`, and `1`. Wind opacity is `0.035`. The shared frame is `-64 -42 128 84`, scaled by `size/90`, with size `28–40`; widths below `640px` use seven leaves, otherwise twelve. Every third leaf is willow and every fourth leaf is mist; the other leaves use broad/accent. The deterministic model retains its `26–44s` drift and adds the phase-derived base angle to its gentle sway.
- WebGPU samples theme-independent transparent masks rasterized from the same vector paths at twice native-DPR leaf density. The four atlas tiles cover both shapes and full/conservative detail, with two-texel isolation. Full detail includes secondary veins; conservative detail preserves blade outline, stem, and primary rib and omits only secondary veins. Native-DPR backing, atlas dimensions, and the fixed seed buffer must fit public adapter/device limits. Score 2 requires double capacity, score 1 requires minimum capacity, and score 0 uses SVG. Queue timing, private browser fields, vendor tables, and hardware heuristics never select a renderer or tier. Atlas resources are rebuilt only for initialization or changed DPR; theme changes update the palette.
- The scene uses premultiplied alpha, pauses submissions while hidden (including when GPU initialization completes during that pause), and schedules visible motion at approximately `30Hz`. A prepared WebGPU renderer submits no frames before mounting and refreshes the page visibility state at mount. Reduced-motion users do not request WebGPU and receive the complete deterministic SVG with independent explicitly styled path nodes. SVG remains visible until WebGPU initialization completes. Decode/upload/context/pipeline failures and device loss use complete SVG without leaked textures, bitmaps, buffers, or callbacks; stale asynchronous results cannot replace the current instance.
- Public route transitions expose a non-blocking pending indicator anchored to the site header. The indicator floats below the header frame without shifting document flow, sets page busy state while navigation is preparing, and clears after the next page load.
- Article and memo detail pages preserve server-rendered Markdown content for first paint while deferring interactive Markdown hydration until the content approaches the viewport; neither page may expose a persistent live loading state or static interaction guidance after content is readable.

### 4.4 Responsive control and code density

- At `min-width: 1024px` with a fine pointer, public text actions use a `36px` target; navigation, icon controls, and link-style badges use a `32px` target.
- Outside that desktop condition, interactive public controls use a minimum `44px` target. Static status badges remain compact and do not imply an interactive hit area.
- `MarkdownRenderer` owns the public Markdown code surface. Dark code blocks use a low-brightness green surface, AA-readable foreground and syntax tokens, `12px` vertical by `14px` horizontal padding, and a `12px` radius. Horizontal overflow and code folding remain available.
- Below `640px`, public shell elements keep their `12px` viewport gutters by default, while a primary continuous reading region uses one 阅读承载层 reaching both viewport edges. Homepage, article-list, Memo, tag-detail, and search-result streams share a continuous translucent surface with separators between entries instead of separate card shells. The grouped project index uses one theme-aware surface across its category rails, with category headings and descriptions inset and subtle separators between groups; poster cards retain their own 4:5 frames and horizontal browsing behavior without an extra card wrapper. Reading content and any row-level press or focus feedback span the full region; text, dates, tags, and actions remain inset, beginning `16px` from the viewport edge at `393px` and `12px` below `375px`. Feedback must not imply that a non-interactive row is clickable or shift its layout.
- The homepage introduction, Article and Memo detail titles and bodies, project-detail introductions and prose, and primary prose on the About page receive a theme-aware 阅读承载层. A continuous primary reading surface reaches the mobile viewport edges and keeps its content inset. Article cover media may reach both edges without cropping. Standalone project-detail sections, search states, tag tiles, individual poster cards, profile modules, and controls retain the framing appropriate to their own content; they do not leave prose directly on the 环境背景层. Surface radii step down to `16px`, `14px`, and `12px`. Touch targets remain at least `44px`; compact spacing does not shrink interactive controls.
- Below `640px`, the homepage and Memos use a 移动内容流: chronological order, dates, and content-type metadata remain, while the decorative timeline rail, nodes, and connectors are removed. The homepage event entry follows the compact Memos item pattern, with only the article/Memo type icon immediately before the date; the desktop-only type text chip is not rendered visually in the narrow flow, but its text remains available to assistive technology. Tag and search content-type indicators likewise retain an accessible type name when the visible chip is reduced to an icon.
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
- The project catalog uses six single-name groups: 开发工具 (3), 效率工具 (2), Web 产品 (2), 硬件产品 (3), 设备控制 (3), and 运维工具 (3). Every group stays within three cards, and the homepage selects one representative project from each group.
- Homepage featured-project cards place an available official logo beside the project title, with the domain label below the title, a stable summary, at most two technology tags, and a divided footer for the case link and external entries. The existing one/two/three-column grid and Nature panels remain in use.
- The homepage keeps an explicit local logo map for the five featured projects with approved independent assets. Native-color logos keep their source artwork and any supplied light/dark pair; monochrome SpotiBind and XP logos use their approved per-project theme colors. LoadLynx has no card logo or watermark until an independent official asset is available. No logo data is added to the public project catalog.
- Available logos may repeat as a decorative, non-interactive upper-right watermark. Watermarks stay behind the card content, use the documented native/monochrome light and dark opacity values, scale from 148px to 112px, and are hidden at viewport widths of 420px or less.
- Homepage external entries opt into an adaptive mode: short visible labels remain beside icons when their footer fits, then switch to icon-only links when it does not. The complete title and accessible name stay available, mobile targets remain at least 44px, and the shared component's default mode remains unchanged. The section-level browse-all action follows the same icon-and-label pattern, becoming an accessible icon-only 44px target at `360px` and below.
- The `/projects` page uses the title `项目` and shows the public-project and product-domain totals in its introduction. On desktop, all domain groups share one surface, with subtle horizontal separators between sections and a horizontal poster rail in each group. Below `640px`, the shared surface flattens, group headings align to the reading inset, and each rail uses approximately `85vw` poster cards with the next card visibly peeking into the viewport.
- In the 开发工具 group, the Codex Vibe Monitor, Tavily Hikari, and OctoRill cards replace only their 4:5 poster media with a runtime-data panel when that project's dedicated metrics BaseURL is configured. Codex Vibe Monitor shows 实时 Token/分钟、并行调用数、今日 Token 消耗量 and a 90-day daily Token activity grid; Tavily Hikari shows 今日请求次数、今日积分消耗量、本月积分消耗量、积分总量 and a 90-day daily request activity grid; OctoRill shows 去重仓库数、压力值 and a per-repository freshness heatmap. No other runtime or operations field is rendered, and the OctoRill panel has no legend. An empty BaseURL disables that project's panel and leaves its original poster in place.
- Runtime panels keep the 4:5 media contract. CVM and Hikari activity grids contain exactly 90 date-ordered daily points placed in calendar order with seven vertical rows from Sunday through Saturday and horizontal week columns; boundary gaps are empty, and no axis labels or ticks are shown. OctoRill consumes a `Uint8Array` with one status byte per deduplicated repository and renders cells in exactly the interface-provided order without sorting, grouping, or omission. All three grids expose cell data through the shared component-library Tooltip on hover, keyboard inspection, and touch long-press inspection as defined below, without changing the project detail navigation target.
- Runtime panel interiors are continuous data surfaces rather than nested cards: metric groups have no individual border, radius, or fill, and use typography plus hairline separators; activity grids sit directly on the panel background without a secondary frame.
- The three runtime panels use project-specific generated raster atmosphere assets inside their 4:5 bounds. These assets are decorative material only: they contain no metrics, chart marks, axes, data points, text, or symbols. The existing global ambient scene remains responsible for the page background.
- Every approved Stat also carries a compact trend series rendered by the lightweight `uPlot` Canvas library as a full-bounds background layer inside that Stat. The chart element covers the Stat's complete content box, while chart padding keeps the actual line or bar marks in the lower visual area and the label, value, and optional unit remain above it; it must not become a sibling row or panel-wide chart region. Stat height is content-sized: only the label, value, optional unit, and design-derived inner padding participate in layout, while the absolute chart canvas and decorative atmosphere do not. The long today-Token trend is visually inset toward the lower-right while retaining its full-day domain and trailing future gap. Hikari's two metric rows use compact content-sized rows so the activity grid retains the visual weight shown in the design; Hikari's month and total credit trends use real uPlot bars with a smooth trend line overlaid, while the remaining trends use smooth lines. CVM and Hikari recent-hours trends contain 12 ordered points; OctoRill's provider trend arrays may contain 1 to 12 available ordered hourly points. Today trends contain 25 hourly points from `00:00` through the next `00:00`, with future values represented by trailing `null` points so the line or bar chart stops at the current snapshot instead of filling the rest of the day. Chart axes, ticks, and legends are hidden; activity cells expose the component-library Tooltip without changing Stat height or project navigation, and the current numeric value remains the primary reading.
- The live runtime sources are configured independently through `PUBLIC_CODEX_VIBE_MONITOR_METRICS_BASE_URL`, `PUBLIC_TAVILY_HIKARI_METRICS_BASE_URL`, and `PUBLIC_OCTO_RILL_METRICS_BASE_URL`; each defaults to an empty string, and an empty value disables only its own panel. A configured source is read only through the shared dedicated paths `/api/public/metrics/v1/codex-vibe-monitor`, `/api/public/metrics/v1/tavily-hikari`, and `/api/public/metrics/v1/octo-rill`. The browser performs CORS `GET` requests while the page is visible, refreshing CVM and Hikari every 30 seconds and OctoRill every 5 minutes; hidden pages stop timers and refetch on return. Each provider owns its own cache and rate protection. The blog does not reuse, proxy, or reshape an existing business endpoint.
- The live response adapter accepts only the approved aggregate fields. CVM and Hikari keep the current Stat/trend shape; CVM's daily series may contain `null` historical values, while the current trend point remains present. OctoRill's two trends are adapted from the interface-provided ordered arrays, accepting the provider's available one-to-twelve hourly samples without padding or rejection, and its `u8` freshness array is rendered byte-for-byte in the received order. The browser exposes no raw records, prompts, search content, repository names, account identifiers, keys, IPs, or provider error details. The build-time Mock fixture remains a structural/test fixture and is never shown as live data.
- Project title and shortcut links reflow when narrow space or enlarged text requires it; they must remain visible and must not create horizontal page overflow.

#### Project visual slot geometry and density

The 项目视觉槽位 owns the fixed 4:5 border-box geometry of every project-wall card. Its height follows the card's current width, not the amount of runtime content. The poster, fallback poster, and ready runtime panel each fill the same slot, including its border and padding. Titles, summaries, and shortcut links remain outside this contract and may reflow independently. Project detail pages retain their poster presentation.

| Panel | Stable content | Density-sensitive content |
| --- | --- | --- |
| Codex Vibe Monitor | Three approved metrics, 90 daily activity positions, fixed-length Stat trends | Long numeric values use the existing compact representation in both the Stat and cell Tooltip. |
| Tavily Hikari | Four approved metrics, 90 daily activity positions, fixed-length Stat trends | Long numeric values use the existing compact representation in both the Stat and cell Tooltip. |
| OctoRill | Two approved metrics and their Stat trends | One ordered freshness cell per repository; increasing repository count reduces heatmap cell size and spacing inside the available lower region. |

All approved metric labels and values remain readable. Decorative material may be clipped; activity data may not be omitted. OctoRill count changes at a fixed viewport leave its logo, metric-region structure, typography, and allocated upper-region height stable. Only the lower freshness heatmap adapts its density. Every status byte remains represented in received order without sorting, aggregation, folding, pagination, internal scrolling, or clipping of data cells. The freshness title and actual cell grid form one bottom-aligned group: the last populated row reaches the bottom of the available heatmap region, the title remains `0.55rem` above the first populated row, and unused vertical space belongs above the title. All cells remain equal-sized squares with consistent spacing. Every complete row fills the available content width from left to right; unused horizontal space must not form a strip beside all populated rows. An incomplete final row remains left-aligned and may leave trailing space, including when a sparse repository count produces only one incomplete row; it must not be stretched or filled with synthetic cells. Zero repositories retain the lower region and title without creating data cells. Dense samples may produce very small cells; preserving the fixed slot and complete ordered data takes precedence over guaranteeing individually distinguishable pixels at unbounded repository counts. A different representation for such extreme counts requires a separate product decision.

An unconfigured source shows the poster. While the first request is pending, or a request fails HTTP or response validation, the slot presents its original poster without diagnostic text. A later valid refresh can replace it with the runtime panel. Successful refreshes, fallback transitions, theme changes, resizing, and tooltips leave the slot geometry stable for a fixed card width. A short in-slot opacity transition is optional and respects reduced motion; height animation is excluded.

Valid zero metrics remain runtime data. Missing CVM history uses the protocol's 90 dated positions with permitted null values; Hikari still requires 90 valid daily points, including zero values. OctoRill may have zero repositories and an empty freshness array. An empty array or incomplete payload is not made valid where the existing response contract rejects it.

#### Project runtime cell tooltips

The three runtime grids share the public component library's Tooltip behavior and Nature theme treatment. Tooltip content contains the selected cell's data: CVM uses the source calendar date and Token consumption value formatted with the existing compact K/M/B/T representation; Hikari uses the source calendar date and request count formatted with the same representation and its unit; OctoRill uses only the anonymous freshness bucket or no-success status. The runtime model retains the raw numeric values for data consistency, while displayed values avoid multiple grouping separators. OctoRill does not disclose a repository name, stable identifier, or exact refresh time. Zero remains zero, missing data is not converted into zero, and calendar boundary padding or unoccupied heatmap space does not invent a data point.

Mouse hover opens the cell Tooltip, and movement between cells updates its data. Keyboard inspection exposes equivalent data without requiring a traversal through thousands of sequential Tab stops. Escape dismisses the Tooltip. Hover content remains available while the pointer is over the cell or Tooltip. The Tooltip is an informational overlay rather than a focusable dialog or action menu; it remains readable in both themes, fits the viewport, and escapes the card and rail clipping without participating in the visual slot's layout.

Touch inspection starts only after a recognized single-contact long press within the chart region. The chart is the gesture target; its dense data marks do not become separate enlarged touch buttons. Movement before recognition abandons the long-press candidate and retains native vertical page scrolling or horizontal card browsing. An already scrolling gesture does not become inspection. A recognized long press shows the current cell's Tooltip and highlight; subsequent held movement updates the cell beneath the contact center instead of scrolling the page or card rail. The displayed content and selected mark must refer to the same data snapshot.

Touch Tooltip placement avoids the finger's contact area and surrounding occlusion region. A stable readable position above the chart is preferred; viewport constraints may require another position that also avoids that region. Moving the Tooltip away from the finger does not offset data hit-testing away from the actual contact center. Movement outside the current chart hides its Tooltip; return during the same contact may resume inspection of that chart, without automatically activating a neighboring card.

Releasing the contact closes the long-press Tooltip and clears its inspection highlight. Touch cancellation, a second contact, lost page focus, hidden or replaced pages, and poster fallback also clear the interaction. The chart locally suppresses native context menus, link callouts, and text selection for inspection; these restrictions do not extend to unrelated page content or card links. Only the follow-up click produced by a successfully recognized long press is consumed, preventing a detail jump or reopened Tooltip without suppressing a later independent click.

Ordinary clicks and mobile taps on all three runtime panels, including cells, grid gaps, and non-chart visual regions, MUST retain the project detail destination. A mobile tap that is not recognized as a long press MUST NOT open a Tooltip or select a cell. Valid project titles and summaries, and external shortcuts retain their existing destinations. Only the follow-up click from a recognized long press is consumed; the next independent tap navigates normally. Focusable chart elements and link targets must have valid independent HTML semantics. Opening, updating, or closing a Tooltip retains the 4:5 geometry and every received data cell. Gesture arbitration and native menu suppression require browser validation; synthetic event checks alone do not establish native touch compatibility.

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
12. Public pages at `393px`, `375px`, `360px`, and `320px` do not overflow horizontally, keep `44px` touch targets, and use the compact mobile spacing and radius contract without changing desktop density. Primary continuous reading surfaces and their row-level feedback reach both viewport edges; at `393px`, text in homepage, article-list, Memo, tag-detail, and search-result streams begins at a `16px` viewport inset. The homepage introduction, Article and Memo details, project-detail introductions and prose, and primary About prose remain readable on theme-aware surfaces; article cover media spans the viewport without cropping.
13. Project posters render in 4:5 frames with a continuously readable image or placeholder state, responsive AVIF/WebP candidates, explicit dimensions, priority behavior, and reduced-motion-safe reveal behavior. Available social previews render in a stable intrinsic 2:1 frame with responsive AVIF/WebP candidates, and complete light/dark asset pairs follow the resolved public theme on first load and changes.
14. Poster asset generation and production builds fail when a raw public PNG, a missing generated variant, an oversized variant, or an oversized first-row transfer is detected.
15. The project catalog contains 16 entries across the six groups above; `/projects/spoti-bind` renders SpotiBind, and the homepage presents six featured projects derived from those groups. The project index shows both catalog totals, presents its groups in one shared desktop surface and one theme-aware mobile reading surface, and keeps all poster titles and shortcuts usable at narrow widths and enlarged text. Mobile posters occupy approximately `85vw` while the next card remains visible at the rail edge.
16. On mobile public routes, the header follows the documented scroll, speed,
    release-settling, focus-order, resize, router, and reduced-motion contracts;
    desktop public behavior remains unchanged.
17. Desktop article and Memo timelines retain the shared circular node frame and connector rhythm; below `640px`, the homepage and Memos render a 移动内容流 with no rail, node, or connector, and place the type icon immediately before the date. The mobile type text chip is omitted without horizontal overflow.
18. Public primary actions meet a 4.5:1 foreground/background contrast ratio in light and dark themes for default, hover, and focus states.

19. Public memo surfaces omit an absent resolved title without substituting a slug, while preserving available date, type, tags, excerpt or body, and detail navigation; cross-layer resolution and protocol metadata follow the memo-title-semantics Spec.
20. The homepage's six featured-project cards keep available official logos beside titles, omit the LoadLynx logo slot, and use non-interactive theme-aware watermarks without obscuring card content. Card footer links show short labels when space allows and switch to accessible 44px-or-larger icon targets when needed. The section-level browse-all action keeps its icon and label at `393px` and becomes an accessible 44px icon target at `320px`; the page has no horizontal overflow at either width.
21. Light, dark, and system themes keep primary reading text legible over ambient motion. Touch press, keyboard focus, long unbroken text, and theme changes preserve row feedback width, text insets, and usable links without layout jumps.
22. The three selected 开发工具 cards use 4:5 runtime-data panels with exactly the approved per-project fields when their BaseURL is non-empty; an empty BaseURL leaves the original poster and makes no request. CVM and Hikari each expose 90 daily activity points in seven Sunday-to-Saturday rows across week columns, with no axis labels or ticks; OctoRill exposes the two approved statistics and renders every byte of its freshness `Uint8Array` in order without a legend. Configured panels use only their dedicated aggregate endpoints, preserve project detail and external shortcut navigation, stop refresh while hidden, and retain the poster if the first live request cannot be validated.
23. Actual visual-slot height satisfies `abs(height - width * 5 / 4) <= 1 CSS px`, and the active poster or panel fills its slot within the same tolerance. At a fixed viewport and card width, requesting, loading valid data, refreshing, entering fallback, recovering, changing theme, and opening tooltips change neither slot height nor the position of the copy below it by more than `1 CSS px`. Hover transforms are excluded from the measurement by keeping the pointer outside the card. Total card heights may differ when copy wraps.
24. OctoRill's freshness heatmap fits its allocated lower region with complete cell count and received order at zero, ordinary, and dense repository counts. Changing repository count alone preserves the upper metric-region geometry and typography. The title stays `0.55rem` above the first populated row, unused vertical space stays above the title, and the title/grid group aligns to the bottom. Complete rows fill the available width; only an incomplete final row may leave trailing space. Every data cell is an equal-sized square inside the heatmap and visual slot; smaller cells and gaps resolve density without hiding repositories, creating synthetic cells, stretching the final row, or introducing internal scrolling.
25. CVM, Hikari, and OctoRill cell data is readable through the shared component-library Tooltip on mouse hover, keyboard inspection, and touch long press. Held touch movement reads the actual contact position, avoids finger occlusion, suppresses local native menus and inspection scrolling, and closes on release or cancellation. Pre-recognition vertical and horizontal scrolling, ordinary clicks, and existing navigation retain their behavior. Browser checks cover native gesture arbitration, refresh/fallback cleanup, all five OctoRill statuses, compact daily values with units, and stable visual-slot geometry.

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
- `BASE_URL=http://localhost:30090 PLAYWRIGHT_REUSE_APP=true bunx playwright test tests/e2e/guest/nature-front-coverage.spec.ts --project=guest --grep "homepage featured"`
- `bun run site:build`
- `bun test src/lib/__tests__/public-header-scroll.test.ts`
- `BASE_URL=http://localhost:30090 PLAYWRIGHT_REUSE_APP=true bunx playwright test tests/e2e/guest/nature-front-coverage.spec.ts --project=guest --grep "public header scroll|mobile header"

## Visual Evidence

### Homepage featured project cards

- Evidence bound to implementation commit `f01d504142a1a454ccf7a3b62d9509f0c3968665`; source type `ui_demo`, target program `Ego Browser`, capture scope `browser-viewport`, viewport strategy `devtools-emulate`, margin policy `trim_only`, evidence surface `page`, sensitive exclusion `N/A`.
- Desktop captures use `1440px × 1000px` in light and dark themes. Narrow captures use `393px × 852px` and `320px × 852px` in light theme. All four screenshots were confirmed by the owner.
- The desktop cards show five approved official logos and muted watermarks; LoadLynx has neither. At narrow widths, watermarks are hidden, external links adapt, and the section-level browse-all action is icon-only at `320px`, with no horizontal overflow.

![Featured projects desktop light](./assets/featured-projects-home-1440-light.png)

![Featured projects desktop dark](./assets/featured-projects-home-1440-dark.png)

![Featured projects mobile 393px](./assets/featured-projects-home-393-light.png)

![Featured projects mobile 320px](./assets/featured-projects-home-320-light.png)

### Project index grouped panel

- The public project index is captured at desktop (`1780px × 1071px`) and mobile (`393px × 852px`) sizes in light and dark themes after the grouped-panel refinement.
- Source type `ui_demo`; target program `Ego Browser`; capture scope `browser-viewport`; the owner confirmed that these images accurately show the current page.
- The mobile reading-surface refinement is captured at a `393px × 852px` CSS viewport in light and dark themes. The in-app browser screenshots are `378px × 819px` raster images. The category list reaches both viewport edges while its heading and poster rail retain their internal inset; the owner confirmed both images.

![Project index desktop light](./assets/projects-index-grouped-desktop-light.png)

![Project index desktop dark](./assets/projects-index-grouped-desktop-dark.png)

![Project index mobile light](./assets/projects-index-mobile-reading-surface-light.jpg)

![Project index mobile dark](./assets/projects-index-mobile-reading-surface-dark.jpg)

### Project runtime panels

- Historical evidence binding: implementation commit `d974dd02042fe11cc63a8e84f3471ebc76863b2c` on base `7ff1bd7b8faf0958cdac323cd0c3ccf5e9495899`. Source type `ui_demo`; target program `mock-only` Astro `/projects` page; capture scope `browser-viewport`; requested viewports `1780px × 1071px` and `393px × 852px`; viewport strategy `Playwright CSS viewport`; margin policy `trim_only`; evidence surface `page`; sensitive exclusion `N/A`.
- Current candidate binding: implementation commit `38d07372` on base `973d788309e23f98cf836f2b607d22e2cb53a3b2`; source type `ui_demo`; target program `mock-only` Astro `/projects` page; capture scope `browser-viewport`; requested viewports `1780px × 1071px` and `393px × 852px`; viewport strategy `Playwright CSS viewport`; margin policy `trim_only`; evidence surface `page`; sensitive exclusion `N/A`. The owner confirmed all 12 current ordinary, dense, and poster-fallback captures in the controlled comparison report, with configured fixture BaseURLs, 503 ordinary repositories, 3000 dense repositories, and the OctoRill poster fallback across both themes and both viewports.
- The owner confirmed all 12 ordinary, dense, and poster-fallback screenshots across desktop/mobile and light/dark themes after reviewing the comparison report. All captures use configured fixture BaseURLs and the production `/projects` page. The ordinary state shows the three live panels with their uPlot Stat charts and activity grids, including the sparse OctoRill grid with its final row aligned to the heatmap bottom; the dense state retains all 3000 ordered cells; the fallback state restores OctoRill's poster in the same 4:5 slot. Project links and copy remain below the visuals.

#### Ordinary density

![Runtime panels desktop light](./assets/project-runtime-panels-desktop-light-1780x1071.png)

![Runtime panels desktop dark](./assets/project-runtime-panels-desktop-dark-1780x1071.png)

![Runtime panels mobile light](./assets/project-runtime-panels-mobile-light-393x852.png)

![Runtime panels mobile dark](./assets/project-runtime-panels-mobile-dark-393x852.png)

#### Dense OctoRill freshness

![Dense runtime panels desktop light](./assets/project-runtime-panels-dense-desktop-light-1780x1071.png)

![Dense runtime panels desktop dark](./assets/project-runtime-panels-dense-desktop-dark-1780x1071.png)

![Dense runtime panels mobile light](./assets/project-runtime-panels-dense-mobile-light-393x852.png)

![Dense runtime panels mobile dark](./assets/project-runtime-panels-dense-mobile-dark-393x852.png)

#### Poster fallback

![Fallback runtime panels desktop light](./assets/project-runtime-panels-fallback-desktop-light-1780x1071.png)

![Fallback runtime panels desktop dark](./assets/project-runtime-panels-fallback-desktop-dark-1780x1071.png)

![Fallback runtime panels mobile light](./assets/project-runtime-panels-fallback-mobile-light-393x852.png)

![Fallback runtime panels mobile dark](./assets/project-runtime-panels-fallback-mobile-dark-393x852.png)

#### Runtime cell Tooltip candidate

- Evidence binding: implementation commit `2bb66cd43414690711f86a187f9806df3ec0bbdc`; browser evidence and focused `/projects` checks describe this candidate. Native iOS Safari, Android Chrome, and touch-capable desktop input remain an explicit acceptance gate.
- Current-candidate browser evidence uses the official Web Demo `/projects/` route with the shared Inspector, `Ego Browser`, `devtools-emulate`, and CSS viewports `1780px × 1071px` and `393px × 852px`. The desktop capture shows a complete CVM date/value Tooltip and the narrow capture shows a held-touch Tooltip placed above the contact with the finger-avoidance margin. The candidate also passes the focused official-route checks for Hikari values and all five anonymous OctoRill freshness labels.
- These images are browser evidence for the current candidate; native iOS Safari, Android Chrome, and touch-capable desktop input remain an explicit acceptance gate and are not represented by these captures.

![Runtime cell Tooltip desktop dark](./assets/runtime-cell-tooltip-desktop-dark-1780x1071.png)

![Runtime cell Tooltip mobile dark](./assets/runtime-cell-tooltip-mobile-dark-393x852.png)

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

#### Oidrune operations group

- Evidence binding: implementation commit `b55aa1f47b9ead54260c22b4ff128d737be21bfe`; source type `ui_demo`; target program `Ego Browser`; capture scope `browser-viewport`; requested viewports `1780px × 1071px` and `393px × 852px`; viewport strategy `devtools-emulate`; margin policy `trim_only`; evidence surface `page`; sensitive exclusion `N/A`.
- The owner confirmed the Oidrune operations-group captures in light and dark themes at desktop and mobile sizes. These four focused captures are the submission evidence for this change; the mobile captures position the horizontal poster rail on Oidrune.

![Oidrune operations desktop light](./assets/projects-oidrune-operations-desktop-light.png)

![Oidrune operations desktop dark](./assets/projects-oidrune-operations-desktop-dark.png)

![Oidrune operations mobile light](./assets/projects-oidrune-operations-mobile-light.png)

![Oidrune operations mobile dark](./assets/projects-oidrune-operations-mobile-dark.png)

![SpotiBind detail light](./assets/project-spoti-bind-light.png)

![SpotiBind detail dark](./assets/project-spoti-bind-dark.png)

![SpotiBind detail light mobile](./assets/project-spoti-bind-light-mobile.png)

![SpotiBind detail dark mobile](./assets/project-spoti-bind-dark-mobile.png)

![Project wall dark](./assets/projects-wall-dark.png)


![Tavily Hikari detail light](./assets/project-tavily-hikari-light.png)


![Tavily Hikari detail dark](./assets/project-tavily-hikari-dark.png)


![LoadLynx detail dark](./assets/project-loadlynx-dark.png)

### Project content migration

- Evidence captured from the current static Astro output after the 16 project bodies were compiled. Five representative groups were checked at desktop and `393px × 852px` mobile viewports in both light and dark themes; Hero, public-entry sidebar, optional TOC, continuous MDX prose, and footer remained readable without horizontal overflow. LoadLynx was rechecked after narrowing the ACK statement to the message types confirmed by its protocol sources.
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

### Mobile density baseline

- Evidence binding `7b2e49e54b241941b30c5350351d3a1392336471`; source type `storybook_canvas`, target program `mock-only`, capture scope `iframe-element`, requested viewport `393px × 852px`, sensitive exclusion `N/A`.
- This canvas records search controls and result cards aligned to the 12px shell gutter while retaining touch-sized actions. It does not verify the edge-to-edge reading-surface contract.

![Public mobile density current](./assets/public-mobile-density-current.png)

### Mobile content surface coverage

- Evidence bound to candidate `e0321396`; source type `ui_demo`, target program `Ego Browser`, capture scope `browser-viewport`, requested viewports `393px × 852px` and `320px × 852px`, viewport strategy `devtools-emulate`, margin policy `trim_only`, evidence surface `page`, sensitive exclusion `N/A`.
- These captures cover homepage, article list and detail, Memo list and detail, tag detail, search results, project index and project detail. They record transparent reading rows with separators and verify that both mobile widths keep `document.body.scrollWidth` equal to the viewport width. They do not verify `REQ-NATURE-MOBILE-READING-SURFACE`; distinct modules such as posters, profile blocks, search states, project sections, and navigation panels retain their own surfaces.

![Mobile tag detail final](./assets/mobile-tag-detail-final.png)

![Mobile project detail final](./assets/mobile-project-detail-final.png)

![Mobile Memo detail final](./assets/mobile-memo-detail-final.png)

### Project poster mobile radius

- Evidence binding `fd345db7e5cf08f380d7f009e0c3d8e35450fbb9`; source type `storybook_canvas`, target program `mock-only`, capture scope `element`, requested viewport `393px × 852px`, viewport strategy `storybook-viewport`, margin policy `require_margin`, evidence surface `component`, sensitive exclusion `N/A`.
- The compact ProjectPoster keeps a restrained `14px` mobile radius instead of inheriting the larger desktop compact radius, preserving visual density in narrow project cards.

![Public project poster mobile radius](./assets/public-project-poster-mobile-radius-current.png)

### Narrow mobile search density

- Evidence bound to implementation commit `59d66e54`; source type `storybook_canvas`, target program `mock-only`, capture scope `iframe element`, requested viewport `320x700`, viewport strategy `storybook-viewport`, margin policy `trim_only`, sensitive exclusion `N/A`.
- The narrow search state keeps its query panel at the mobile spacing contract, uses low-luminance surfaces for the filters and recommended terms, preserves 44px interactive controls, and does not overflow horizontally.

![Public narrow mobile search](./assets/public-search-narrow-mobile-dark.png)

### Natural ambient leaves

- Source type `storybook_canvas`, target program `mock-only`, capture scope `element`, requested viewports `1440x900` and `393x852`, viewport strategy `storybook-viewport`, margin policy `require_margin`, evidence surface `component`; owner confirmation received.
- Fixed frame `t=0` uses the production coordinator and Nature styles. The full SVG, real WebGPU full, and real WebGPU conservative outputs were individually inspected in light and dark themes. Broad/willow tips, curved stems, primary ribs, and subtle transparent fills retain the accepted reading atmosphere without opaque quad backgrounds. Native DPR 1 and 2 and a `320px` narrow surface were checked.
- [ADR 0011](../../adr/0011-shared-ambient-leaf-atlas.md) owns the shared vector atlas and secondary-vein-only detail reduction. ADR 0004 through ADR 0007 remain historical renderer decisions.

![Ambient leaves desktop light](./assets/ambient-leaf-desktop-light.png)

![Ambient leaves desktop dark](./assets/ambient-leaf-desktop-dark.png)

![Ambient leaves mobile light](./assets/ambient-leaf-mobile-light.png)

![Ambient leaves mobile dark](./assets/ambient-leaf-mobile-dark.png)

### Mobile reading type metadata

- Evidence bound to implementation commit `e219d0a90a9fa16d06ab9b4a3ffbc2fab820dfb5`; owner confirmation received.
- Tag detail: source type `ui_demo`; target program `Ego Browser`; capture scope `browser-viewport`; requested viewport `393px × 852px`; viewport strategy `devtools-emulate`; margin policy `trim_only`; evidence surface `page`.
- Search results: source type `storybook_canvas`; target program `mock-only`; capture scope `iframe element`; requested viewport `393px × 852px`; viewport strategy `storybook-viewport`; margin policy `trim_only`; evidence surface `page`.
- Tag and search streams use compact inline content-type icons on mobile while keeping accessible type names. Search results retain the same treatment in light and dark themes.

![Mobile tag detail type metadata light](./assets/mobile-tag-detail-type-metadata-light.png)

![Mobile search type metadata light](./assets/mobile-search-type-metadata-light.png)

![Mobile search type metadata dark](./assets/mobile-search-type-metadata-dark.png)

## Context and Scope

This topic owns the public Nature frontend shell and its visitor-facing page surfaces. The project index, project detail routes, semantic public-entry shortcuts, project-specific MDX bodies, responsive reading layout, and their visual evidence are in scope. Memo title resolution is owned by the [memo-title-semantics Spec](../memo-title-semantics/SPEC.md); this topic owns its visible treatment. Backend APIs, admin surfaces, and the poster/social-preview generation pipelines remain outside this topic's project-detail content contract.

## Requirements

- `REQ-NATURE-MOBILE-READING-SURFACE`: Below `640px`, primary public reading content MUST use a theme-aware 阅读承载层 instead of placing prose directly on the 环境背景层. Normal-sized text MUST maintain at least 4.5:1 contrast against its composited surface. Continuous streams MUST share one edge-to-edge translucent surface with inset content and separators; the grouped project index MUST use one such surface around its categories while preserving horizontal poster browsing and individual poster frames. Touch and focus feedback MUST preserve content insets and match the actual interactive region's width. Interactive control hover and focus feedback MUST NOT move the control's own hitbox; compact category selectors MUST keep a stable outer hitbox, and any visual lift MUST apply to a non-interactive child or a stable outer hitbox. The homepage introduction and Article, Memo, project-detail, and About prose MUST have an equivalent readable surface. Media and distinct standalone modules MAY keep their own framing.

- `REQ-NATURE-MEMO-TITLE`: Public memo surfaces MUST omit an absent resolved title without substituting a slug, while preserving the date, type, tags, available excerpt or body, and detail navigation; resolution and protocol metadata rules are owned by the [memo-title-semantics Spec](../memo-title-semantics/SPEC.md).

- `REQ-NATURE-PROJECT-CATALOG`: The project catalog MUST own project identity, discovery copy, media references, and semantic public entries; card shortcuts MUST prefer the formal site over Demo, official documentation over a documentation site, and the public repository as the source entry.
- `REQ-NATURE-PROJECT-DETAIL-MDX`: Project detail bodies MUST be project-specific MDX with build-time slug validation, optional reviewed static content blocks, and a verified catalog-only fallback when no body exists.
- `REQ-NATURE-PROJECT-READING`: Project detail pages MUST keep the Hero free of duplicate external links, expose all available entries in the sidebar, and place the sidebar before the body on narrow screens while preserving readable heading navigation.
- `REQ-NATURE-PROJECT-INTERACTION`: Project-wall summaries MUST remain one-line and ellipsized at rest, expose their full text on keyboard focus, and keep icon-only external shortcuts weak at rest but usable on hover, focus, and touch.
- `REQ-NATURE-PROJECT-VISUAL-GEOMETRY`: Every project-wall card MUST reserve one fixed 4:5 项目视觉槽位 and fit its poster, fallback, or runtime panel to that region. Runtime content, loading and failure states, refreshes, theme changes, and tooltips MUST preserve its dimensions for a fixed card width within `1 CSS px`. All approved labels and values MUST remain readable; long numbers MAY use the existing compact representation, including in cell Tooltips, while the raw numeric value remains available to the data model. The card's copy remains outside this geometry contract.
- `REQ-NATURE-OCTORILL-DENSITY`: OctoRill MUST fit every freshness status cell in received order inside its lower heatmap region while preserving its upper metric-region geometry and typography at a fixed viewport. The freshness title and actual cell grid MUST form one bottom-aligned group, with `0.55rem` between the title box and the first populated row and unused vertical space above the title. Every cell MUST be an equal-sized square with consistent spacing, and every complete row MUST span the available content width within `1 CSS px`. Only an incomplete final row MAY leave trailing space; this includes a sparse grid containing only an incomplete row. The final row MUST remain left-aligned without stretched or synthetic cells. Zero repositories MUST retain the lower region and title without data cells. Growing repository count MUST be handled through smaller cells and spacing rather than omitted, aggregated, sorted, folded, paginated, internally scrolled, or clipped data. Fixed slot geometry takes precedence at extreme density.
- `REQ-NATURE-RUNTIME-CELL-TOOLTIP`: CVM, Hikari, and OctoRill grids MUST use the shared public component-library Tooltip with equivalent hover and keyboard data access. Daily cells MUST expose their source date and numeric value in the existing compact K/M/B/T representation with the metric unit; the source raw value MUST remain available to the runtime model. Freshness cells MUST expose only the anonymous status bucket or no-success state. Tooltip content MUST remain complete, viewport-contained, and free of card or rail clipping while preserving the existing geometry and data-density contracts.
- `REQ-NATURE-RUNTIME-TOUCH-INSPECTION`: A recognized long press MUST enter held cell inspection, locally suppress native context menus, callouts, and text selection, update data beneath the contact center, avoid finger occlusion, and close on release or cancellation as defined in section 4.7. Movement before recognition MUST retain native page or card-rail scrolling; movement after recognition MUST inspect cells without scrolling. Active data, highlights, refreshes, and fallback transitions MUST remain consistent and clear obsolete Tooltip state.
- `REQ-NATURE-RUNTIME-CELL-NAVIGATION`: Ordinary clicks and mobile taps on CVM, Hikari, and OctoRill runtime panels, including cells, gaps, and non-chart visual regions, MUST retain their project detail destination. Mobile taps that are not recognized as long presses MUST NOT open a Tooltip or select a cell. Project titles and summaries, and external shortcuts MUST retain their existing destinations. Only the follow-up click from a recognized long press MUST be consumed; a later independent link click MUST remain functional. Chart focus and navigation MUST use valid independent HTML semantics.

## Verification

- `VER-NATURE-MOBILE-READING-SURFACE`: covers: `REQ-NATURE-MOBILE-READING-SURFACE`; browser checks at `393px`, `375px`, `360px`, and `320px` MUST cover the homepage introduction and timeline, Article and Memo lists and details, tag detail, search results, the grouped project index, project-detail prose, and About prose in light and dark themes. Inspect composited text contrast over ambient motion, exact surface and feedback edges, content insets, long text, touch press, keyboard focus, theme changes, desktop framing, and horizontal overflow.

- `VER-NATURE-MEMO-TITLE`: covers: `REQ-NATURE-MEMO-TITLE`; public list and detail rendering checks verify title omission, retained content metadata, and working detail navigation for titleless memos.

- `VER-NATURE-PROJECT-CATALOG`: covers: `REQ-NATURE-PROJECT-CATALOG`; semantic-entry unit tests and the static site build verify precedence, labels, missing-entry omission, and public output.
- `VER-NATURE-PROJECT-DETAIL-MDX`: covers: `REQ-NATURE-PROJECT-DETAIL-MDX`; MDX loader/TOC tests, the migrated detail routes, the static build, and the detail-route fallback branch verify slug validation, reviewed block rendering, compiled bodies, and safe catalog-only fallback behavior for projects without a body.
- `VER-NATURE-PROJECT-READING`: covers: `REQ-NATURE-PROJECT-READING`; focused guest Playwright coverage and the desktop/mobile light/dark page evidence verify sidebar order, TOC behavior, spacing, and responsive stacking.
- `VER-NATURE-PROJECT-INTERACTION`: covers: `REQ-NATURE-PROJECT-INTERACTION`; focused guest Playwright coverage verifies rest-state truncation, focus-visible expansion, shortcut names/targets, and hover/focus contrast behavior.
- `VER-NATURE-PROJECT-RUNTIME-LIVE`: covers the runtime-data panel contract; `tests/lib/project-runtime-metrics.test.ts`, `tests/lib/project-runtime-sources.test.ts`, the focused guest Playwright project-wall test, `bun run check`, and the static Astro build verify the field whitelist, source URL disabling, dedicated endpoint paths, 90-day shape, historical-null handling, non-negative values, OctoRill count conservation and order, 4:5 panels, interaction tooltips, preserved links, visibility-aware refresh, and no request when a BaseURL is empty.
- `VER-NATURE-PROJECT-VISUAL-GEOMETRY`: covers: `REQ-NATURE-PROJECT-VISUAL-GEOMETRY`; a focused project-wall browser regression MUST measure actual slot, active visual, and copy bounds using `getBoundingClientRect()` at `1780px` desktop, `1048px` narrow desktop, `820px` tablet, and `393px`, `375px`, `360px`, and `320px` mobile widths in both themes. At each viewport, use deterministic intercepted aggregate responses, preserve the existing data validation path, and check poster-only, pending, valid zero, loaded, refresh, HTTP error, invalid payload, recovery, theme change, and tooltip states. Assert `abs(height - width * 5 / 4) <= 1 CSS px`, slot-to-visual bound agreement within `1 CSS px`, and unchanged slot and copy coordinates for same-width state transitions. Freeze time and motion, keep hover transforms inactive, and allow copy reflow across viewport changes. Failure/recovery tests MUST wait for each initial failed request to settle before advancing mock time and poll timer-triggered request counts after advancing it, so assertions distinguish retry behavior from overlap suppression and asynchronous route dispatch. The test MUST fail on a real rendered size violation even if computed `aspect-ratio` reports `4 / 5`.
- `VER-NATURE-OCTORILL-DENSITY`: covers: `REQ-NATURE-OCTORILL-DENSITY`; deterministic project-wall fixtures MUST exercise repository counts `0`, `1`, `2`, `30`, `31`, `502`, `503`, `3000`, and `10000`, with mixed valid status codes and a matching current repository Stat and trend. Include refreshes from ordinary to dense data and back. Check exact DOM cell count and byte order, equal-sized square cells inside the heatmap and slot, no internal scrolling, no overlap with the metric region, and alignment of the final populated row to the lower region's bottom edge. At every covered desktop/mobile width and in both themes, measure the title box and the first populated row: their separation MUST equal the computed `0.55rem` gap within `1 CSS px`, even when unused height remains. For every complete row, its first cell's left edge and final cell's right edge MUST match the available content edges within `1 CSS px`; assert the row's actual cell bounds rather than the grid element's `width: 100%`. Incomplete final rows MUST preserve the common square dimensions and received order without additional cells. Zero-count fixtures omit populated-row assertions and retain the title. Upper-region position, height, label/value typography, and slot dimensions MUST remain unchanged within the geometry tolerance. These fixture sizes are regression samples, not a new provider payload limit. Verify CVM's null history and Hikari's zero history against their fixed 90-position contracts independently.
- `VER-NATURE-RUNTIME-CELL-TOOLTIP`: covers: `REQ-NATURE-RUNTIME-CELL-TOOLTIP`, `REQ-NATURE-RUNTIME-TOUCH-INSPECTION`, `REQ-NATURE-RUNTIME-CELL-NAVIGATION`; focused component and official-route Web Demo checks MUST cover compact daily values and units, raw-value-to-display formatting, zero/null/boundary handling, all five freshness statuses, hover continuity, keyboard access and Escape, long-press recognition, held movement between cells and across gaps, exit/return, release/cancel/multitouch, native context-menu and callout suppression, ordinary clicks and short taps on all three panels (cells, gaps, logos, and metrics), later independent clicks, data refresh, fallback, Astro route changes, and hidden pages. Verify Tooltip containment and separation from the contact occlusion region, complete text, unchanged cell count/order, and visual-slot/copy bounds within the existing `1 CSS px` tolerance at desktop and `393px`/`320px` mobile widths in both themes. iOS Safari, Android Chrome, and a touch-capable desktop browser MUST exercise actual input-driven scrolling and long-press arbitration; synthetic events supplement these checks but MUST NOT be the sole evidence for native compatibility.

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

- Historical evidence bound to local HEAD `0ed11b57` from the former Storybook mock story for the public memo detail shell; current page evidence uses the public Web Demo route.
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

- Historical evidence captured from the Storybook mock canvas for public search page states on branch `th/search-interface-redesign`; current page behavior uses the public `/search` route in the Web Demo.
- The page now renders the deep-linked query in the first paint, uses query-aware status, exposes type filters with counts, and presents result cards with readable content type, keyword-aware snippets, highlight marks, and relevance metadata.
- Keyword snippet evidence was captured with Chrome DevTools from the controlled Storybook component canvas served on a local preview lease; it is component-state evidence, not page evidence.
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
