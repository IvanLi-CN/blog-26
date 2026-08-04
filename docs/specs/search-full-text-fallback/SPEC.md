# Search syntax parsing and SQLite FTS5 fallback

> The normative contract lives here. Implementation coverage is recorded in `./IMPLEMENTATION.md`; durable decision rationale is recorded in `./HISTORY.md`.

## Background / Problem Statement

The blog currently relies on embeddings and an optional reranker for the dedicated search route, while list endpoints use several inconsistent `LIKE` predicates. When an embedding provider or search model is unavailable, search can become unavailable instead of remaining useful. The existing implementation also has no reliable way to distinguish literal multi-word queries from advanced search syntax.

This topic defines one SQLite-backed search contract for public posts, memos, and administrator lists. It keeps the public response shape stable while making syntax parsing, full-text indexing, fallback behavior, and operational repair durable project behavior.

## Goals / Non-goals

### Goals

- Maintain a SQLite FTS5 `trigram` index for `post` and `memo` rows across `slug`, `title`, `excerpt`, `body`, and `tags`.
- Parse queries into a controlled intermediate AST and classify them as `simple`, `advanced-valid`, or `advanced-invalid`.
- Make ordinary whitespace-separated terms explicit `AND`; give `NOT`/`AND` higher precedence than `OR`, with parentheses overriding precedence.
- Fall back from embedding/vector search to uncached FTS/short-text search when the embedding path is unavailable.
- Keep semantic results when reranking is unavailable, rather than turning an otherwise usable search into a 503.
- Reuse one search implementation across dedicated search and content list filters without changing permissions, pagination, sorting, or response envelopes.

### Non-goals

- Introducing an external search service or changing the public search response into an envelope.
- Passing arbitrary native FTS5 or SQL syntax through to SQLite.
- Rebuilding the index implicitly during application startup.
- Redesigning search suggestions or the visible search UI.

## Scope

### In scope

- SQLite migration, backfill, and insert/update/delete triggers for all `post` and `memo` rows, including private and draft rows needed by administrators.
- Public visibility filtering at query time: `draft=false AND public=true`.
- Controlled syntax: boolean `AND`/`OR`/binary `NOT`, parentheses, quoted phrases, suffix prefix `*`, single-column filters, and `NEAR` with a bounded distance.
- FTS5 BM25 ranking for dedicated search and stable `publishDate DESC, id DESC` tie-breaking.
- Short literal leaves routed through escaped, field-aware `LIKE` when the trigram tokenizer cannot represent them.
- Search index consistency and rebuild commands in `scripts/db-tools.ts`.

### Out of scope

- FTS5 column sets, initial-token syntax, arbitrary raw `MATCH` expressions, or future SQLite grammar extensions not explicitly added to the controlled parser.
- Changes to non-search content permissions or list ordering.

## Requirements

### MUST

- The virtual table must be named `posts_search_fts` and contain `post_id UNINDEXED`, `type UNINDEXED`, `slug`, `title`, `excerpt`, `body`, and `tags`, using the `trigram` tokenizer.
- The physical index must contain every row whose `type` is `post` or `memo`; caller-specific visibility and type filters must be applied outside the index.
- The migration must backfill the index and create triggers for inserts, updates, deletes, and type changes. A migration failure must fail the migration command.
- User input must be lexed and parsed before it reaches FTS5. Values and `LIKE` patterns must be bound parameters; column identifiers must come from an allowlist.
- Search input must enforce bounded Unicode length, lexer token count, AST depth, and compiled SQL parameter cost before FTS/`LIKE` compilation; over-budget public requests must return a controlled `400 BAD_REQUEST` and must not enter literal retry.
- A `simple` query must produce an AST whose literal leaves are joined with `AND`.
- A valid advanced query must preserve its AST, with `NOT`/`AND` evaluated before `OR` and parentheses taking precedence.
- Operators inside quotes must remain literal text. Malformed or unsupported advanced syntax must be classified as `advanced-invalid` and retried as literal terms joined by `AND`.
- FTS results must not enter the existing AI search cache. Successful semantic/enhanced results may continue to use that cache.
- Public `/search` must continue returning a JSON array with the existing result item fields; no mode/source field may be added.
- Public tRPC search must always use `draft=false AND public=true`; MCP callers may request unpublished rows only when the MCP session is administrator-authenticated.
- Public list contexts must enforce `draft=false AND public=true` regardless of compatibility input flags; `memos.list` is admin-aware and retains its existing draft/private scope for administrator contexts.
- Semantic vector reads must be bounded by the eligible candidate limit, and malformed or dimension-mismatched stored vectors must select uncached FTS instead of failing the request.

### SHOULD

- FTS ranking should use BM25 weights `slug=1`, `title=8`, `excerpt=4`, `body=1`, and `tags=4`.
- FTS and literal fallback snippets should reuse the existing Markdown-aware snippet builder.
- `db-tools search-index check` should detect missing, extra, duplicate, or stale indexed rows; `rebuild` should be explicit and writable.

### COULD

