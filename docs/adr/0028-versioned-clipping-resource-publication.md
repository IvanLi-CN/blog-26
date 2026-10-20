---
status: accepted
---

# Versioned Clipping Resource Publication

## Context

Clipping extraction previously kept image and other media URLs from the source page. Those URLs can expire, require a hotlinking `Referer`, or disappear when the source changes, so a completed clipping could lose part of its reading surface. The clipping store already owns versioned source Markdown outside the public content root, while the public-media packager only understands ordinary Post/Memo media.

## Decision

- Capture article media while processing the clipping. Cover `img`, `picture`/`source`, `video`, and `audio`, including every safe `srcset` candidate and media poster. Resource requests use the existing public-destination and redirect validation, bounded response sizes, the article URL as `Referer`, and no source cookies or credentials. The limits are 64 resources per version, 20 MiB per resource, and 128 MiB in total.
- Store successful resources below the clipping version as content-addressed `assets/<sha256>.<extension>` files and record their metadata in the version manifest. Source and translation Markdown use local `./assets/...` references. A failed resource is recorded for diagnostics, removed from the Markdown, and represented by a text placeholder plus an aggregate warning; the original external URL is never retained as a fallback.
- Expose resources through the clipping-specific versioned route `/api/public/memos/:slug/clipping/assets/:versionId/:filename`. The route enforces the existing Memo visibility boundary, requires the requested version to be the current reading version, validates the content-addressed filename, and serves only a captured resource listed in that version manifest. It is separate from `/api/files` and the generic Post/Memo media facade.
- Include a version-scoped resource base URL in live and public clipping projections. The static public-media package recognizes those URLs, copies the required local files into the published artifact, and fails publication when a required clipping file is missing or exceeds the package limit. It never rewrites a failed or unavailable clipping resource back to its original URL.
- Keep old clipping versions and their captured assets under the existing retention policy. Versions created before resource capture are readable with an external-resource warning and require reprocessing before their media can be published.

## Consequences

Completed clippings remain readable when source media expires or rejects hotlinking, and public static releases contain the same local resources as the live console. Processing consumes additional bounded disk, network, and CPU budget, and resource files must be included in clipping backups and retention cleanup. A missing required asset blocks static publication instead of producing a partially broken release.

## Rejected alternatives

- Reusing `/api/files` would expose a general file route without clipping-version visibility and current-version checks.
- Keeping external URLs would preserve a cheap capture path but would leave completed reading materials dependent on third-party availability and hotlink policy.
- Attaching clipping resources to the generic Post/Memo media facade would blur ownership and make version fallback and static publication incomplete.
