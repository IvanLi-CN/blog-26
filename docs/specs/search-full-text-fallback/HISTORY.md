# Search syntax parsing and SQLite FTS5 fallback history

> Durable reasons for the current contract. Task logs belong in the engineering workflow, not here.

## Decision Trace

- 2026-08-04: Chose SQLite FTS5 with a `trigram` tokenizer for the personal blog and microblog scale instead of introducing an external search service.
- 2026-08-04: Chose SQLite triggers as the index maintenance boundary because post writes occur through routers, content sync, restore flows, and direct database scripts.
- 2026-08-04: Chose a lexer/parser and intermediate AST so advanced syntax detection does not depend on regex heuristics. Ordinary terms use explicit `AND`; `AND` binds more tightly than `OR`.
- 2026-08-04: Chose literal retry for malformed advanced syntax, preserving a useful search result without passing invalid raw `MATCH` input through.
- 2026-08-04: Chose FTS fallback for embedding failures, but preserve semantic base results when only reranking is unavailable.

## Key Reasons / Replacements

- The previous search fallback matched only selected fields with `LIKE`, did not share behavior with content lists, and could expose reranker outages as service-unavailable responses.
- The physical index includes private/draft rows so administrator list behavior remains compatible; public visibility is enforced by the caller query.

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
