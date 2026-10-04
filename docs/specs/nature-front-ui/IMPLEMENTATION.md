# Implementation

- Lifecycle: active
- Implementation: in progress

The public frontend uses the Nature design system without DaisyUI ownership. Subsequent work extended responsive cards, timelines, memo hierarchy, search states, Markdown hydration, mobile density, theme persistence, and repository-owned project media while retaining the same topic contract.

Public memo cards and details now omit the visible heading when the resolved memo title is null, while preserving the memo's date, tags, excerpt or body, and detail link. Cross-layer title resolution and metadata behavior are specified in docs/specs/memo-title-semantics/SPEC.md.

Project cards use 4:5 poster frames with build-generated AVIF/WebP candidates, inline previews, and a persistent readable placeholder only when no poster asset exists. Real poster artwork is never covered by generated copy or a scrim. The poster generator validates public-asset and first-row transfer budgets during the normal static build; raw PNG sources remain private to the build input.

Social previews use a separate Sharp pipeline with 640w and 1280w AVIF/WebP candidates, intrinsic dimensions, inline previews, and production budget checks. Raw social PNG sources remain private to the build input, while the rendered 2:1 frame keeps the inline preview visible during lazy loading or delivery failure. Complete light/dark poster or social-preview pairs follow the resolved public theme.

The project catalog contains 15 entries in six groups sized between two and three cards. SpotiBind is the second productivity tool, uses the repository's English light/dark media pair, and is included in the six-project homepage selection.

The project index presents both catalog totals in its introduction and keeps all six poster groups inside one shared desktop surface with restrained separators. On phones, the grouped surface reaches both viewport edges with inset headings and descriptions; category separators remain, and each horizontal poster rail extends to the viewport edge with an `85vw` card and a visible next-card peek. The first catalog poster is eager and high priority; later index posters remain lazy. Poster title and shortcut links wrap when available width or enlarged text requires it.

Mobile homepage, article-list, Memo, tag-detail, and search-result streams use one theme-aware edge-to-edge reading surface with inset content and dividers. The grouped project index uses the same surface around its category rails while preserving horizontal poster browsing. The homepage introduction, Article and Memo details, project-detail introductions and prose, and About prose also use the theme-aware reading surface. Article cover media still reaches both viewport edges without cropping. Distinct project-detail sections, search states, tag tiles, individual poster cards, and profile modules retain their own framing. Desktop surfaces retain their existing framing.

Mobile reading surfaces promote muted and faint prose, information-chip labels, and metadata to the theme's primary text color so translucent surfaces retain the required contrast across ambient frames. Search match and relevance metadata, highlighted matches, code snippets, and empty Markdown placeholders use readable foregrounds on mobile while preserving the established desktop search hierarchy. Tag and search content-type labels become plain inline icons on mobile, with type names retained in the accessible link name; desktop keeps the labelled chip. Edge-to-edge surfaces use the measured layout viewport width so classic scrollbars do not expose overflow. The guest Playwright coverage checks all visible prose and metadata in the covered reading surfaces, line-local composited contrast in light and dark themes, system-theme changes, long unbroken titles and URLs, local code scrolling, resize-driven viewport synchronization, narrow-screen row insets, mobile type-icon treatment, and search-row press and focus feedback.
The three 开发工具 cards Codex Vibe Monitor, Tavily Hikari, and OctoRill render a live-capable 4:5 runtime-data panel in place of the poster media only when their dedicated metrics BaseURL is non-empty. The three public BaseURL variables default to empty, so the normal build keeps the original poster and creates no request for an unconfigured source. The fixture contains only approved whitelist fields and remains a structural/test fallback; it is never presented as live data. The browser adapter accepts CVM's optional historical daily nulls, Hikari's daily request points, and OctoRill's interface-provided ordered freshness bytes without sorting. CVM and Hikari place their 90 daily points in seven Sunday-to-Saturday rows across horizontal week columns, with no axis labels or ticks. Metric interiors are unframed typographic matrices separated by hairlines, and both activity grids sit directly on the panel background without a secondary frame. The existing card/detail/external links remain outside the replacement visual slot.

