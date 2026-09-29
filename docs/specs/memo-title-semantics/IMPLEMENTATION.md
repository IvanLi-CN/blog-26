# Memo Title Semantics Implementation

> The current normative contract is in ./SPEC.md. This file records implementation coverage, verification, rollout facts, and remaining gaps.

## Current Status

- Implementation: implemented
- Lifecycle: active
- Catalog note: Nullable public titles with preserved titleless memo content and routes.

## Implementation Coverage

- REQ-MTS-001: src/lib/content-sources/utils.ts resolves titles from frontmatter and permitted ATX headings.
- REQ-MTS-002 and REQ-MTS-003: src/public-site/snapshot.ts normalizes exact legacy filename-derived titles at the public read boundary. The public snapshot, search results, Memo list API, and Memo detail API resolve local source headings consistently; absent titles remain null, and inaccessible sources conservatively retain their stored value.
- The inline admin list keeps the successful create response authoritative when an immediate refresh returns stale data for the same Memo; this preserves the saved nullable title and does not introduce a slug fallback.
- REQ-MTS-004: site/components/TimelineCard.astro, site/components/MemoCard.astro, site/pages/memos/[slug].astro, site/pages/tags/[...tagSegments].astro, site/pages/projects/[slug].astro, src/components/search/SearchResultsList.tsx, src/server/public-api/router.ts, and site/lib/feeds.ts preserve titleless memo content and routes.
- REQ-MTS-005: post, project, slug, and admin CRUD paths retain their existing contracts. A titleless Memo PATCH sends an empty title to preserve the existing empty storage value.

## Coverage / rollout summary

- Focused Bun tests cover title parsing, local sync, public snapshot compatibility, HTTP contracts, feeds, and search. `src/server/http-compat-api.test.ts` verifies legacy source-derived titles and titleless values across search, snapshot, list, and detail reads, plus that PATCH keeps a titleless Memo's storage title empty.
- The local read-only preview uses a temporary SQLite database, a read-only Notes mirror, and a temporary public snapshot.
- One malformed source memo was corrected by owner request; the production source was not bulk rewritten, the production database was not modified, and the static site was not rebuilt or restarted.

## Remaining Gaps

- Non-empty frontmatter title strings remain authoritative by contract; malformed values in other source records require targeted source correction or a separately approved contract change.
- A production static-site rebuild/publication is separate from updating a source file.

## Related Changes

- None

## References

- ./SPEC.md
- ./HISTORY.md
