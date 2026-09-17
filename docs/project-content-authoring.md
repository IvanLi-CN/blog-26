# Project Content Authoring

## Purpose

Project details explain the engineering substance of a public project. They help a reader understand what the project is for, the constraints that shaped it, and the implementation choices that make it distinctive.

Every project detail must be written from the project's available evidence. The site shares a reading system, not a mandatory article outline.

## Content Boundaries

The project catalog in `site/lib/projects.ts` owns project identity and discovery metadata:

- title, slug, and domain;
- card summary and Hero summary;
- poster, social preview, technology tags, public entries, related posts, and ordering.

The project body lives at `site/content/projects/<slug>.mdx`. It owns the project-specific narrative and does not repeat catalog metadata in frontmatter. A missing MDX file is valid: the detail page must show only the verified catalog information, available media, public entries, and related reading.

Project-specific body assets live beside the body at `site/content/projects/<slug>/assets/`. They are separate from the theme-aware project poster and social-preview pipelines.

## Evidence Before Copy

Collect and verify project material before writing. Do not turn an unverified README claim, a mock screen, or an aspirational issue into a shipped capability.

- Read the project's source, README, public documentation, and release material when available.
- Verify external entries resolve to the intended public destination.
- Identify the problem boundary, intended user or operator, and the project's actual operating environment.
- Record implementation facts that explain the result: architecture, primary data flow, hardware constraints, failure handling, storage, deployment, or integration boundaries.
- Select only screenshots, diagrams, and photos that reveal the project itself. Decorative or purely atmospheric media does not replace engineering evidence.

When material is insufficient, keep the project in the catalog-only fallback. Do not use generic prose to make an incomplete project detail appear complete.

## Choose the Narrative From the Project

Choose the smallest set of sections that lets the evidence answer the reader's natural questions. Section names and order are project-specific.

| Project character | Useful questions |
| --- | --- |
| Developer or infrastructure tool | What operational problem exists? Where is the system boundary? How are requests, evidence, failures, or state handled? |
| Web product | Who uses it? What is the critical workflow? Which product and technical constraints shape that workflow? |
| Hardware product | What physical or electrical constraints matter? How do hardware, firmware, and operator interaction connect? What changed through iteration? |
| Device control or local service | What capabilities become controllable? What is the control-plane contract? How are device state, safety, and recovery exposed? |
| Operations tool | What recurring maintenance task is reduced? What configuration, deployment, or failure boundaries are made explicit? |

These questions are prompts, not required headings. A short utility might need only a problem statement and a design decision. A hardware project may need a system diagram and an iteration narrative. A mature service may need an architecture explanation, operational constraints, and links to deeper documentation.

## Writing Rules

- Lead with a precise statement of the project and its problem, rather than a generic claim that it is useful or complete.
- Explain causality: a constraint, decision, or implementation detail should connect to a resulting behavior or trade-off.
- Prefer concrete nouns, interfaces, flows, and boundaries over promotional adjectives.
- Keep a claim proportional to its evidence. Distinguish a shipped capability, an available demonstration, a prototype, and future work.
- Do not restate the Hero summary, technology tags, or public entries in the body unless they are necessary to explain a technical decision.
- Use headings to organize a reader's questions, not to fill a predetermined number of cards.
- When a section benefits from visual separation, the MDX author may wrap that section in a semantic `<section className="project-mdx-section">`; this is optional and project-specific, not a shared chapter template.
- Start the MDX body at `##`; the detail Hero already supplies the page's `h1`.

## MDX and Content Blocks

Standard MDX handles prose, headings, lists, block quotes, links, code, tables, and local asset imports. Project MDX may use only the reviewed project content blocks and standard Markdown:

- `ProjectFigure` for a project image, meaningful alternative text, and an optional caption.
- `ProjectCallout` for a constraint, decision, limitation, or key conclusion.
- `ProjectFacts` for compact factual details that do not warrant a narrative section.
- `ProjectComparison` for alternatives and the trade-offs between them.

Do not import arbitrary site components. Add a new project content block only after at least two projects need the same semantic presentation; otherwise, use standard Markdown or a project-local asset.

The site build validates component imports: only named imports of the four reviewed blocks from the project content-block module are accepted.

## Catalog Copy and Public Entries

`summary` is a concise, project-specific statement of purpose. It has a one-line visual budget on the project wall, where overflow is truncated but the full text remains available through hover and keyboard focus. Prefer roughly 30 to 44 Chinese characters when the project name is not included.

The Hero summary may be longer and is the canonical description for search metadata and structured data. It should complement, not duplicate, the MDX body.

Record public destinations by meaning, not display order:

- formal project site;
- demo;
- official documentation;
- documentation site;
- source repository.

Project index cards derive at most three quick entries: formal site before demo, official documentation before documentation site, and the source repository. Project details show every available entry in that semantic order.

## Migration Workflow

1. Gather evidence and decide whether the project has enough material for an MDX body.
2. Update catalog metadata and public entries so the project wall remains accurate independently of body status.
3. Choose an evidence-led narrative and write the MDX body without borrowing another project's outline.
4. Add only body assets that improve technical understanding; provide useful alternative text and captions where context matters.
5. Build and review the static detail page at desktop and narrow mobile widths in light and dark themes.
6. Keep the catalog-only fallback when evidence is incomplete, then revisit the project when verified material becomes available.

Codex Vibe Monitor is the first complete migration and establishes the quality bar, not a template for other project details.

## Review Checklist

- Every public capability and technical claim is supported by project material.
- The body answers questions specific to this project and contains no generic filler.
- There is no repeated Hero copy, duplicate public-entry block, or mandatory section added only for visual symmetry.
- Links point to the intended destination and appear only when that destination exists.
- The project wall remains scannable: title, quick entries, and one-line summary do not collide at supported widths.
- The MDX document has a sensible heading hierarchy; side navigation appears only when it has at least three total H2/H3 headings, listing H2 entries and nesting H3 entries.
- Images reveal the project, have meaningful alternative text, and fit without horizontal overflow.
- The detail page remains readable without JavaScript beyond enhancements such as active in-page navigation state.
