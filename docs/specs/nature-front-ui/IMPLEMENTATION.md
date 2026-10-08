# Implementation

- Lifecycle: active
- Implementation: complete; awaiting PR merge

The public frontend uses the Nature design system without DaisyUI ownership. Subsequent work extended responsive cards, timelines, memo hierarchy, search states, Markdown hydration, mobile density, theme persistence, and repository-owned project media while retaining the same topic contract.

Public memo cards and details now omit the visible heading when the resolved memo title is null, while preserving the memo's date, tags, excerpt or body, and detail link. Cross-layer title resolution and metadata behavior are specified in docs/specs/memo-title-semantics/SPEC.md.

Project cards use 4:5 poster frames with build-generated AVIF/WebP candidates, inline previews, and a persistent readable placeholder only when no poster asset exists. Real poster artwork is never covered by generated copy or a scrim. The poster generator validates public-asset and first-row transfer budgets during the normal static build; raw PNG sources remain private to the build input.

Social previews use a separate Sharp pipeline with 640w and 1280w AVIF/WebP candidates, intrinsic dimensions, inline previews, and production budget checks. Raw social PNG sources remain private to the build input, while the rendered 2:1 frame keeps the inline preview visible during lazy loading or delivery failure. Complete light/dark poster or social-preview pairs follow the resolved public theme.

The project catalog contains 16 entries in six groups sized between two and three cards. SpotiBind is the second productivity tool, uses the repository's English light/dark media pair, and is included in the six-project homepage selection.

The project index presents both catalog totals in its introduction and keeps all six poster groups inside one shared desktop surface with restrained separators. On phones, the grouped surface reaches both viewport edges with inset headings and descriptions; category separators remain, and each horizontal poster rail extends to the viewport edge with an `85vw` card and a visible next-card peek. The first catalog poster is eager and high priority; later index posters remain lazy. Poster title and shortcut links wrap when available width or enlarged text requires it.

Mobile homepage, article-list, Memo, tag-detail, and search-result streams use one theme-aware edge-to-edge reading surface with inset content and dividers. The grouped project index uses the same surface around its category rails while preserving horizontal poster browsing. The homepage introduction, Article and Memo details, project-detail introductions and prose, and About prose also use the theme-aware reading surface. Article cover media still reaches both viewport edges without cropping. Distinct project-detail sections, search states, tag tiles, individual poster cards, and profile modules retain their own framing. Desktop surfaces retain their existing framing.

Mobile reading surfaces promote muted and faint prose, information-chip labels, and metadata to the theme's primary text color so translucent surfaces retain the required contrast across ambient frames. Search match and relevance metadata, highlighted matches, code snippets, and empty Markdown placeholders use readable foregrounds on mobile while preserving the established desktop search hierarchy. Tag and search content-type labels become plain inline icons on mobile, with type names retained in the accessible link name; desktop keeps the labelled chip. Edge-to-edge surfaces use the measured layout viewport width so classic scrollbars do not expose overflow. The guest Playwright coverage checks all visible prose and metadata in the covered reading surfaces, line-local composited contrast in light and dark themes, system-theme changes, long unbroken titles and URLs, local code scrolling, resize-driven viewport synchronization, narrow-screen row insets, mobile type-icon treatment, and search-row press and focus feedback.
The three 开发工具 cards Codex Vibe Monitor, Tavily Hikari, and OctoRill render a live-capable 4:5 runtime-data panel in place of the poster media only when their dedicated metrics BaseURL is non-empty. The three public BaseURL variables default to empty, so the normal build keeps the original poster and creates no request for an unconfigured source. The fixture contains only approved whitelist fields and remains a structural/test fallback; it is never presented as live data. The browser adapter accepts CVM's optional historical daily nulls, Hikari's daily request points, and OctoRill's interface-provided ordered freshness bytes without sorting. CVM and Hikari place their 90 daily points in seven Sunday-to-Saturday rows across horizontal week columns, with no axis labels or ticks. Metric interiors are unframed typographic matrices separated by hairlines, and both activity grids sit directly on the panel background without a secondary frame. The existing card/detail/external links remain outside the replacement visual slot.

Each approved Stat is represented by a current numeric value plus a small ordered trend series. `uPlot` is loaded only for the browser-side Canvas rendering: recent-hours Stat trends use 12 points, while today Stat trends use 25 hourly positions spanning `00:00` to the next `00:00`; trailing future positions are `null` and remain visually empty. The final non-null trend point must equal the displayed Stat value. The renderer makes each chart a full-bounds background layer of its owning Stat, uses chart padding to keep plotted marks in the lower visual area, puts the label/value/unit above it, never creates a sibling chart row or panel-wide trend area, sizes each Stat from its text content and design-derived inner padding with `min-height: 0`, places the today-Token marks toward the lower-right, uses compact content-sized Hikari rows, uses a local y-domain, keeps a flat-zero series visible, hides axes and legends, uses smooth spline paths for line trends and real rectangular bar paths with an overlaid trend line for Hikari's month and total credit trends, and resizes with its panel. The live layer fetches only configured dedicated sources while visible, stops timers in hidden tabs, and revalidates each response before updating values, charts, and the ordered OctoRill heatmap.

