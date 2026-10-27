---
status: accepted
---

# Separate Project List and Detail Summaries

## Context

Project cards and project detail Heroes serve different reading tasks. The card needs a short statement that supports scanning across the project index, while the detail Hero needs a project-specific framing that can be maintained with the corresponding MDX narrative. Reusing one catalog description for both surfaces makes the two pages drift together and prevents a detail page from owning its own framing.

## Decision

- `ProjectCatalogItem.summary` remains the source for project-list cards and other compact project references.
- A project MDX file may declare a `detailSummary` frontmatter field. When present, the detail page uses it for the Hero and for project detail metadata.
- The catalog `heroSummary` and `description` fields remain compatibility fallbacks for catalog-only projects and existing MDX bodies that do not declare `detailSummary`.
- The MDX body remains continuous project-specific prose. The Hero summary is not automatically extracted from the first body paragraph, so the page does not repeat its opening prose by construction.

## Consequences

Project authors can change the project-list positioning and the detail-page framing independently. The `slug` field remains the only required identity field in project frontmatter, while `detailSummary` is an optional presentation field with an explicit detail-page role. Existing catalog-only pages retain their verified fallback content until their MDX body supplies a detail summary.

This decision supersedes the summary-source portion of [ADR 0001: Project Detail MDX Authoring](./0001-project-detail-mdx-authoring.md); its catalog/body separation, content-block allowlist, and rendering decisions remain applicable.
