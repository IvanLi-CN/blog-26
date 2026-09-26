# Implementation

- Lifecycle: active
- Implementation: implemented

The public frontend uses the Nature design system without DaisyUI ownership. Subsequent work extended responsive cards, timelines, memo hierarchy, search states, Markdown hydration, mobile density, theme persistence, and repository-owned project media while retaining the same topic contract.

Public memo cards and details now omit the visible heading when the resolved memo title is null, while preserving the memo's date, tags, excerpt or body, and detail link. Cross-layer title resolution and metadata behavior are specified in docs/specs/memo-title-semantics/SPEC.md.

Project cards use 4:5 poster frames with build-generated AVIF/WebP candidates, inline previews, and a persistent readable placeholder only when no poster asset exists. Real poster artwork is never covered by generated copy or a scrim. The poster generator validates public-asset and first-row transfer budgets during the normal static build; raw PNG sources remain private to the build input.

Social previews use a separate Sharp pipeline with 640w and 1280w AVIF/WebP candidates, intrinsic dimensions, inline previews, and production budget checks. Raw social PNG sources remain private to the build input, while the rendered 2:1 frame keeps the inline preview visible during lazy loading or delivery failure. Complete light/dark poster or social-preview pairs follow the resolved public theme.

The project catalog contains 15 entries in six groups sized between two and three cards. SpotiBind is the second productivity tool, uses the repository's English light/dark media pair, and is included in the six-project homepage selection.

The project index presents both catalog totals in its introduction and keeps all six poster groups inside one shared desktop surface with restrained separators. On phones, the group surface flattens and the poster rail extends to the viewport edge; cards use `85vw` with a visible next-card peek. The first catalog poster is eager and high priority; later index posters remain lazy. Poster title and shortcut links wrap when available width or enlarged text requires it.

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