Runtime panel interiors also carry low-contrast, project-specific generated raster backgrounds. They are clipped to the 4:5 panel, keep labels and activity cells readable, and contain no chart-like marks. All data-like lines and bars visible in the panels are rendered by uPlot from the corresponding Stat trend values.

## Project visual slot sizing

Status: fixed-slot sizing, freshness title grouping, complete-row width fitting, and cell containment are implemented and visually confirmed. The authoritative requirements remain `REQ-NATURE-PROJECT-VISUAL-GEOMETRY` and `REQ-NATURE-OCTORILL-DENSITY` in [SPEC.md](./SPEC.md).

The rendered regression exposed the cause at a `1048px` viewport: Tavily Hikari's poster slot measured `284.65625px` high, while the adjacent OctoRill link and slot grew to `326.1875px` despite equal card widths. OctoRill's former `11.25rem` heatmap minimum and independent aspect ratio contributed a larger min-content size through the content-sized visual slot. Setting the slot's `min-width: 0` in a browser probe reduced the OctoRill height to the poster's height, confirming the intrinsic-size path before the fix.

The project index now reserves one relative, border-box `4:5` `.projects-poster-visual` per card. Its direct poster, fallback layer and nested poster, and runtime panel fill that box with absolute `inset: 0` positioning and explicit full width and height. The panel border and padding remain inside the slot; title, summary, and shortcuts stay in normal flow below it. These overrides apply only to the project wall. Both 90-day activity grids and the OctoRill freshness area use shrinkable remaining-height tracks without their previous independent minimum heights. CVM and Hikari retain their bounded metric and trend structures and full-value tooltips.

OctoRill's lower grid uses `calculateFreshnessLayout(N, W, H, designGap)` after each valid payload and local resize. For positive dimensions and `N > 0`, it keeps a 30-column baseline, defines `q = designGap / 8`, and evaluates each candidate column count with `r = ceil(N / c)`, `s = W / [c + q(c - 1)]`, `g = q * s`, and `T = r * s + (r - 1) * g`; a bounded binary search selects the smallest `c` with `s <= 8px` and `T <= H`. The returned `gridHeight = T` drives a content-sized grid whose `repeat(c, minmax(0, 1fr))` tracks fill each complete row exactly; rows retain square cells and the final incomplete row remains left-aligned with natural trailing space. CSS variables apply the columns, rows, gap, cell size, and grid height to all received statuses in original row-major order. The title and grid are one bottom-aligned flex group with a fixed `0.55rem` gap, so unused lower-region height appears above the title. Zero repositories retain the title and stable lower region without data tracks; zero or hidden measurements defer calculation. No data is removed, sorted, paginated, or placed in an internal scroller. The scoped `ResizeObserver` observes the stable lower region and title, and the existing `project-runtime-metrics-updated` event recalculates density without a new request or timer; binding cleanup removes listeners, observers, and pending frames on page exit.

HTTP or validation failures set the panel back to pending and reveal its original poster, including failures after a prior success. A later valid response clears the error flag and restores the panel. The existing parser still permits zero metrics, CVM historical nulls, and an empty OctoRill repository list while rejecting incomplete payloads and Hikari activity arrays without 90 points.

The focused guest regression runs against the actual `/projects` route with all three public BaseURLs set to the fixture origin at build time. Its pre-fix run failed on the measured `41.53125px` OctoRill overflow; the repaired run passes at `1780`, `1048`, `820`, `772`, `393`, `375`, `360`, and `320px` in both themes. It also checks same-width fallback and recovery, duplicate binding, ordered heatmap data and cell containment at counts `0`, `1`, `30`, `31`, `502`, `3000`, and `10000`, upper-region stability, 90-day activity cells, and no internal scroll. Failure recovery waits for the initial error response and request completion before advancing mock time, then polls timer-triggered route counts so asynchronous request dispatch cannot race the retry assertion. The shared testbox production build and focused guest E2E pass, as do `bun run check` and the related Bun unit tests. A follow-up regression reproduced up to `147.625px` of unused space below a sparse 502-cell grid; `align-content: end` now aligns its final populated row with the bottom of the available heatmap area while retaining all cells. The production-page regression failed before this correction and passes after it. The owner confirmed the mock-only visual comparison covering ordinary, dense, and fallback states at desktop and `393px` mobile sizes in both themes; the Spec records all 12 images.

