---
status: accepted
---

# Share the Public Renderer Between the First Document and Client Navigation

Public pages use shared React components for their first document and subsequent browser navigation. Console and Web Demo render the first document on the server, while the existing public static deployment prerenders it; hydration consumes only that route's data. Subsequent navigation renders the destination from structured route data, using the console-owned API for server runtimes and published route JSON for the static deployment. This replaces the Astro HTML-exchange navigation decision in ADR 0010; its authorization, host isolation, first-document, cache and deployment decisions remain accepted.

The Web Demo changes only the data source and common request policy. Its offline and delay controls apply to destination API reads without blocking routing, removing received first-document content, or introducing Demo-specific page states. About and unknown-route content remain local. The shared router owns loading, failure, retry, cancellation and history, and every data-bearing route entry performs a fresh read.

## Consequences

- Page markup, styling and interaction behavior must have one shared implementation; Astro route files provide server bootstrap and static enumeration.
- Project MDX uses the same React body modules on the server and in the browser, loaded by route. Catalog and list bootstrap contain visible summaries rather than unvisited article bodies.
- Server data modules must not enter the browser dependency graph. The client imports DTO types and pure URL helpers; it never reads the database or filesystem.
- Keeping HTML exchange would preserve the previous composition model but would not make destination data failures observable through the shared API boundary. A browser-only first document would lose server-rendered content and authorization. Neither satisfies this contract.
