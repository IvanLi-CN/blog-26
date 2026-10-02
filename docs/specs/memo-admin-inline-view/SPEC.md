# Inline Memo Admin View

## Context and Scope

- Context: The static public Memos page renders the published snapshot. The Console Memos view serves live public Memos to visitors and exposes quick authoring plus one management list to authenticated administrators.
- In scope: administrator-only layout and interaction in the Console Memos view, quick creation, the recent management list, preview and edit actions, bidirectional public Memo pagination on the published site and Console guest view, loading feedback, and responsive accessibility.
- Out of scope: changing published snapshot content or timing, Console deployment boundaries, Memo storage and publication timing, API contract changes, Memo detail redesign, and changes to the established Memo title contract.

## Terms and Interfaces

- Real-time Memo: the administrator's current saved Memo, whether public or private.
- Public Memo timeline: the published reader-facing Memo snapshot, which can lag behind current saved content.
- Interface: the public site and Console use the `/memos` path on separate hosts and runtime modes. The public site uses its published snapshot; Console visitors receive live public Memos, and administrators use the existing Memo API and preview and edit capabilities.

## Composition

The Console administrator view reads in this order: Memos introduction; administrator-only status line and full-size quick editor; one administrator-only recent Memo list. Console visitors and the static public site receive the public Memo timeline without authoring controls. The administrator view does not render a second published snapshot timeline after the management list. The status line remains low-emphasis; a clear vertical gap separates the editor from the list. The list heading, item count, and refresh action share one header. It does not add a second search control; site-wide search remains the discovery entry point.

On wide screens, each card reserves a stable area for actions beside its content. On narrow screens, the administrator list follows the public Nature mobile content-stream pattern: one edge-to-edge reading surface with separators, no individual card shells, and row content inset 16px at 393px or 12px below 375px. The same actions move below the content in a consistent order. All Memo fields and information density remain intact, and desktop cards retain their existing form.

## Requirements

### REQ-MAIV-001

- The static public Memos page MUST render the published snapshot. Console visitors MUST receive live public Memos, while only administrators may see authoring and management controls. The administrator view MUST contain one Memo management list and MUST NOT add a second published snapshot timeline.
- The authoring and management area MUST remain within the Console Memos view and MUST NOT introduce a separate Memo-specific admin route.

### REQ-MAIV-002

- Quick Memo creation MUST be the first administrator task after the public introduction. The editor MUST remain directly available, with its current usable writing area and full editing capabilities; it MUST NOT be collapsed or reduced in size to make room for the list.
- Administrator-mode explanation MUST be a low-emphasis status line rather than a prominent extra surface around the editor. The editor MUST keep its established Nature visual language.

### REQ-MAIV-003

- The management section MUST follow the editor and show the first 10 Memos in the existing administrative list order by default. When a newer or older cursor exists, approaching that edge MUST automatically load its adjacent page within a 900px vertical prefetch threshold. Newer pages MUST prepend and older pages MUST append in service order without duplicates; prepending MUST preserve the currently read Memo's viewport position. It MUST NOT show a normal visible load-more button. A visible manual fallback MUST remain when IntersectionObserver is unavailable. Refresh MUST return to the latest page.
- The public Memo timeline MUST show the first 10 published records and load adjacent pages in either direction when the corresponding cursor exists. The published static site MUST read older pages from files generated from the public snapshot; Console guests MUST read public-only pages from the database. Private or draft Memos MUST never appear in either guest source. The administrator list MUST read all visibility states from the database.
- The public and administrator Memo lists MUST use variable-height virtualization with stable Memo keys. The number of mounted cards MUST stay bounded as loaded records grow, while loaded records remain available for scrolling in either direction.
- Loading feedback MUST use the compact three-dot wave indicator at the active edge and respect reduced-motion preferences. A failed page MUST replace that indicator with a same-position retry action; exhausting older records MUST show the total count. Refresh remains associated with the administrator list.
- The management heading MUST distinguish current saved Memos from the published public timeline. The list MUST NOT introduce a local search control that duplicates site-wide search.
- The management list MUST preserve its existing Nature card form, fields, and information density on desktop. Below 640px, it MUST follow the public Nature mobile content-stream contract: a full-bleed translucent surface, row separators, and no individual card shells. This responsive presentation MUST NOT remove fields or reduce Memo information density.