## Runtime cell Tooltip and touch inspection

Status: implementation complete at candidate `2bb66cd43414690711f86a187f9806df3ec0bbdc`; native-device evidence pending. The authoritative contracts are `REQ-NATURE-RUNTIME-CELL-TOOLTIP`, `REQ-NATURE-RUNTIME-TOUCH-INSPECTION`, and `REQ-NATURE-RUNTIME-CELL-NAVIGATION` in [SPEC.md](./SPEC.md). The [interaction design](../../project-runtime-tooltip-design.md) records the parameter recommendations and browser constraints.

`src/components/ui/tooltip.tsx` provides the public Nature-themed Radix wrapper with Portal, collision padding, complete wrapping, and viewport-safe sizing. `site/components/projects/RuntimeCellGrid.tsx` is the shared client island for CVM, Hikari, and OctoRill; it preserves source dates and raw numeric values, distinguishes zero/null/calendar padding, exposes five anonymous freshness states, and keeps one controlled Tooltip per grid. The grid publishes adaptive row/column semantics, restores the focused cell across density reflow, uses a single roving Tab stop with focus, arrow/Home/End navigation, Escape dismissal, keeps independent detail-link semantics, and consumes ordinary activity-grid clicks without opening a Tooltip or navigating. Keyboard inspection and valid OctoRill detail-link clicks remain usable after a recognized touch inspection, while only the follow-up touch-like link click is consumed.

`site/components/projects/runtime-cell-gesture.ts` owns the independently testable 500ms/8 CSS px touch state machine. The chart installs a local non-passive `touchmove` listener before recognition, releases pre-recognition movement for native scrolling, prevents cancellable movement after recognition, hit-tests the contact center without snapping to empty slots, and positions the Portal anchor away from a minimum 48 CSS px contact occlusion radius. Release, cancellation, multitouch, visibility/pagehide, Astro swaps, poster fallback, context menus, callouts, selection, and the one follow-up synthetic click are cleaned up locally.

`site/lib/project-runtime-channel.ts` stores the latest valid model per panel and replays it when a React island hydrates, while holding the newest response during a recognized touch inspection and applying it once on release. Fallback clears the replay model and closes any active Tooltip. The visual/detail DOM is now split into independent siblings, and runtime refreshes publish models instead of replacing grid children.

Coverage includes `tests/components/runtime-cell-grid.test.tsx`, `tests/components/runtime-cell-gesture.test.ts`, `tests/lib/project-runtime-channel.test.ts`, the `RuntimeCellGrid` Storybook stories and play functions, and the official `/projects` guest targeted Playwright route. The browser regression covers exact values, zero/null/boundary handling, all five freshness states, hover continuity across poster transforms, keyboard navigation/Escape, valid-cell-only long-press candidates, pre-recognition movement, 500ms long press, held movement with `preventDefault`, local context-menu suppression, follow-up click consumption and independent click recovery, release cleanup for multitouch, `touchcancel`, fallback, hidden pages, and Astro swaps, page-error detection, and latest-model refresh replay. Inspector refreshes cancel data-mode requests, discard stale response generations, and drain the latest refresh after slow requests. Activity grids expose row semantics while navigable OctoRill cells retain native link semantics; the live density fitter counts cells independently of the ARIA row wrappers. `bunx astro build`, `bun run console:build`, `bun run build-storybook`, the 52 Storybook play functions, 17 focused Bun tests, the 4-case targeted runtime Playwright test, the Web Demo site/admin build, and the 1007-test pre-commit suite pass. Actual iOS Safari, Android Chrome, and touch-capable desktop input remain unavailable in this environment, so the native gesture gate is intentionally open.
### Freshness spacing implementation

The screenshot diagnosis is resolved in [ProjectRuntimeDataPanel.astro](../../../site/components/projects/ProjectRuntimeDataPanel.astro), [runtime-freshness-layout.ts](../../../site/lib/runtime-freshness-layout.ts), and [project-runtime-live.ts](../../../site/lib/project-runtime-live.ts). The stable lower section owns the separator and available content box; the title and content-height grid are bottom-aligned as one group, with `0.55rem` between the title and first row. The live binding subtracts the title, gap, padding, and borders from that stable box before fitting the grid, observes both the section and title, merges valid data and resize events through one animation frame, and cleans up observers, listeners, and pending work on exit.

The pure layout contract now returns `gridHeight` in addition to columns, rows, gap, and cell size. Its bounded integer search preserves the `8px` cap and 30-column baseline while scaling the gap with the cell size, so every complete row spans the measured content width exactly. CSS grid tracks use fractional columns and rows with the computed height; every received status remains in row-major order, and only an incomplete final row can retain trailing space. Zero repositories retain the title and stable lower region without cells. The focused unit and production-page regressions cover sparse, ordinary, boundary, and dense counts, refresh transitions, failure recovery, and all supported viewport and theme combinations.

