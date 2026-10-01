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

The public shell mounts a transparent native-DPR WebGPU ambient renderer over
the CSS theme background. A deterministic motion model drives three wind paths
and the responsive desktop/mobile leaf count. The WebGPU pass uses premultiplied
alpha and a transparent clear value, while visible pages use direct
`requestAnimationFrame` scheduling at approximately 30Hz and hidden pages stop
submitting commands.
The adapter's public limits are checked against the exact native-DPR backing
size before configuration; an unsupported allocation uses SVG instead of
lowering DPR. A deterministic internal `performanceScore` uses only the
adapter's public limits and fixed seed-buffer requirement: score 2 renders the
complete WebGPU scene, score 1 keeps WebGPU while omitting the non-essential
leaf outline, and score 0 uses SVG. Queue completion timing, frame timing,
private browser fields, vendor tables, and hardware heuristics do not affect
this score or select another renderer.
The shell first mounts a complete static SVG scene so reduced-motion users and
unsupported or failed WebGPU initialization have an immediate, vector-quality
fallback. Device loss, context/pipeline failure, theme changes, resize, and
reduced-motion changes are guarded by the renderer lifecycle coordinator. The
production decision is recorded in ADR 0007; ADR 0004 through ADR 0006 remain
historical Canvas, benchmark, and initial WebGPU decisions.