### REQ-MAIV-004

- Each management card MUST keep its information and actions in stable positions when titles, excerpts, or tags vary in length. Wide layouts MUST reserve a stable action area beside content; narrow layouts MUST place actions below content in a consistent order without clipped text or horizontal page overflow.
- “Preview” MUST open the read-only preview destination. “Edit Memo” MUST open the existing edit dialog in the current list context, retaining the list position and item identity when the dialog closes.

### REQ-MAIV-005

- Quick creation MUST preserve the current default public/private behavior and underlying publication timing. Its primary command MUST name the selected visibility outcome clearly.
- Success feedback MUST distinguish a saved current Memo from the published public timeline. Validation and save failures MUST be announced near the editor command with a useful recovery path; a long management list MUST NOT separate the error from its source.

### REQ-MAIV-006

- The administrator area MUST use the existing public Nature colors, typography, spacing, radii, and light/dark/system theme behavior. The list MUST retain desktop cards and use the established mobile content-stream presentation below 640px; its fields and information density MUST remain the same at every viewport.
- The editor, visibility control, primary command, pagination retry/fallback, and card actions MUST be operable in logical keyboard order with visible focus. At 393px and 320px, control labels MUST remain on one line, the full-size editor surface MUST NOT create horizontal scrolling, content MUST remain readable without horizontal page overflow, and touch controls MUST retain the public surface's 44px minimum target.

### REQ-MAIV-007

- The view MUST preserve the established Memo title, visibility, public snapshot, storage, and API semantics. This design contract MUST NOT introduce a new title fallback, publication step, content source, or administrator permission shortcut.

## Verification

### VER-MAIV-001

- Method: authenticated and guest route checks with desktop and mobile visual inspection.
- covers: `REQ-MAIV-001`, `REQ-MAIV-002`
- Pass condition: the static public page continues to show the published snapshot; Console visitors see live public Memos without admin controls; Console administrators see the full editor before one recent management list, with no second snapshot timeline.

### VER-MAIV-002

- Method: list interaction checks using more than 10 Memos with different title, excerpt, tag, and visibility lengths.
- covers: `REQ-MAIV-003`, `REQ-MAIV-004`
- Pass condition: the production lists start at the latest 10 records; whenever a newer or older cursor exists, approaching that edge loads its adjacent page in order without duplicates; prepending keeps the current Memo at the same viewport position; a visible load-more control appears only when IntersectionObserver is unavailable; admin refresh returns to the latest page; guest console requests remain public-only; static pages read published snapshot chunks; loading retry, reduced-motion feedback, and the older-end count work; mounted card count stays bounded as loaded count grows; no local search box appears in the management list; card fields, alignment, edit, and preview remain unchanged.

### VER-MAIV-005

- Method: run `bun run demo:memo-list` and inspect the shipped Astro `/memos/?demo=true` route with a mock-only 2,400-record fixture, scrolling toward both edges. The Web Demo must reuse the real site route and production list; it must not be implemented as a Storybook page or a standalone demo route.
- covers: `REQ-MAIV-003`
- Pass condition: newer and older pages both load on scroll, the reading anchor remains stable when prepending, and rendered DOM rows remain bounded while the loaded count increases.

### VER-MAIV-003

- Method: quick creation and failure-state checks for public and private outcomes.
- covers: `REQ-MAIV-005`, `REQ-MAIV-007`
- Pass condition: defaults and persistence semantics remain unchanged; command copy matches the selected visibility; the new item appears in the current list; success explains the public snapshot boundary; a failed save leaves content available and shows a nearby actionable error.

### VER-MAIV-004

- Method: keyboard, focus, theme, and viewport checks at desktop, 393px, and 320px.
- covers: `REQ-MAIV-004`, `REQ-MAIV-006`
- Pass condition: focus can move from the editor to visibility and submit controls; the editor action labels remain intact on one line at narrow widths; the full-size editor surface has no internal horizontal scroll; actions remain reachable and legible; no horizontal page overflow or clipped editor content occurs; light, dark, system, and reduced-motion states preserve meaning and contrast.

## Visual Evidence

The eight page-level captures below were rendered from the former Storybook page fallback using mock API data and are retained as historical records. Their administrator and guest page-story entries have been removed; they are not current page-story coverage. The dark quick-editor component capture below is the current Storybook visual evidence. The historical desktop captures show the full-size editor, spacing before recent management, and the desktop card layout. The narrow-screen captures show the prior Nature stream layout.

