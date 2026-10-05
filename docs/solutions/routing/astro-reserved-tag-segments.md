---
title: Decode native tag URL segments exactly once
module: public-tag-routing
problem_type: routing
component: Astro tag detail and feed routes
tags: [Astro, SSR, URL encoding, tags]
status: current
related_specs: [project-tag-discovery]
---

# Decode native tag URL segments exactly once

## Context

Native tag names preserve spaces, plus signs, superscripts and literal percent escapes. The same routes render in static builds and the console SSR runtime, including a configured public base path.

## Symptoms

Static links such as `USB-C PD + PPS` work, while the corresponding SSR tag detail returns 404. Tag feed and breadcrumb matching can disagree even though the catalog spelling is correct.

## Root cause

Astro route parameters have already undergone partial URI decoding. Reserved characters such as an encoded plus can remain escaped, so treating a route parameter as a canonical tag name does not consistently match the directory. Decoding an already-decoded value again also corrupts literal percent sequences.

## Resolution

Read `Astro.url.pathname` or the endpoint request URL pathname instead of using a partially decoded parameter. Strip the exact configured tag root and optional feed suffix, decode each raw segment once with `decodeURIComponent`, then apply the shared NFC tag normalization. Reject malformed escape sequences as an unknown route. Build outgoing URLs by encoding canonical segments independently.

## Guardrails / Reuse notes

- Keep normalization separate from URL decoding: NFC preserves `I²C` and does not fold it into `I2C`.
- Cover a literal `%2B` separately from a plus sign; their URLs and canonical names differ.
- Verify both static and SSR output. Include the configured base path and feed suffix in regression checks.
- Reuse `readTagRoutePath` for tag routes rather than introducing another decoding layer.

## References

- [Route boundary](../../../src/lib/tag-href.ts)
- [Regression tests](../../../src/lib/__tests__/tag-href.test.ts)
- [Project tag discovery](../../specs/project-tag-discovery/SPEC.md)
