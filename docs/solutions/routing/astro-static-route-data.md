---
title: Publish structured route data from an explicit Astro JSON endpoint
module: public-csr-navigation
problem_type: routing
component: Astro static route data
tags: [Astro, CSR, static build, URL encoding]
status: current
related_specs: [public-csr-navigation]
---

# Publish structured route data from an explicit Astro JSON endpoint

## Context

A public static deployment can retain its initial HTML while subsequent browser navigation renders shared components from route-scoped JSON. The JSON must exist as a real generated asset for every content route, including native tag names with spaces and encoded reserved characters.

## Symptoms

The build succeeds but JSON routes are absent, generated as directory index files, or reject a native tag spelling that works in its HTML route.

## Root cause

Astro ignores source page directories prefixed with an underscore. A generic catch-all endpoint also does not establish the same extension behavior as an explicit `.json` endpoint under a trailing-slash policy. Static route params undergo partial URI decoding, so treating them as the original public path can decode reserved characters twice or fail the static props lookup.

## Resolution

Use a root `site/pages/[...route].json.ts` endpoint and restrict its enumerated params to `_content/routes/…`. Supply the original encoded public path separately in `getStaticPaths()` props; use params only for Astro's generated route identity. Keep server and static endpoint loaders shared, and return data rather than pre-rendered target HTML.

## Guardrails / Reuse notes

- Verify emitted filenames and HTTP responses after the build; a successful build alone does not prove that endpoints were generated.
- Preserve the original public path in props instead of reconstructing it from partially decoded params.
- Check native spaces, plus signs, literal percent escapes, and feed URLs. Feed and asset URLs retain browser-native behavior.
- Serialize only the current page's records; embedding all detail bodies in the first page would bypass later request and offline semantics.

## References

- [Static route data](../../../site/lib/static-route-data.ts)
- [Endpoint](../../../site/pages/[...route].json.ts)
- [Native tag decoding](./astro-reserved-tag-segments.md)
- [Public CSR contract](../../specs/public-csr-navigation/SPEC.md)
