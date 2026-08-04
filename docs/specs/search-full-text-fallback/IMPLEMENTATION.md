# Search syntax parsing and SQLite FTS5 fallback implementation

> Current behavior and implementation coverage for `./SPEC.md`.

## Current Status

- Implementation: implemented, verification complete
- Lifecycle: active
- Catalog note: FTS5 index, parser, fallback routing, list integration, operational checks, and Storybook evidence are implemented on `th/search-fts-fallback`.

## Coverage / rollout summary

- Baseline inspection confirmed Bun SQLite FTS5 and the `trigram` tokenizer are available.
- Existing search code had a SQL `LIKE` fallback and an in-process AI result cache; this implementation makes FTS fallback explicit and uncached.

## Completed Coverage

- Migration creates and backfills the FTS5 trigram table and maintains it with insert/update/delete/type-transition triggers.
- `SearchQueryAst` classifies simple, valid advanced, and invalid advanced input; invalid input retries extracted literals with `AND`.
- The parser enforces normalized length, lexer token, AST depth, and compiled SQL parameter budgets; public schemas reject over-budget queries with `400 BAD_REQUEST`.
- Long leaves use bound FTS5 expressions, short leaves use bound field-aware `LIKE`, and short queries still fail if the FTS migration is absent.
- Semantic embedding failures use uncached FTS; rerank failures preserve the semantic base result.
- Semantic vector candidates are joined to eligible posts, scoped by type/model/visibility, and capped at 10,000 rows before vector search; empty or over-limit scopes use uncached FTS.
- Invalid advanced literal retry rechecks the compiled SQL parameter budget, and rerank responses are validated for integer, range, uniqueness, and expected count before enhanced scoring.
- Dedicated search, public/admin post and memo lists, MCP list filters, and suggestion validation share the compiled predicate.
- Public tRPC search and public post/memo lists pin the published-only visibility filter; MCP search and list requests for unpublished rows require administrator authentication.
- Unit, SQLite trigger, cache, embedding fallback, rerank fallback, API, and Storybook scenario tests are in place.

## Verification

- `bun run check`, migration journal validation, pre-commit checks, targeted search/API tests, and the Storybook canvas scenarios pass.
- The local check, targeted tests, build, E2E, and PR CI results are recorded in the PR checks and delivery history; unrelated baseline failures remain outside the search surface.

## Related Changes

- PR #61: `feat(search): add SQLite FTS5 fallback and query parser`
- Implementation hardening: `fix(search): enforce public visibility boundaries` and `fix(search): harden fallback resource boundaries`

## References

- `./SPEC.md`
- `./HISTORY.md`