The bidirectional virtual-list capture comes from the production Astro `/memos/?demo=true` Web Demo, using the shared production timeline, cards, pagination, and virtualized list with local mock data. The image records a rendered list state; browser and E2E checks provide the behavioral proof for loading in both directions, preserving order, stopping at the finite edges, and keeping mounted rows bounded.

source_type=ui_demo; target_program=mock-only; capture_scope=page; sensitive_exclusion=N/A; submission_gate=approved
- Route: `/memos/?demo=true`; state: themed 2,400-record fixture after scrolling.
![Memo bidirectional virtual-list Web Demo](./assets/memo-list-web-demo-scroll.png)

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; viewport_strategy=storybook-viewport; evidence_surface=page; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--admin-page-fallback-visual-light`; viewport: `memoDesktop` (1440x1000); state: light theme, page top.
![Memo administrator desktop light page top](./assets/admin-memo-desktop-light-top.png)

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; viewport_strategy=storybook-viewport; evidence_surface=page; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--admin-page-fallback-visual-light`; viewport: `memoDesktop` (1440x1000); state: light theme, management list.
![Memo administrator desktop light management list](./assets/admin-memo-desktop-light-list.png)

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; viewport_strategy=storybook-viewport; evidence_surface=page; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--admin-page-fallback-dark`; viewport: `memoDesktop` (1440x1000); state: dark theme, page top.
![Memo administrator desktop dark page top](./assets/admin-memo-desktop-dark-top.png)

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; viewport_strategy=storybook-viewport; evidence_surface=page; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--admin-page-fallback-dark`; viewport: `memoDesktop` (1440x1000); state: dark theme, management list.
![Memo administrator desktop dark management list](./assets/admin-memo-desktop-dark-list.png)

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; viewport_strategy=storybook-viewport; evidence_surface=page; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--admin-page-fallback-393`; viewport: `memo393` (393x852); state: light theme, page top.
![Memo administrator 393px page top](./assets/admin-memo-mobile-393-top.png)

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; viewport_strategy=storybook-viewport; evidence_surface=page; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--admin-page-fallback-393`; viewport: `memo393` (393x852); state: light theme, management list.
![Memo administrator 393px management list](./assets/admin-memo-mobile-393-list.png)

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; viewport_strategy=storybook-viewport; evidence_surface=page; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--admin-page-fallback-320`; viewport: `memo320` (320x780); state: light theme, page top.
![Memo administrator 320px page top](./assets/admin-memo-mobile-320-top.png)

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; viewport_strategy=storybook-viewport; evidence_surface=page; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--admin-page-fallback-320`; viewport: `memo320` (320x780); state: light theme, management list.
![Memo administrator 320px management list](./assets/admin-memo-mobile-320-list.png)

Normalization used `trim_only`: seven captures were unchanged; the desktop dark page-top capture had 54px of uniform side margin removed from each side. The locked development base does not contain this topic or its assets, so the eight original captures were `current-only` at their exact paths. The owner approved this set for persistence. No PR screenshot exists yet.

A separate component capture records the dark quick editor on the first pointer hover after rendering. The block handle stays aligned with its paragraph throughout the measured animation frames, and the editor does not gain a spurious scrollbar.

source_type=storybook_canvas; target_program=mock-only; capture_scope=element; requested_viewport=none; viewport_strategy=storybook-viewport; margin_policy=require_margin; evidence_surface=component; surface_selector=[data-visual-evidence-surface]; target_selector=[data-visual-evidence-target]; sensitive_exclusion=N/A; submission_gate=approved
- Story: `public-memo-authoring--quick-publish-empty-dark`; state: dark theme, pointer over the empty editor paragraph after render.
![Quick memo editor hover without layout shift](./assets/quick-editor-hover-dark.png)

## Related ADRs

- [Use a Self-Contained SSR Console Beside the Static Public Site](../../adr/0010-self-contained-console-runtime.md)

## References

- [Nature Frontend Redesign Without DaisyUI](../nature-front-ui/SPEC.md)
- [Memo Title Semantics](../memo-title-semantics/SPEC.md)
- [Implementation](./IMPLEMENTATION.md)
- [History](./HISTORY.md)