## Other public surfaces

Mobile homepage, article-list, Memo, tag-detail, and search-result streams use an unframed reading row with a divider and a `16px` text inset at `393px`. Article and Memo detail pages flatten their reading surfaces to the same inset, and project-detail headers flatten their primary surface; article cover media reaches both viewport edges without cropping. Distinct project sections, search states, tag tiles, poster cards, and profile modules retain their own framing. Desktop surfaces retain their existing framing.

The homepage keeps a local mapping from five featured projects to their official independent logo files. Native-color assets use the available theme pair; the monochrome SpotiBind and XP marks take their approved light/dark project colors through CSS masks. Each available mark sits beside its project title and may repeat as a decorative watermark behind the card content. LoadLynx intentionally has neither mark nor placeholder slot. Homepage-only adaptive external links retain full accessible names while changing from short icon-and-label buttons to icon-only buttons when the footer width requires it; other `ProjectExternalLinks` callers keep their existing behavior. The section-level browse-all action also keeps an accessible name and becomes icon-only at `360px` and below.

Project detail content uses Astro MDX with build-time slug validation and a small static React content-block allowlist. All 16 current catalog projects now have evidence-led bodies, while future projects without sufficient source material retain a verified catalog fallback. Each body chooses its own narrative and headings; no shared chapter or card outline is generated. Project cards derive compact online, documentation, and repository shortcuts from semantic public-entry precedence, while detail pages expose the full entry list in a responsive sidebar.

The mobile public header uses a pure scroll-state controller shared by every
`BaseLayout` route. It keeps one sticky header in document flow, maps measured
height to a CSS `top` offset, distinguishes slow and fast reverse movement, and
settles only after the quiet-release window. Reverse-direction samples remain
pending until the 12px minimum is reached, so small counter-scrolls cannot
change the active gesture or its release endpoint. A slow reverse remains on
the active hide gesture even after that distance is crossed, preserving the
endpoint-only release contract. Unit tests cover the state machine; guest
Playwright coverage covers route integration, responsive behavior, focus order,
lifecycle reset, and reduced motion. Reverse speed is calculated from the
current directional run within the rolling window, so earlier movement cannot
promote a slow counter-scroll; pending fast-reverse eligibility is evaluated
again until the 12px crossing. Overlapping settle transitions are cancelled
before a new release timer starts. Zero-delta samples preserve the directional
window's elapsed time, and a focused header descendant prevents collapse until
focus leaves the header.
Pending reverse distance is cancelled before resumed movement contributes to
the active gesture, preventing zero-net scroll jitter from changing the header
offset.
Touch-active scrolling clears and suppresses settle timers until the final
touch release, so a paused finger retains direct control of the current
offset; release then uses the existing quiet-window endpoint rules.
Once touch movement starts the header, subsequent deltas use a direct-follow
path in either direction until release, avoiding slow-reverse gating while the
finger remains down.
Route, viewport, and controller refreshes cancel the active touch gesture and
reset its origin; a subsequent touch start begins a fresh gesture while
teardown clears settle timers and DOM state.
Direct-follow is enabled only when the current delta can change the header
offset; endpoint no-ops continue through the normal direction gates.

## Ambient renderer

The public shell mounts a transparent native-DPR WebGPU renderer over the
existing Nature CSS background. `ambient-leaf.ts` owns the approved broad and
willow vector masters, explicit path opacities, and four-tile atlas generation.
SVG uses independent path nodes; WebGPU instances sample the same masks and
apply the shared deterministic pose and current theme palette. The atlas uses
twice native-DPR leaf density and two-texel isolation; theme and ordinary
viewport changes reuse it, while DPR changes replace it asynchronously.

Public adapter and device limits cover the canvas, atlas, and fixed seed
buffer. Full detail includes secondary veins; conservative detail preserves
the complete outline, stem, and primary rib. Reduced motion never requests an
adapter. SVG remains mounted during initial preparation and is the fallback
for decode/upload/context/pipeline failure and device loss. Generation guards
discard late work; replacement and teardown close bitmaps and release GPU
resources. Visible motion retains approximately 30Hz scheduling and hidden
pages stop submissions, including initialization that completes while the page
is hidden. The prepared renderer does not submit until mount and rereads
document visibility at that boundary. ADR 0011 owns the current rendering
decision.

The co-located ambient Storybook gallery uses the production coordinator with
internal fixed-frame and renderer-tier inputs. Viewport-bound desktop/mobile
stories supply deterministic browser evidence independently of backend data.
