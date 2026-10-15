---
status: accepted
---

# Encode Watermark Presentation in Public Rendition Paths

The selected watermark depends on the image's displayed width, which the media server cannot infer from the source resolution or existing usage variant. Keep the watermark inside the delivered image: the browser selects from a finite set of server-rendered A/B candidates, while feeds and initial HTML use deterministic usage defaults. Give each rendering policy a distinct pathname that includes its composition, contain policy, graphic fingerprint, and composite settings, so the static publication pipeline can package every reachable candidate without file collisions or immutable-cache ambiguity.

## Considered Options

- **Select A/B from the original pixel width or the existing `card` / `content` usage**: this cannot distinguish a high-resolution mobile thumbnail from a desktop or lightbox presentation of the same media.
- **Overlay a Logo in the browser**: this does not retain the watermark when the image file is saved or redistributed.
- **Use only `?watermark=a/b`**: the current packager retains query strings for requests but derives output filenames from pathname, so candidates would overwrite the same static file. Changing query handling is possible, but explicit rendering paths make the publication identity visible to both the packager and caches.
- **Generate a derivative for every measured CSS width**: this introduces an unbounded resource space and prevents complete static publication. Proportional Logo sizing allows a finite set of candidates; additional display-size profiles require a separate demonstrated need.

## Consequences

- The media descriptor and publication manifest must enumerate candidates that are reachable after measurement or lightbox opening, including those absent from initial HTML `src` attributes.
- Watermark SVG files need fingerprinted same-origin static paths as well as fingerprinted derivative identities; changing only a cached SVG or the snapshot query stamp is insufficient.
- Public list, timeline, related, detail-cover, content, and lightbox images use complete-image `contain` presentation; the image-only hover scale is removed from the affected media slots, so the watermark does not depend on a crop safe area.
- `wm-a-v1` uses the Iv mark at 7% of the final output width; `wm-b-v1` uses the Iv mark plus `ivanli.cc` at 18%. Both use a 2% right/bottom margin, white body with a thin dark outline, and 64% visible opacity. The B separator is white rather than dark, and the SVG fixes equal visible gaps on both sides of it. Imagor receives `alpha=36` because its alpha parameter is transparency.
- Final derived dimensions are measured after orientation correction and the registered resize/frame recipe. Images/GIFs use sharp metadata; public video candidates use the signed imagor `/meta` endpoint with the same fit-in and frame recipe. Width `<240`, height `<160`, or area `<80,000px²` skips the watermark.
- Existing media membership hashes and permission boundaries stay separate from presentation identity. Legacy paths remain compatible; new pages reference the new rendering identity without promising that old immutable URLs change immediately.
- Static artifact limits still apply. The additional files must be counted before deployment, and missing or excessive candidate sets fail publication rather than exposing original media.

The product decisions and implementation details are recorded in [按显示尺寸选择媒体水印](../public-media-watermark-design.md) and the public-media Spec. This ADR accepts the finite A/B identity and contain strategy; it does not authorize merging or either of the two later product releases.