- Add internal diagnostics for the selected query mode and search source without exposing them in public responses.

## Functional / Behavior Spec

### Query classification and compilation

The parser returns a plan containing the classification, AST, searchable literal leaves, and an executable predicate. The grammar is case-insensitive for operators:

- `simple`: no structural syntax; every parsed literal is an `AND` operand.
- `advanced-valid`: at least one supported advanced construct parses completely.
- `advanced-invalid`: a structural marker, reserved operator position, unknown column, malformed quote, malformed parenthesis, malformed `NEAR`, or unsupported native construct prevents a complete parse.

Supported constructs are `AND`, `OR`, binary `NOT`, parentheses, quoted phrases, `term*`/`"phrase"*`, `slug:`, `title:`, `excerpt:`, `body:`, `tags:`, and `NEAR(atom..., distance)`. `NEAR` operands must be FTS-capable terms or phrases and its distance must be a non-negative bounded integer.

Long searchable leaves use FTS5 `MATCH`; leaves shorter than three Unicode code points use escaped field-aware `LIKE`, preserving the surrounding Boolean AST. A literal retry treats syntax punctuation and invalid operator markers as ordinary text and joins the extracted literals with `AND`.

The parser also applies fixed resource budgets for normalized query length, lexer tokens, AST depth, and bound SQL parameters. A query that exceeds any budget is rejected before compilation; public tRPC/API callers receive `400 BAD_REQUEST`, while internal execution returns an empty constrained predicate rather than retrying the oversized input literally. Invalid advanced syntax must re-check the same AST/SQL parameter budget before literal retry.

### Index lifecycle

The migration creates and backfills `posts_search_fts`, then installs triggers. An update trigger removes the old row and inserts the new eligible row so visibility/type transitions cannot leave stale index entries. Application startup does not rebuild the index. Operators use the explicit check/rebuild commands when repairing a database.

### Search and fallback flows

- Dedicated search uses the shared search service, BM25 relevance, and stable publication-time/id tie-breaking.
- Public list search uses the shared predicate only; existing list ordering, pagination, cursor behavior, and public filters remain authoritative.
- Administrator list search uses the same compiled search plan while preserving draft/private access and existing sort controls; the admin-aware `memos.list` keeps its existing visibility branch.
- Missing embedding configuration, missing model vectors, or embedding request failure selects the FTS path and skips reranking.
- Any non-`simple` query mode selects the controlled FTS compiler because embeddings cannot preserve advanced syntax semantics.
- Missing or failing rerank configuration/request returns the semantic base result and does not surface a reranker 503.
- Semantic candidate scans are restricted to eligible rows matching the requested type, model, and visibility scope and are bounded at 10,000 rows; no eligible rows or an over-limit scan selects uncached FTS.
- Semantic/enhanced cache keys include a non-secret fingerprint of the effective provider configuration so model, endpoint, or credential changes cannot reuse stale results.
- Rerank responses must contain the expected count of unique integer indexes within the candidate range; malformed responses return the semantic base result and are logged without a 503.
- Search suggestion generation remains unchanged; candidate validation calls the shared FTS path directly.
- Public search procedures cannot override the published-only visibility boundary; MCP requests for unpublished search/list results require administrator authentication.

## Interfaces & Contracts

### Interface Inventory

