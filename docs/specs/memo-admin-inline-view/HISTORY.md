# Inline Memo Admin View History

## Lifecycle / Compatibility

- This topic owns only the administrator controls embedded in the public Memos list page. The public Nature reading contract and Memo title semantics retain their separate ownership.
- The approved layout keeps quick creation before recent management and the published public timeline. Current saved Memos and the published snapshot remain separate concepts.

## Related Changes

- Owner review removed the duplicate search control from the administrator list while retaining site-wide search, corrected the mobile editor action row so visibility and submit labels remain intact at narrow widths, and removed the editor's narrow-screen horizontal overflow while preserving its full outer height.
- The editor and recent management section use an explicit separation so their distinct tasks are immediately apparent.
- The latest mainline Nature contract requires continuous reading surfaces below 640px. The administrator list now keeps desktop cards while rendering narrow-screen rows on one edge-to-edge surface with separators and the existing 16px/12px reading insets.
- Review hardening keeps a just-created Memo visible while the first refreshed page is stale, and preserves a titleless Memo through the admin-aware list/detail and PATCH paths.
- The Memo list/detail API now resolves legacy filename-derived titles through the shared public title contract. Titleless admin detail omits slug display, and create/list reconciliation compares complete title and Markdown content rather than only its excerpt.
- Browser acceptance now checks system-theme changes and reduced-motion behavior alongside the existing desktop and narrow-screen keyboard paths.
- The Storybook page fallback now follows the production Nature mobile header offset; its 393px and 320px checks confirm the collapsed header does not cover the management heading or introduce horizontal overflow.
- The owner approved a backward-compatible Memo pagination API extension for the bidirectional timeline. Omitting `direction` keeps the established older-page behavior and existing field semantics; reverse traversal uses the optional direction parameter and additive `previousCursor` and `hasPrevious` response fields. Breaking changes to existing API fields and semantics remain out of scope.

## References

- [Spec](./SPEC.md)
- [Implementation](./IMPLEMENTATION.md)
