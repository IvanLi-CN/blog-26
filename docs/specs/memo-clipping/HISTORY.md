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
- No delivery PR exists yet; empirical model acceptance and visual approval remain open.

## References

- [Requirements contract](./SPEC.md)
- [Implementation facts](./IMPLEMENTATION.md)
- [Content and conversation boundaries](../../adr/0012-memo-clipping-content-boundaries.md)
