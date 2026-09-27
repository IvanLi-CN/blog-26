# Inline Memo Admin View Implementation

## Current Status

- Implementation: implemented; build, lint, targeted HTTP and title-contract tests, and targeted browser acceptance passed.
- Lifecycle: active.

## Implementation Coverage

- The administrator island remains on `/memos`, between the existing public introduction and timeline. Guests do not receive the editor or management list.
- Quick creation keeps the existing editor dimensions and Nature surface. Visibility-specific actions and success messages distinguish current saved content from the published timeline snapshot; failures remain beside the submit action and preserve input.
- The management list requests 10 records from the existing admin-aware API, uses server cursors, debounces search, resets to the first page on query changes and refresh, and deduplicates appended records. A failed request leaves visible records in place and offers a retry.
- Cards retain the existing fields and Nature form. Desktop actions use a fixed-width column; mobile actions move below content. Titleless memos do not display their slug as a title, and private status uses the existing warning token.
- Preview keeps the read-only route. Edit fetches the current memo, opens the existing dialog in place, saves through the existing PATCH route, updates the original card, and restores focus to its trigger.
- The Storybook page fallback renders the production island with mock API responses and covers admin, guest, list error, create retry, desktop themes, and 393px/320px viewport states.

## Verification

- `bun run check` passed on the shared testbox across 469 files. Biome reported three existing warnings outside this change.
- `bun run build` passed on the shared testbox with Bun 1.4.2 and Node 22.12.0; the public site, admin SPA, backend runtime bundle, and generated project-media checks completed.
- Targeted HTTP and title-contract tests passed: 10 tests and 53 assertions covered Memo CRUD, untitled Memo slug behavior, PATCH path semantics, and Memo title parsing.
- Targeted Playwright passed: 7 admin and guest cases covered 10-item cursor pagination, search and refresh, in-place PATCH editing and focus restoration, read-only preview, private creation, public creation retry, public empty state, and desktop/393px/320px layout geometry. Google Fonts is stubbed only in these tests to avoid external-network navigation timeouts.
- Storybook rendered the production island. Browser checks covered search, no-results, keyboard focus, list retry, create retry, both themes, titleless cards, and 393px/320px overflow and action geometry.
- Owner confirmation of the current-only visual evidence is pending; the captured images remain temporary and are not yet part of the Spec.

## Remaining Gaps

- Current-candidate Tier 3 review and PR/required-CI convergence remain open. Visual evidence must be confirmed before formal review and publication.

## References

- [Spec](./SPEC.md)
- [History](./HISTORY.md)
