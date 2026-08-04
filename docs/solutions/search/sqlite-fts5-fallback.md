---
title: "SQLite FTS5 fallback with controlled search syntax"
module: "search"
problem_type: "search-fallback"
component: "sqlite-fts5, query-parser, ai-search, content-lists"
tags:
  - search
  - sqlite
  - fts5
  - parser
  - fallback
status: "active"
related_specs:
  - "docs/specs/search-full-text-fallback/SPEC.md"
symptoms:
  - "AI search becomes unavailable when embeddings or reranking providers fail."
  - "Whitespace queries accidentally behave like OR or depend on raw FTS syntax."
  - "Post and memo list filters disagree about which fields are searchable."
root_cause: "Search callers mixed vector ranking, raw LIKE predicates, and provider availability without a shared syntax and execution boundary."
resolution_type: "controlled-ast-with-sqlite-fallback"
---

# Context

This project is a personal blog and microblog backed by SQLite. Search must stay useful without an external search service, while public and administrator callers retain their existing visibility, pagination, and ordering contracts.

# Symptoms

- Embedding configuration or a failed embedding request can make the dedicated search path unavailable.
- Rerank failures can turn a valid semantic result into a service error.
- A regular multi-word query is easy to misclassify when advanced syntax is detected with regular expressions.
- Separate title-only or body-only `LIKE` filters cause list endpoints to drift from dedicated search.

# Root cause

The old implementation had no intermediate query representation. It passed some user text to vector search, used several ad hoc `LIKE` expressions for lists, and cached results without distinguishing semantic output from fallback output. SQLite FTS5 also rejects malformed native expressions, so raw user input cannot be used as a safe parser.

# Resolution

1. Maintain `posts_search_fts` as an FTS5 `trigram` virtual table with `post_id` and `type` unindexed, and `slug`, `title`, `excerpt`, `body`, and `tags` indexed. Backfill it in the migration and use SQLite triggers for insert, update, delete, and type transitions.
2. Lex and parse queries into `SearchQueryAst`, then classify them as `simple`, `advanced-valid`, or `advanced-invalid`. Ordinary whitespace terms become explicit `AND`; `AND` and binary `NOT` bind tighter than `OR`; parentheses are preserved.
3. Render only allowlisted columns and quoted values into FTS5. Long leaves use FTS5; leaves shorter than three Unicode code points use bound, escaped, field-aware `LIKE` while preserving the AST boolean structure. A short-leaf query still references the FTS table so a missing migration fails instead of silently becoming a system-wide `LIKE` fallback.
4. Treat malformed advanced syntax as a literal retry: collect literal terms, join them with `AND`, and never pass the original raw expression to SQLite.
5. Use BM25 weights `slug=1`, `title=8`, `excerpt=4`, `body=1`, and `tags=4`, then normalize the existing `SearchResult.final` field with stable publication-time/id tie-breaking. Short-text scoring uses the same relative field weights.
6. When vectors are unavailable or embedding fails, execute the shared FTS path and do not cache it. When reranking is missing, fails, or returns unusable output, return the semantic base result and log the diagnostic instead of returning a 503.
7. Reuse the compiled predicate in dedicated search, public posts/memos, administrator posts/memos, and MCP list filters. Keep visibility and list-specific ordering/pagination outside the shared predicate.
8. Validate generated search suggestion candidates through the shared FTS/content-search path directly. Suggestion validation must not depend on embedding availability or reranking.

# Guardrails / Reuse notes

- Do not concatenate user input into SQL, FTS `MATCH`, column names, or `LIKE` patterns. Bind values and resolve columns only through the parser allowlist.
- Keep the physical index inclusive of drafts and private rows; enforce public visibility in the caller query.
- Do not rebuild on application startup. Use `bun scripts/db-tools.ts search-index check` for read-only diagnostics and `... rebuild` for explicit repair.
- Do not put FTS fallback results into the semantic/enhanced AI cache. A cache hit must never hide newly indexed content after a provider outage.
- Keep search suggestion candidate validation on the shared FTS path; do not reintroduce embedding or reranking as a validation dependency.
- Keep the public search response as the existing array and do not expose internal mode/source metadata.
- Add parser tests for all three modes, precedence, quoted operators, invalid syntax, column filters, prefixes, `NEAR`, and short Unicode terms. Add SQLite tests for triggers and type transitions.

# References

- `docs/specs/search-full-text-fallback/SPEC.md`
- `src/lib/search/query.ts`
- `src/lib/search/content-search.ts`
- `src/lib/ai/search.ts`
- `src/server/services/search-suggestions.ts`
- `scripts/db-tools.ts`
- [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html)