Each approved Stat is represented by a current numeric value plus a small ordered trend series. `uPlot` is loaded only for the browser-side Canvas rendering: recent-hours Stat trends use 12 points, while today Stat trends use 25 hourly positions spanning `00:00` to the next `00:00`; trailing future positions are `null` and remain visually empty. The final non-null trend point must equal the displayed Stat value. The renderer makes each chart a full-bounds background layer of its owning Stat, uses chart padding to keep plotted marks in the lower visual area, puts the label/value/unit above it, never creates a sibling chart row or panel-wide trend area, sizes each Stat from its text content and design-derived inner padding with `min-height: 0`, places the today-Token marks toward the lower-right, uses compact content-sized Hikari rows, uses a local y-domain, keeps a flat-zero series visible, hides axes and legends, uses smooth spline paths for line trends and real rectangular bar paths with an overlaid trend line for Hikari's month and total credit trends, and resizes with its panel. The live layer fetches only configured dedicated sources while visible, stops timers in hidden tabs, and revalidates each response before updating values, charts, and the ordered OctoRill heatmap.

Runtime panel interiors also carry low-contrast, project-specific generated raster backgrounds. They are clipped to the 4:5 panel, keep labels and activity cells readable, and contain no chart-like marks. All data-like lines and bars visible in the panels are rendered by uPlot from the corresponding Stat trend values.

## Project visual slot sizing

Status: design confirmed; implementation and rendered geometry verification pending. The authoritative requirements are `REQ-NATURE-PROJECT-VISUAL-GEOMETRY` and `REQ-NATURE-OCTORILL-DENSITY` in [SPEC.md](./SPEC.md).

The current project-wall implementation leaves `.projects-poster-visual` content-sized. `ProjectPoster.astro` and `ProjectRuntimeDataPanel.astro` independently declare `aspect-ratio: 4 / 5`; `RuntimeActivityChart.astro` sets activity-grid minimum heights, while OctoRill's `.runtime-freshness-grid` sets a minimum height, its own preferred aspect ratio, 30 columns, and minimum cell height. The live adapter changes OctoRill cell count whenever a valid payload arrives. The existing guest test checks the computed aspect-ratio declaration rather than actual slot geometry. These are source observations relevant to the reported height mismatch, not a browser-confirmed root cause. No red-capable rendered reproduction has been run for this design-only change.

### Geometry ownership

The intended change reserves the project's visual height once in the index page:

- Give `.projects-poster-visual` relative positioning, full card width, border-box sizing, a 4:5 aspect ratio, and clipping of decorative overflow.
- Fit the direct poster, fallback wrapper, nested fallback poster, and runtime panel to this reserved box. Size replacement layers from the slot using absolute positioning and `inset: 0`, with `width: 100%`, `height: 100%`, and `min-height: 0`. Include the runtime panel's padding and border inside its dimensions.
- Scope the sizing overrides to project-wall visuals. Standalone project-detail posters retain their own ratio. An inner component's ratio or intrinsic minimum must not become a competing source of wall height.
- Keep the title, summary, and shortcut links in document flow below the slot; their existing wrapping behavior remains available.
- Keep the runtime logo and metric rows content-sized. The lower activity region uses the remaining grid track with `minmax(0, 1fr)` and `min-height: 0`; descendants must also allow shrinking. Replace fixed activity-grid and freshness-cell minimum heights, and let the heatmap fit this remaining height instead of deriving it from its own aspect ratio.

CVM's three metrics, Hikari's four metrics, their 12/25-point Stat trends, and their 90-date activity data are structurally bounded. They need the shared slot constraint and shrinkable activity regions, rather than a count-dependent density controller. Long metric values continue to use compact formatting and the existing full-value tooltip; labels and values remain above their background sparkline. Neither tooltip content nor uPlot canvases participate in slot sizing.

### OctoRill heatmap fit

Repository growth changes only the lower freshness grid. At the same card width, preserve the logo, two metric rows, fonts, and metric-region height. Obtain the heatmap's available inner width `W`, height `H`, and the validated freshness count `N` after layout. For `N = 0`, keep the lower region with zero cells and skip count-based division.

For `N > 0`, keep 30 columns at ordinary density and allow more columns at high density so cells can stay approximately square. A bounded fit calculation is:

