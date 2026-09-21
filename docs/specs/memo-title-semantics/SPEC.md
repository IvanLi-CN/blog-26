# Memo Title Semantics

## Context and Scope

- Context: Public flash memos may have no human-authored title, while older synchronized rows may contain filename-derived title values.
- In scope: memo title resolution from frontmatter and Markdown headings, legacy public-title normalization, nullable public title projection, titleless memo presentation contracts, and protocol metadata fallbacks.
- Out of scope: changing post or project title contracts, bulk rewriting source files, changing admin CRUD semantics, or altering memo content, dates, tags, and detail routes.

## Terms and Interfaces

- Flash memo: content whose type is memo.
- Usable frontmatter title: a string-valued title field whose trimmed value is non-empty.
- First non-empty line: the first body line containing non-whitespace content; preceding blank lines do not count.
- Public memo title: nullable visitor-facing title in the public snapshot model.
- Interface: posts.title remains non-null in storage; the empty string represents no internal memo title, and public memo snapshots expose string or null.

## Requirements

### REQ-MTS-001

- The system MUST resolve a memo title in this order: non-empty frontmatter title; an ATX H1, H2, or H3 on the first non-empty body line; the first ATX H1 elsewhere in the body; otherwise no title.
- Inputs: parsed frontmatter and Markdown body, including leading blank lines.
- Outputs: a trimmed title or an absent title. Arbitrary prose and ATX H4-or-deeper headings MUST NOT become titles.

### REQ-MTS-002

- The system MUST represent an absent internal memo title as an empty storage string and expose it as null in public memo records.
- Public title resolution MUST NOT fall back to a slug, filename, random identifier, or body prose.

### REQ-MTS-003

- A legacy local memo title MUST be re-evaluated from its source only when the stored title exactly matches the title derived from that memo's filename.
- If the source is available, the public title MUST use the current source-resolution rules, including null when no title is available.
- If the source cannot be read or parsed, the system MUST preserve the stored value and emit a warning; it MUST NOT guess a replacement.

### REQ-MTS-004

- Titleless memos MUST remain available in lists, timelines, tags, search, detail routes, project associations, and feeds.
- Public visual titles MUST be omitted when the public title is null. Date, type, tags, excerpt or body, and detail navigation MUST remain available.
- Protocol metadata that requires a title MUST use the stable fallback “无标题闪念 · YYYY年M月D日”. This fallback MUST NOT become a visible card or detail heading.

### REQ-MTS-005

- Memo title behavior MUST NOT change post, project, slug generation, or admin CRUD contracts.
- Source Markdown and unrelated frontmatter fields MUST remain unchanged by title resolution.

## Verification

### VER-MTS-001

- Method: memo title resolver unit tests.
- covers: REQ-MTS-001
- Pass condition: frontmatter precedence, first non-empty H1/H2/H3, first H1 fallback, blank lines, prose, and H4-or-deeper cases match the contract.

### VER-MTS-002

- Method: public snapshot compatibility tests.
- covers: REQ-MTS-002 and REQ-MTS-003
- Pass condition: exact generated filename titles are source-resolved, absent titles become null, inaccessible-source values are preserved, and no slug fallback is emitted.

### VER-MTS-003

- Method: local public list and detail rendering checks.
- covers: REQ-MTS-004
- Pass condition: titleless memos retain their date, type, tags, excerpt or full body, detail route, and protocol-only metadata fallback.

### VER-MTS-004

- Method: feed, public API, and admin compatibility tests.
- covers: REQ-MTS-004 and REQ-MTS-005
- Pass condition: metadata fallbacks stay out of visible titles, public memo contracts remain nullable, and post/project/admin CRUD contracts remain unchanged.

## Related ADRs

None

## Visual Evidence

- None

## References

- ../nature-front-ui/SPEC.md
- ./IMPLEMENTATION.md
- ./HISTORY.md
