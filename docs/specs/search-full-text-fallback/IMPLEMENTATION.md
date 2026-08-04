# Search syntax parsing and SQLite FTS5 fallback implementation

> Current behavior and implementation coverage for `./SPEC.md`.

## Current Status

- Implementation: implemented, verification complete
- Lifecycle: active
- Catalog note: FTS5 index, parser, fallback routing, list integration, operational checks, and Storybook evidence are implemented on `th/search-fts-fallback`.

## Coverage / rollout summary

- Baseline inspection confirmed Bun SQLite FTS5 and the `trigram` tokenizer are available.
- Existing search code has a SQL `LIKE` fallback and an in-process AI result cache; the new implementation will make FTS fallback explicit and uncached.

## Completed Coverage

- Migration creates and backfills the FTS5 trigram table and maintains it with insert/update/delete/type-transition triggers.
- `SearchQueryAst` classifies simple, valid advanced, and invalid advanced input; invalid input retries extracted literals with `AND`.
- The parser enforces normalized length, lexer token, AST depth, and compiled SQL parameter budgets; public schemas reject over-budget queries with `400 BAD_REQUEST`.
- Long leaves use bound FTS5 expressions, short leaves use bound field-aware `LIKE`, and short queries still fail if the FTS migration is absent.
- Semantic embedding failures use uncached FTS; rerank failures preserve the semantic base result.
- Dedicated search, public/admin post and memo lists, MCP list filters, and suggestion validation share the compiled predicate.
- Public tRPC search pins the published-only visibility filter; MCP search and list requests for unpublished rows require administrator authentication.
- Unit, SQLite trigger, cache, embedding fallback, rerank fallback, API, and Storybook scenario tests are in place.

## Verification

- `bun run check`, migration journal validation, pre-commit checks, targeted search/API tests, and the Storybook canvas scenarios pass.
- Full repository test results and build/E2E notes are recorded in the delivery summary; unrelated baseline failures remain outside the search surface.

## Related Changes

- None yet.

## References

- `./SPEC.md`
- `./HISTORY.md`
