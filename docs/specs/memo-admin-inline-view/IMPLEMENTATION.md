# Inline Memo Admin View Implementation

## Current Status

- Implementation: implemented; the administrator list follows the latest Nature mobile content-stream contract below 640px.
- Visual evidence: owner-approved Storybook captures are persisted as nine canonical Spec assets: eight page captures and one quick-editor hover capture.
- Lifecycle: active.

## Implementation Coverage

- The administrator island remains in the Console `/memos` view after the introduction and before the single management list. Console visitors do not receive the editor or management controls; the static public site continues to render its published snapshot.
- Quick creation keeps the existing editor dimensions and Nature surface. Visibility-specific actions and success messages distinguish current saved content from the published timeline snapshot; failures remain beside the submit action and preserve input.
- The editor block handle retains measurable layout dimensions while hidden so Floating UI can position it correctly on first pointer entry. Hidden coordinates are pinned to the origin, and the handle transitions opacity only; this prevents an initial hover jump and transient editor overflow.
- The management list requests 10 records from the existing admin-aware API, uses server cursors, resets to the first page on refresh, and deduplicates appended records. It has no duplicate local search control. A failed request leaves visible records in place and offers a retry. After a successful create, the POST response remains authoritative until an immediate list response matches its title, visibility, tags, and full Markdown body; matching only the visible summary is insufficient.
- Both quick creation and in-place editing serialize the current ProseMirror document synchronously at submit time before applying the existing frontmatter and file-path normalization. The live document remains authoritative when it is shorter than the React state cache. After a successful quick save, clearing the editor invalidates queued Markdown callbacks so the previous draft cannot return to the form. Effect cleanup also clears the update gate so a recreated editor can accept changes.
- A 32px gap separates the full-size quick editor from recent management. On narrow screens the editor surface has responsive inner padding to avoid horizontal scrolling without changing its configured height; the visibility label and submit text remain intact on one line, and the submit control wraps as a whole when the available row width is insufficient.
- Cards retain the existing fields and information density. Desktop keeps the existing Nature card form with a fixed-width action column. Below 640px, the list uses one edge-to-edge translucent surface with row separators and no individual card shells; row content is inset 16px at 393px and 12px below 375px. Actions move below content. At 320px, row and section spacing compact without shrinking controls. The Memo list and detail API resolve legacy filename-derived titles through the existing local Markdown resolver; absent titles remain null. The titleless admin detail omits a display heading and slug fallback while preserving its body and tags, and PATCH preserves the empty stored title. Private status uses the existing warning token.
- Preview keeps the read-only route. Edit fetches the current memo, opens the existing dialog in place, saves through the existing PATCH route, updates the original card, and restores focus to its trigger.
- The page-level administrator and guest Storybook fallback has been removed. Administrator interactions remain covered by E2E checks for keyboard focus, titleless edit preservation, editor sizing, one-line labels, stream geometry, touch targets, and horizontal overflow. A separate titleless-detail story mounts the production detail island and checks that the body remains visible without a slug heading or modal label. The public timeline fixture uses the same mobile-stream structure as production.

## Verification

- `bun run check` passed across 487 files. Biome reported three existing warnings outside this change and one configuration deprecation notice.
- The first follow-up candidate's save-race regression passed 10 consecutive Playwright runs, including an assertion against the outgoing PATCH body; its complete inline-admin spec passed nine cases. The `c18f6902` candidate's GitHub browser run passed, but review found that its delayed-callback test could replay callbacks before the editor reset had completed. The follow-up test waits for an empty editor and zero character count before replay, then verifies both again afterward. Effect cleanup now clears the update gate before a new editor instance is initialized.
- `bun test --isolate src/server/http-compat-api.test.ts` passed on the shared testbox with 87 tests and 493 assertions. It covers legacy source-derived titles across search, snapshots, list, and detail reads, titleless API values, a titleless PATCH round trip that retains the empty storage value, and pagination for IDs containing underscores.
- The current targeted Playwright runs passed all 11 cases: nine administrator cases cover paging, same-page edit and preview, private creation, failed-create retry, stale-response reconciliation, full-size editor/card keyboard and geometry at 1280px, 393px, and 320px, plus system theme changes and reduced-motion behavior; two guest cases verify the public shell and public/private visibility.
- The quick-editor Storybook interaction reproduced the first-hover regression before the fix, then passed after it across 15 animation frames: no new overflow, stable editor width, and the block handle aligned with its target paragraph throughout. Rendered-browser checks also confirmed aligned handles across three paragraphs, continued scrolling for a 35-paragraph editor, and no overflow at 393px or 320px.
- A Chromium check of the Storybook titleless-detail state passed: the detail body remains visible, the title region has no heading, and neither the page nor edit dialog displays the slug. The approved eight-image page set is archival; its page-level Storybook fallback entries have been removed.
- The combined production build passed: Astro generated 100 static pages, the Vite admin SPA and backend runtime bundle built, and the poster/social-preview generators and PWA checks completed successfully.
- Storybook browser inspection produced eight candidates from source-bound 1440x1000, 393x852, and 320x780 viewports. Page trim-only normalization left the six light/mobile images unchanged and removed 54px of uniform side margin from each desktop dark image. The destinations were current-only against the locked base, were confirmed by the owner, and are now stored in the Spec assets.
- `impeccable detect --json` reported no deterministic findings for the changed UI components.
- Ambiguous POST outcomes can still create a duplicate on user retry if the server committed a memo but the response was lost. Exactly-once creation would change the existing API/storage contract and remains outside this locked plan.

## Remaining Gaps

- The approved visual evidence is present in the Spec; no listed admin-list screenshot surface changed during review repair. The additional component capture documents the quick-editor hover regression and is not an admin-list capture.

## References

- [Spec](./SPEC.md)
- [History](./HISTORY.md)
