---
status: accepted
---

# Use a Self-Contained SSR Console Beside the Static Public Site

`ivanli.cc` remains the EdgeOne-hosted static public site generated from a published snapshot. `console.ivanli.cc` becomes one self-contained application that owns the visitor frontend, administrator frontend, server-rendered pages, authentication, content APIs, and persistence access; it does not introduce a gateway deployment layer. Every console HTML route is server-rendered on first request and participates in Astro `ClientRouter` page exchange afterward. The console reads live domain sources, including the database-backed Memo views, while project pages continue to use their MDX and catalog sources on the server. Unauthenticated console visitors receive the live public view, administrators receive the Memo authoring area and one management list containing public and unpublished entries, and console HTML is excluded from search indexing and shared caching.

## Considered Options

- **Gateway in front of separate static and SSR services**: rejected because it adds a deployment boundary the console does not need and makes host, cache, and authentication behavior harder to reason about.
- **Full browser SPA**: rejected because the first request would lose server-rendered authorization and content, and it would widen the client migration beyond the current Astro navigation model.

## Consequences

- The repository must produce a static public target and an SSR console target from shared page and component code.
- The public static site must call console-owned runtime APIs directly, with explicit cross-origin cookie, CORS, and media URL contracts.
- EdgeOne may use `console.ivanli.cc` as the public site's direct API origin and frontend fallback origin. Requests arriving with the public `ivanli.cc` host must force the public rendering mode, while requests arriving with `console.ivanli.cc` use the authenticated console mode.
- Authentication cookies must remain host-scoped to `console.ivanli.cc`; the public fallback must never forward administrator identity or render private content.
- Console HTML must use private, non-shared caching; static assets may remain cacheable.
- The console public Memo view may be newer than the published public Memo timeline on `ivanli.cc`.
- ADR 0009 remains the page-composition decision for the Memo authoring area, but its shared public-route and second-timeline assumptions are superseded here.
