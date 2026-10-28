---
status: accepted
---

# Keep Public List Cover Cards Unwatermarked

The public list cover card is the only cover surface that must use the original public facade asset without a watermark. Detail covers and every other media surface retain the existing watermark contract.

## Context

The public-media watermark rollout changed list cards from the historical cropped native image presentation to complete-image watermarked renditions. That combined two independent concerns: the list card's visual role and the watermark policy for detail and content media. It made the `Iv` mark part of list cover artwork, changed the list crop and hover behavior, and left legacy snapshots able to expose inconsistent cover URLs.

The public media contract already distinguishes the cover role and its display variants. The stable boundary is therefore the `cover/card` variant used by list cards, timeline cards, and related-post cards. The detail `cover` variant is a separate surface and must continue to use its responsive A/B watermark candidates.

## Decision

- Only `cover/card` skips the render ID, watermark, and A/B presentations.
- `cover/cover`, `cover/poster`, `cover/social`, `cover/full`, cover source descriptors, and the top-level compatibility `image` field retain their watermark paths and candidates.
- Body images, attachments, playback media, and lightbox renditions keep the existing watermark contract.
- Loading an old snapshot strips a watermark render segment only from `cover/card` paths. Other cover paths migrate v4 watermark identities to v5 without removing the watermark.
- List, timeline, and related cover components use the historical `object-cover` crop and image hover scale. The detail cover remains `object-contain` and uses the existing responsive watermarked image component.
- Existing watermark assets, watermark geometry, color selection, and body/attachment/playback contracts remain unchanged.

## Consequences

- New and legacy public list cards no longer place an `Iv` mark over cover artwork.
- Detail covers, feeds, structured metadata, source descriptors, and other non-list media continue to expose the established watermark behavior.
- The public-media facade and snapshot compatibility tests must assert both sides of the boundary: list card paths are unwatermarked, while detail cover and body paths retain their registered watermark candidates.
