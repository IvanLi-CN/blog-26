# History

- 2026-04-05: The Nature redesign topic was created.
- 2026-04-06 through 2026-06-19: Visual, responsive, search, timeline, hydration, and memo-detail decisions were added under the same public design contract.
- 2026-07-31 through 2026-08-02: Mobile density, code surfaces, navigation, and query hydration were hardened.
- 2026-08-19: Project posters and social previews moved to repository-owned media, including intrinsic social-preview sizing and theme-aware asset pairs.
- 2026-08-20: Project poster delivery gained build-generated responsive AVIF/WebP variants, hard size budgets, inline previews, persistent fallback copy, and first-load theme binding for social previews.
- 2026-08-21: Poster overlays were limited to media-free placeholders, and social previews gained private PNG sources, responsive AVIF/WebP generation, intrinsic 2:1 frames, and build-time size guards.
- 2026-09-16: The project catalog expanded with SpotiBind and settled on six single-name groups with no more than three cards per group.
- 2026-09-17: Project details gained an Astro MDX authoring path, semantic public-entry shortcuts, responsive entry/TOC sidebar behavior, and the first Codex Vibe Monitor body migration.
- 2026-09-18: The remaining 14 catalog projects gained evidence-led MDX bodies with project-specific headings and preserved catalog-only fallback rules for future projects without sufficient material.
- 2026-09-19: Mobile public header motion was specified as a single sticky document-flow controller with speed-aware reverse scrolling and release-only endpoint settling; ADR 0002 records the boundary decision.
- 2026-09-19: Reverse-direction changes now accumulate the 12px minimum before changing the active gesture, keeping partial hide gestures stable during small counter-scrolls.
- 2026-09-19: Slow reverse movement that crosses the distance threshold remains attached to the active hide gesture, so release settling cannot leave a partially visible header.
- 2026-09-19: Reverse speed now measures only the current directional run inside the rolling window, and overlapping settle transitions are cancelled before a new release timer starts.
- 2026-09-19: Zero-delta samples no longer break directional speed windows, and a focused header control keeps the header expanded until focus leaves it.
- Detailed final evidence and its binding metadata remain in `SPEC.md`.