```text
columns = max(30, ceil(sqrt(N * W / H)))
rows = ceil(N / columns)
gap = min(designGap, W / (2 * columns), H / (2 * rows))
cellSize = min(
  (W - (columns - 1) * gap) / columns,
  (H - (rows - 1) * gap) / rows
)
```

Use positive measured bounds; defer when a hidden grid has zero width or height. Clamp the rendered cell size to the ordinary design maximum so sparse data does not create oversized cells. Keep a fixed grid height, explicit row count, square cells, and spacing that fits both dimensions. Permit subpixel cell sizes at extreme density. Place the `N` data cells in row-major received order; unused grid positions are layout space, not fabricated repository statuses. Exclude data cells from any clipping fallback.

Recompute the fit when the grid's available bounds change or its validated payload replaces the cells. Integrate the update with `project-runtime-metrics-updated` and a scoped `ResizeObserver`, with lifecycle cleanup and without introducing another network request or timer. Update only the lower grid's geometry. At extreme counts, individual colors may become indistinguishable at the physical pixel scale; this design preserves DOM completeness, order, and fixed geometry and makes no promise of unlimited individual-cell legibility.

### Presentation states

Configured pending sources and failed HTTP or invalid/incomplete responses display the original poster in the reserved slot. Valid later refreshes display the runtime panel, including valid zero metrics, permitted null CVM history, and zero OctoRill repositories. Preserve Hikari's 90 valid daily points and reject empty arrays wherever the existing adapter rejects them. Update the live adapter to restore fallback on failed refreshes as well as initial failures; the current catch path only sets an error flag and does not restore the poster after an earlier success. Optional opacity transitions occur entirely inside the slot and respect reduced motion.

### Verification still required

Before changing runtime styles, establish and run a focused deterministic browser regression on the actual `/projects` route that fails on the reported geometry symptom. Use approved aggregate fixtures and the production response parser, and measure rendered bounds rather than accepting a CSS aspect-ratio string as proof. Record the failing command and measured dimensions before assigning a root cause; then use that same loop for the fix. The accepted design does not replace this diagnostic gate.

The Spec verification matrix covers desktop, narrow desktop, tablet, and four mobile widths in both themes, same-width state transitions, zero and null data, complete OctoRill cells at counts `0`, `1`, `30`, `31`, `502`, `3000`, and `10000`, and refreshes from ordinary to dense data and back. Assertions include slot ratio, active visual bounds, copy position, heatmap containment and order, upper metrics remaining stable, and absence of internal scrolling. Later implementation must run the focused browser checks and required build checks on the shared testbox under repository policy, and produce the controlled visual evidence required for UI delivery. Existing screenshots do not verify the newly specified geometry and dense-data acceptance criteria.

## Other public surfaces

Mobile homepage, article-list, Memo, tag-detail, and search-result streams use an unframed reading row with a divider and a `16px` text inset at `393px`. Article and Memo detail pages flatten their reading surfaces to the same inset, and project-detail headers flatten their primary surface; article cover media reaches both viewport edges without cropping. Distinct project sections, search states, tag tiles, poster cards, and profile modules retain their own framing. Desktop surfaces retain their existing framing.

The homepage keeps a local mapping from five featured projects to their official independent logo files. Native-color assets use the available theme pair; the monochrome SpotiBind and XP marks take their approved light/dark project colors through CSS masks. Each available mark sits beside its project title and may repeat as a decorative watermark behind the card content. LoadLynx intentionally has neither mark nor placeholder slot. Homepage-only adaptive external links retain full accessible names while changing from short icon-and-label buttons to icon-only buttons when the footer width requires it; other `ProjectExternalLinks` callers keep their existing behavior. The section-level browse-all action also keeps an accessible name and becomes icon-only at `360px` and below.

Project detail content uses Astro MDX with build-time slug validation and a small static React content-block allowlist. All 15 current catalog projects now have evidence-led bodies, while future projects without sufficient source material retain a verified catalog fallback. Each body chooses its own narrative and headings; no shared chapter or card outline is generated. Project cards derive compact online, documentation, and repository shortcuts from semantic public-entry precedence, while detail pages expose the full entry list in a responsive sidebar.

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
