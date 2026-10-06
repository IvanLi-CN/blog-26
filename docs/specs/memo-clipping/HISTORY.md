# Memo Clipping Workflow History

> This file records the topic lifecycle and compatibility background. The current contract remains in [SPEC.md](./SPEC.md).

## Lifecycle / Compatibility

- Added as an active topic after the clipping workflow was accepted as a Memo-attached capability.
- Existing Memo identity, local Markdown ownership, publication snapshot, MCP, and titleless Memo behavior remain compatibility boundaries.

## Replacements / Background

- The topic resolves the boundary between author Memo content, captured article material, generated results, and private article conversation.
- ADR 0012 records why captured material remains attached to a Memo and why conversation visibility is independent from Memo publication.

## Related Changes

- Implementation began on `th/memo-clipping` from `09bc28fe56f681828f9f877187b2c51929361efd`, retaining the approved topic and ADR.
- Creator references use a private HMAC proof so filesystem imports cannot claim another user’s discussion identity. The key is part of the backup contract.
- Browser verification exposed Milkdown's escaped literal tag and a repeated target in the saved link-only title/body. Recognition now preserves the tag meaning and removes the redundant link from the reading projection without rewriting the author file. Regression coverage includes restart reconciliation of that exact saved format.
- Real model summary, full extracted-body translation, and cited discussion were verified after removing a stale inherited LLM credential override from the local startup environment. Final-Candidate and visual delivery gates remain separate from these local observations.
- A real-provider reprocess run was interrupted after two committed translation segments and resumed under the same version/conversation after lease expiry. Hash comparisons verified preserved source, summary, committed segments, and author Markdown; the complete translation and discussion remained available after a clean restart.
- Owner layout feedback clarified that discussion is an independent card. The shared reader, console Memo page, static reading shell, and admin preview now give card ownership to the clipping component instead of wrapping both columns in another Memo card. The Memo heading stays inside the reading card; ordinary Memo presentation keeps its reading width.
- Owner screenshot feedback exposed an ambiguous language selector: the inactive outline button looked more prominent than the selected base button. The owner rejected a custom check/underline treatment because it departed from the project theme. Language controls now follow the existing rounded Nature selection treatment; keyboard focus remains independent from the displayed language.
- Owner feedback on the mixed Chinese/Latin title exposed an invalid display-font declaration caused by an unset CSS variable, together with compressed tracking and an unloaded 600 weight. The clipping title now uses the page's Chinese sans family with the available 500 weight, normal tracking, and comfortable leading. The correction is scoped to the clipping reading heading; the prior serif candidate is superseded.
- Owner clarified that the Memo and captured Markdown article must occupy separate cards. The left column now stacks the Memo card above the article card with a 24px gap, while desktop discussion remains an independent adjacent card. Shared rendering covers authorized and visitor views, console, static output, and admin preview.
- Owner clarified that reading interfaces should present 剪藏 alongside 闪念 as a distinct content type. Clipping entries use a dedicated icon, omit the marker from displayed tag chips, and keep other tags. Search offers its own clipping display filter while persisted Memo identity, authored tags, routes, and authorization remain unchanged.
- Owner rejected the initial narrow bookmark treatment and the malformed desktop list preview. The icon must visually match the existing bulb/article set; clipboard, document, book, and scissors candidates are presented for selection. The preview requires the production timeline wrapper, and desktop type metadata uses the shared icon-and-label chip.
- Owner selected candidate D, the existing Tabler scissors outline. The shared Memo presentation and search display mapping use this selection across clipping reading surfaces.
- Owner rejected changes to ordinary Memo list appearance. The added ordinary type badges and changed live-list icon size are reverted; clipping identification is conditional, and the existing ordinary Memo presentation is preserved against the development baseline.
- Owner prohibited creating pages in Storybook and required immediate deletion. Clipping page fixtures, icon-selection fixtures, the added search-page scenario, and their dedicated browser runner were removed. Previous mock page captures are withdrawn; subsequent page verification uses actual application routes.
- After synchronizing with the native Web Demo baseline, owner requested a correct Web Demo. Clipping fixtures and in-memory operations now attach to the official routes and production components through the build-time Demo adapter, with the shared Inspector controlling scenarios. No page-level Storybook entry was reintroduced.
- Compiled-artifact validation exposed an overlap between the collapsed Demo bubble and the mobile discussion action. The Demo-only bubble now occupies the opposite edge and sits below product drawers. Public/admin Demo builds, seven-width clipping interactions, and the negative live-build isolation check pass; the static preview has a dedicated leased port and no gateway. Current-only visual evidence awaits owner accuracy confirmation.
- Owner confirmed the final native Web Demo evidence images before direct PR publication. Final-Candidate empirical acceptance and formal review remain delivery gates.
- Owner rejected the redundant clipping badge beside the date in the actual Web Demo Memo list. The added badge is removed from public and live author Memo lists; their existing type icon continues to identify clipping entries. Detail type labels remain in their existing positions.
- Owner rejected the placement of three equal-emphasis detail buttons beneath the title/tags. Management actions now accompany processing status, and the original-page link accompanies the article language controls; spacing and wrapping express the two tasks without changing card ownership or list appearance.

## References

- [Requirements contract](./SPEC.md)
- [Implementation facts](./IMPLEMENTATION.md)
- [Content and conversation boundaries](../../adr/0012-memo-clipping-content-boundaries.md)
