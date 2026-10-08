---
title: Astro shared React MDX virtual modules
module: public-routing
problem_type: build-error
component: astro-vite
tags: [astro, react, mdx, vite, hydration]
status: active
related_specs: [public-csr-navigation]
---

# Astro shared React MDX virtual modules

## Context

SSR and CSR render the same React project page. Project content still comes from native MDX files, including relative imports of shared React blocks.

## Symptoms

Dev dependency scanning tries to open a generated module that does not exist on disk. A virtual MDX module can also be compiled a second time by Astro's MDX integration, or lose the physical importer needed to resolve relative imports.

## Root cause

A synthetic physical filename implies a real file to Vite. A virtual identifier ending in `.mdx` remains eligible for Astro's MDX compilation. Relative imports cannot be resolved against a virtual identifier alone.

## Resolution

Use a null-prefixed virtual module with a JavaScript suffix. The plugin loads the physical MDX source, strips frontmatter and compiles it into React. Imports from that virtual module resolve against its original physical path with `skipSelf`, and `addWatchFile` registers the physical MDX file for dev updates.

## Guardrails / Reuse notes

Validate both dev and production: a successful build alone does not prove dependency scanning or hot updates work. Test an MDX file that imports a shared component, then change and restore its content while the dev page is open. Restore the source before collecting evidence.

When migrating Astro HTML into a hydrating React renderer, keep scripts that mutate renderer-owned DOM behind hydration. Early theme and root viewport initialization can remain outside; Header measurements and custom scrollbars initialize through the shared page lifecycle after hydration. Verify actual browser hydration errors instead of suppressing warnings.

## References

- [Public CSR navigation](../../specs/public-csr-navigation/SPEC.md)
- [Astro configuration](../../../astro.config.mjs)
- [Public page behaviors](../../../site/lib/public-page-behaviors.ts)
