# Inline Memo Admin View Implementation

## Current Status

- Implementation: implemented; the administrator list follows the latest Nature mobile content-stream contract below 640px.
- Visual evidence: owner-approved Storybook captures are persisted as eight canonical Spec assets and documented in the Spec.
- Lifecycle: active.

## Implementation Coverage

- The administrator island remains on `/memos`, between the existing public introduction and timeline. Guests do not receive the editor or management list.
- Quick creation keeps the existing editor dimensions and Nature surface. Visibility-specific actions and success messages distinguish current saved content from the published timeline snapshot; failures remain beside the submit action and preserve input.
- The management list requests 10 records from the existing admin-aware API, uses server cursors, resets to the first page on refresh, and deduplicates appended records. It has no duplicate local search control. A failed request leaves visible records in place and offers a retry. After a successful create, the POST response remains authoritative if the immediate first-page response contains an older version of the same record.
- A 32px gap separates the full-size quick editor from recent management. On narrow screens the editor surface has responsive inner padding to avoid horizontal scrolling without changing its configured height; the visibility label and submit text remain intact on one line, and the submit control wraps as a whole when the available row width is insufficient.
- Cards retain the existing fields and information density. Desktop keeps the existing Nature card form with a fixed-width action column. Below 640px, the list uses one edge-to-edge translucent surface with row separators and no individual card shells; row content is inset 16px at 393px and 12px below 375px. Actions move below content. At 320px, row and section spacing compact without shrinking controls. Titleless memos do not display their slug as a title; the admin-aware list/detail API returns a nullable title, and PATCH preserves the empty stored title. Private status uses the existing warning token.
- Preview keeps the read-only route. Edit fetches the current memo, opens the existing dialog in place, saves through the existing PATCH route, updates the original card, and restores focus to its trigger.
- The Storybook page fallback renders the production island with mock API responses and covers admin, guest, populated-list retry recovery, create retry, desktop themes, and 393px/320px viewport states. Its public timeline fixture uses the same mobile-stream structure as production. The admin interaction checks cover visible keyboard focus through the editor and list actions, titleless edit preservation, the full editor surface, one-line control labels, stream geometry, 44px-plus touch targets, and horizontal overflow.

## Verification

- `bun run check` passed locally across 487 files. Biome reported three existing warnings outside this change and one configuration deprecation notice.
- The shared-testbox Playwright web server completed `bun run build`; Astro public output, Vite admin output, backend runtime bundle, and generated project-media checks completed.
- `bun test src/server/http-compat-api.test.ts` passed with 86 tests and 480 assertions, including nullable admin-aware list/detail titles and a titleless PATCH round trip that retains the empty storage value.
- The current targeted Playwright run passed all 10 cases: eight administrator cases cover server paging order, same-page edit and preview, private creation, failed-create retry, both stale-list response cases, full-size editor/card keyboard and geometry checks at 1280px, 393px, and 320px, and restored-scroll header state at 320px; two guest cases verify the public shell and public/private API visibility.
- Seven Storybook browser states passed, covering the production-island fallback through load-more, titleless edit and focus traversal, populated-list retry recovery with all 10 records retained during failure, create retry, desktop themes, and 393px/320px responsive geometry. The Storybook fallback header no longer carries a utility class that overrode the Nature mobile sticky offset; both narrow states confirm the header is fully collapsed and the management heading remains visible.
- Storybook browser inspection produced eight candidates from source-bound 1440x1000, 393x852, and 320x780 viewports. Page trim-only normalization left the six light/mobile images unchanged and removed 54px of uniform side margin from each desktop dark image. The destinations were current-only against the locked base, were confirmed by the owner, and are now stored in the Spec assets.
- `impeccable detect --json` reported no deterministic findings for the changed UI components.
- Current-candidate Tier 3 review and PR/required-CI convergence remain open.

## Remaining Gaps

- The approved visual evidence is present in the Spec. Current-candidate Tier 3 review and PR/required-CI convergence remain open.

## References

- [Spec](./SPEC.md)
- [History](./HISTORY.md)
