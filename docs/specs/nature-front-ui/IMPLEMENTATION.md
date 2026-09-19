# Implementation

- Lifecycle: active
- Implementation: implemented

The public frontend uses the Nature design system without DaisyUI ownership. Subsequent work extended responsive cards, timelines, memo hierarchy, search states, Markdown hydration, mobile density, theme persistence, and repository-owned project media while retaining the same topic contract.

Project cards use 4:5 poster frames with build-generated AVIF/WebP candidates, inline previews, and a persistent readable placeholder only when no poster asset exists. Real poster artwork is never covered by generated copy or a scrim. The poster generator validates public-asset and first-row transfer budgets during the normal static build; raw PNG sources remain private to the build input.

Social previews use a separate Sharp pipeline with 640w and 1280w AVIF/WebP candidates, intrinsic dimensions, inline previews, and production budget checks. Raw social PNG sources remain private to the build input, while the rendered 2:1 frame keeps the inline preview visible during lazy loading or delivery failure. Complete light/dark poster or social-preview pairs follow the resolved public theme.

The project catalog contains 15 entries in six groups sized between two and three cards. SpotiBind is the second productivity tool, uses the repository's English light/dark media pair, and is included in the six-project homepage selection.

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