| Interface | Kind | Scope | Change | Contract | Owner | Consumers | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SearchQueryPlan` / `SearchQueryAst` | Type | internal | New | This document | search service | AI search and content lists | Classifies and compiles user queries. |
| `posts_search_fts` | SQLite virtual table | internal | New | This document | database migration | Search service and db tools | FTS5 trigram index with trigger maintenance. |
| `bun scripts/db-tools.ts search-index check` | CLI | operator | New | This document | database tooling | Operators/CI | Read-only consistency check. |
| `bun scripts/db-tools.ts search-index rebuild` | CLI | operator | New | This document | database tooling | Operators | Explicit writable rebuild. |
| `/api/public/search` | HTTP JSON | external | Modify behavior | Existing array contract | public API | Public search page/clients | FTS fallback and advanced syntax support; no envelope change. |
| `posts.list`, `memos.list`, `admin.posts.list`, admin memo list | tRPC | internal/external | Modify behavior | Existing input/output contracts | routers | Public site, admin, MCP callers | Search filters become shared; permissions and ordering stay unchanged. |

## Acceptance Criteria

- Given `alpha beta`, when the query is executed, then both terms are required and the parser reports `simple`.
- Given `alpha OR beta gamma`, when the query is executed, then it behaves as `alpha OR (beta AND gamma)` unless parentheses change it.
- Given `"alpha OR beta"`, when the query is executed, then `OR` is literal phrase content, not an operator.
- Given malformed advanced syntax such as `alpha AND`, an unknown column, or an unterminated quote, when the query is executed, then it is classified as `advanced-invalid` and retried literally without a 400 response.
- Given a query that exceeds the parser resource budgets, when the public search API is called, then it returns `400 BAD_REQUEST` without literal retry or SQL compilation.
- Given invalid advanced syntax whose literal retry would exceed the SQL parameter budget, when the query is executed internally, then it returns the constrained empty plan without compiling or executing the oversized retry.
- Given a two-character Chinese query, when the query is executed, then the controlled `LIKE` path can find matching title/body/tag/slug text.
- Given a missing embedding model or failed embedding request, when `/api/public/search` is called, then it returns a 200 JSON array from FTS and does not cache that fallback result.
- Given a configured but unavailable reranker, when enhanced search is called, then it returns the semantic base array rather than a 503.
- Given an unavailable, malformed, or out-of-range rerank response, when enhanced search is called, then it returns the semantic base array and records a diagnostic.
- Given no eligible vectors or more than 10,000 eligible vector rows for a semantic query, when search is executed, then it uses uncached FTS without scanning an unbounded vector set.
- Given a malformed or dimension-mismatched stored vector, when semantic search is executed, then it returns uncached FTS results instead of propagating the vector error.
- Given a valid advanced query or invalid-syntax literal retry, when semantic search is executed, then no embedding request is made and the controlled FTS plan is used.
- Given a private or draft row, when an administrator searches, then it is eligible under the existing admin permission rules; when a public caller searches, then it is excluded.
- Given `publishedOnly=false` from an unauthenticated public search or MCP caller, when the request is executed, then unpublished rows are not returned and the MCP request is rejected.
- Given `published=false` on the public `posts.list` compatibility input, when the request is executed, then private and draft rows remain excluded.
- Given index drift, when `search-index check` runs, then it exits non-zero with a diagnostic; after `rebuild`, the check passes.

## Acceptance Checklist

- [x] Index schema, backfill, and trigger lifecycle are defined.
- [x] Query modes, grammar, precedence, invalid retry, and short-word behavior are defined.
- [x] AI fallback and rerank exception behavior are defined.
- [x] Public/admin/list interface compatibility is defined.
- [x] Operational repair and validation commands are defined.

## Quality Gates

### Testing

- Unit tests cover lexer/parser modes, operator precedence, quoted operators, malformed syntax, and AST compilation.
- Integration tests cover migration, triggers, FTS ranking, Chinese short terms, index check/rebuild, and all search callers.
- API/E2E tests cover public array responses, admin visibility, list pagination/sorting, and rerank fallback.

### UI / Storybook

- No component contract changes are required. The existing public search render surface must be checked with deterministic fallback result fixtures if result ordering/content changes visibly.

### Quality checks

- `bun run db:migrations:validate`
- `bun run check`
- targeted tests, `bun run test`, and `bun run build`

## Visual Evidence

Evidence binding: `6a6f98e1468d71671a3d0d2c390f1a7fdf5a9ff1` (current implementation head; the Storybook surface is unchanged since capture)

- source_type: storybook_canvas
  target_program: mock-only
  capture_scope: element
  requested_viewport: 1280x900
  viewport_strategy: storybook-viewport
  margin_policy: trim_only
  evidence_surface: page
  sensitive_exclusion: N/A
  submission_gate: approved
  story_id_or_title: `public-search-page--simple-and-query`
  state: simple AND query
  evidence_note: The public search surface renders a normal multi-word query and its stable result list.
  PR: include
  image: ![Simple AND query](./assets/search-simple-and.png)

- source_type: storybook_canvas
  target_program: mock-only
  capture_scope: element
  requested_viewport: 1280x900
  viewport_strategy: storybook-viewport
  margin_policy: trim_only
  evidence_surface: page
  sensitive_exclusion: N/A
  submission_gate: approved
  story_id_or_title: `public-search-page--advanced-query`
  state: advanced-valid query
  evidence_note: The public search surface preserves a column-filtered OR query in the existing array result layout.
  PR: include
  image: ![Advanced query](./assets/search-advanced-query.png)

- source_type: storybook_canvas
  target_program: mock-only
  capture_scope: element
  requested_viewport: 1280x900
  viewport_strategy: storybook-viewport
  margin_policy: trim_only
  evidence_surface: page
  sensitive_exclusion: N/A
  submission_gate: approved
  story_id_or_title: `public-search-page--invalid-query-literal-retry`
  state: advanced-invalid literal retry
  evidence_note: The public search surface keeps a malformed query usable and shows results instead of an error state.
  PR: include
  image: ![Invalid query literal retry](./assets/search-invalid-literal-retry.png)

## Related PRs

- PR #61: https://github.com/IvanLi-CN/blog-26/pull/61

## Risks / Open Questions / Assumptions

- Risk: FTS5 trigram cannot represent every short token; the AST compiler must keep short leaves on the escaped `LIKE` path.
- Risk: Direct database writers outside routers must remain covered by SQLite triggers.
- Assumption: the current Bun runtime provides FTS5 trigram support, as verified before implementation.

## References

- `src/lib/ai/search.ts`
- `src/lib/ai/search-cache.ts`
- `scripts/db-tools.ts`
- [SQLite FTS5 query syntax](https://www.sqlite.org/fts5.html)
