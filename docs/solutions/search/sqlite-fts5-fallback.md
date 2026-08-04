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
9. Enforce bounded normalized query length, lexer tokens, AST depth, and compiled SQL parameter cost before FTS/`LIKE` compilation. Public schemas reject over-budget input with `400 BAD_REQUEST`; internal plans never fall through to literal retry.
10. Run database-sensitive Bun tests with `bun test --isolate`; keep each suite's temporary `DB_PATH` independent so module-level database state cannot race across test files.
11. Pin public tRPC search to the published-only scope and require administrator authentication before MCP callers can request unpublished search or list results.
12. Bound semantic vector candidates to 10,000 rows after applying model, requested type, and public visibility conditions; use uncached FTS when the eligible scope is empty or exceeds that bound.
13. Recheck the compiled parameter budget before retrying invalid advanced syntax as literals, and validate rerank indexes as integers that are in range, unique, and complete before accepting enhanced output.

# Guardrails / Reuse notes

- Do not concatenate user input into SQL, FTS `MATCH`, column names, or `LIKE` patterns. Bind values and resolve columns only through the parser allowlist.
- Keep the physical index inclusive of drafts and private rows; enforce public visibility in the caller query.
- Do not rebuild on application startup. Use `bun scripts/db-tools.ts search-index check` for read-only diagnostics and `... rebuild` for explicit repair.
- Do not put FTS fallback results into the semantic/enhanced AI cache. A cache hit must never hide newly indexed content after a provider outage.
- Keep search suggestion candidate validation on the shared FTS path; do not reintroduce embedding or reranking as a validation dependency.
- Keep parser resource limits at the shared query boundary so every public, list, MCP, and AI caller receives the same bounded behavior.
- Keep test runners isolated when suites mutate process-level database configuration; this is part of the search fallback test contract, not an optional local workaround.
- Never trust a caller-provided visibility flag at a public boundary; public tRPC search forces `draft=false AND public=true`, and MCP unpublished scopes require an administrator session.
- Keep public list procedures bounded to `draft=false AND public=true` even when compatibility inputs contain `published=false`; caller flags must not expand visibility.
- Never scan an unbounded vector candidate set or accept partially/incorrectly indexed rerank output; use the bounded FTS or semantic-base fallback instead.
- Keep the public search response as the existing array and do not expose internal mode/source metadata.
- Add parser tests for all three modes, precedence, quoted operators, invalid syntax, column filters, prefixes, `NEAR`, and short Unicode terms. Add SQLite tests for triggers and type transitions.

# References

- `docs/specs/search-full-text-fallback/SPEC.md`
- `src/lib/search/query.ts`
- `src/lib/search/content-search.ts`
- `src/lib/ai/search.ts`
- `src/server/services/search-suggestions.ts`
- `package.json`
- `scripts/run-precommit-tests.ts`
- `scripts/db-tools.ts`
- [SQLite FTS5 documentation](https://www.sqlite.org/fts5.html)
