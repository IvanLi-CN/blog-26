# Search syntax parsing and SQLite FTS5 fallback history

> Durable reasons for the current contract. Task logs belong in the engineering workflow, not here.

## Decision Trace

- 2026-08-04 (`PR #61`): Chose SQLite FTS5 with a `trigram` tokenizer for the personal blog and microblog scale instead of introducing an external search service.
- 2026-08-04 (`PR #61`): Chose SQLite triggers as the index maintenance boundary because post writes occur through routers, content sync, restore flows, and direct database scripts.
- 2026-08-04 (`PR #61`): Chose a lexer/parser and intermediate AST so advanced syntax detection does not depend on regex heuristics. Ordinary terms use explicit `AND`; `AND` binds more tightly than `OR`.
- 2026-08-04 (`PR #61`): Chose literal retry for malformed advanced syntax, preserving a useful search result without passing invalid raw `MATCH` input through.
- 2026-08-04 (`PR #61`): Chose FTS fallback for embedding failures, but preserve semantic base results when only reranking is unavailable.
- 2026-08-04 (`9d660949`, `PR #61`): Kept public tRPC search permanently published-only and made MCP unpublished search/list scopes administrator-only so caller-controlled visibility flags cannot expose draft or private rows.
- 2026-08-04 (`84a0952`, `PR #61`): Bounded semantic vector candidates to 10,000 eligible rows, rechecked the parameter budget before invalid-query literal retry, and treated malformed rerank indexes as a recoverable semantic-base fallback.
- 2026-08-04 (`6a6f98e`, `PR #61`): Enforced the vector read bound, routed corrupt vectors to FTS, fingerprinted effective AI providers for cache keys, and recorded missing reranker configuration without changing the semantic-base fallback contract.

## Key Reasons / Replacements

- The previous search fallback matched only selected fields with `LIKE`, did not share behavior with content lists, and could expose reranker outages as service-unavailable responses.
- The physical index includes private/draft rows so administrator list behavior remains compatible; public visibility is enforced by the caller query.

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
