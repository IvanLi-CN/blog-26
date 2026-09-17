# ADR 0001: Project Detail MDX Authoring

- Status: accepted
- Date: 2026-09-17

## Context

Project metadata, posters, and external links are stable catalog data, while project narratives change at a different pace and need project-specific structure. Repeating generic detail cards makes pages feel templated and prevents future projects from using the evidence available in their own materials.

## Decision

Use Astro MDX files at `site/content/projects/<slug>.mdx` for long-form project detail content. The catalog remains the source for identity, summaries, tags, media, public entries, and related reading. MDX is continuous prose; headings are project-specific and are never converted into automatic cards.

The runtime exposes a small allowlist of static server-rendered React content blocks: `ProjectFigure`, `ProjectCallout`, `ProjectFacts`, and `ProjectComparison`. Arbitrary site-component imports are not part of the authoring contract. A new block requires the same need to appear in at least two projects.

Project pages render a sticky public-entry sidebar and, when the body has at least three H2/H3 headings, a generated H2/H3 table of contents. Projects without an MDX body use verified catalog material without generic filler sections.

## Consequences

- Project authors can add or reorganize narrative sections without changing the page template.
- Build-time slug validation prevents a body file from silently attaching to the wrong project.
- The catalog and body remain separate, so poster and social-preview pipelines are unaffected.
- New content blocks stay intentionally small and require evidence of reuse before expansion.
