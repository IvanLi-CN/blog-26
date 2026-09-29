# Inline Memo Admin View Implementation

## Current Status

- Implementation: implemented; the administrator list follows the latest Nature mobile content-stream contract below 640px.
- Visual evidence: owner-approved Storybook captures are persisted as eight canonical Spec assets and documented in the Spec.
- Lifecycle: active.

## Implementation Coverage

- The administrator island remains on `/memos`, between the existing public introduction and timeline. Guests do not receive the editor or management list.
- Quick creation keeps the existing editor dimensions and Nature surface. Visibility-specific actions and success messages distinguish current saved content from the published timeline snapshot; failures remain beside the submit action and preserve input.
- The management list requests 10 records from the existing admin-aware API, uses server cursors, resets to the first page on refresh, and deduplicates appended records. It has no duplicate local search control. A failed request leaves visible records in place and offers a retry. After a successful create, the POST response remains authoritative until an immediate list response matches its title, visibility, tags, and full Markdown body; matching only the visible summary is insufficient.
- A 32px gap separates the full-size quick editor from recent management. On narrow screens the editor surface has responsive inner padding to avoid horizontal scrolling without changing its configured height; the visibility label and submit text remain intact on one line, and the submit control wraps as a whole when the available row width is insufficient.
- Cards retain the existing fields and information density. Desktop keeps the existing Nature card form with a fixed-width action column. Below 640px, the list uses one edge-to-edge translucent surface with row separators and no individual card shells; row content is inset 16px at 393px and 12px below 375px. Actions move below content. At 320px, row and section spacing compact without shrinking controls. The Memo list and detail API resolve legacy filename-derived titles through the existing local Markdown resolver; absent titles remain null. The titleless admin detail omits a display heading and slug fallback while preserving its body and tags, and PATCH preserves the empty stored title. Private status uses the existing warning token.
- Preview keeps the read-only route. Edit fetches the current memo, opens the existing dialog in place, saves through the existing PATCH route, updates the original card, and restores focus to its trigger.
- The Storybook page fallback renders the production island with mock API responses and covers admin, guest, populated-list retry recovery, create retry, desktop themes, and 393px/320px viewport states. A separate titleless-detail story mounts the production detail island and checks that body content remains visible without a slug heading or modal label. The public timeline fixture uses the same mobile-stream structure as production. Admin interaction checks cover visible keyboard focus through the editor and list actions, titleless edit preservation, the full editor surface, one-line control labels, stream geometry, 44px-plus touch targets, and horizontal overflow.

## Verification

- `bun run check` passed across 487 files. Biome reported three existing warnings outside this change and one configuration deprecation notice.
- `bun test --isolate src/server/http-compat-api.test.ts` passed on the shared testbox with 86 tests and 488 assertions. It covers legacy source-derived titles across search, snapshots, list, and detail reads, titleless API values, and a titleless PATCH round trip that retains the empty storage value.
- The current targeted Playwright runs passed all 11 cases: nine administrator cases cover paging, same-page edit and preview, private creation, failed-create retry, stale-response reconciliation, full-size editor/card keyboard and geometry at 1280px, 393px, and 320px, plus system theme changes and reduced-motion behavior; two guest cases verify the public shell and public/private visibility.
- A Chromium check of the new Storybook titleless-detail state passed: the detail body remains visible, the title region has no heading, and neither the page nor edit dialog displays the slug. The existing seven Storybook visual page states and approved eight-image evidence set are unchanged.
- Astro built 100 static pages into a fresh candidate output, the Vite admin SPA built into a fresh candidate output, and the backend runtime bundle prepared successfully. The standard combined build was retried after preserving the old root-owned output directories and redirecting regenerated output; its final result is recorded with the candidate validation.
- Storybook browser inspection produced eight candidates from source-bound 1440x1000, 393x852, and 320x780 viewports. Page trim-only normalization left the six light/mobile images unchanged and removed 54px of uniform side margin from each desktop dark image. The destinations were current-only against the locked base, were confirmed by the owner, and are now stored in the Spec assets.
- `impeccable detect --json` reported no deterministic findings for the changed UI components.
- Ambiguous POST outcomes can still create a duplicate on user retry if the server committed a memo but the response was lost. Exactly-once creation would change the existing API/storage contract and remains outside this locked plan.

## Remaining Gaps

- The approved visual evidence is present in the Spec; no listed admin-list screenshot surface changed during review repair.

## References

- [Spec](./SPEC.md)
- [History](./HISTORY.md)
