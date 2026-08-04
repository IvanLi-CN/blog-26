# Search syntax parsing and SQLite FTS5 fallback implementation

> Current behavior and implementation coverage for `./SPEC.md`.

## Current Status

- Implementation: implemented, verification in progress
- Lifecycle: active
- Catalog note: FTS5 index, parser, fallback routing, and list integration are being implemented on `th/search-fts-fallback`.

## Coverage / rollout summary

- Baseline inspection confirmed Bun SQLite FTS5 and the `trigram` tokenizer are available.
- Existing search code has a SQL `LIKE` fallback and an in-process AI result cache; the new implementation will make FTS fallback explicit and uncached.

## Completed Coverage

- Migration creates and backfills the FTS5 trigram table and maintains it with insert/update/delete/type-transition triggers.
- `SearchQueryAst` classifies simple, valid advanced, and invalid advanced input; invalid input retries extracted literals with `AND`.
- Long leaves use bound FTS5 expressions, short leaves use bound field-aware `LIKE`, and short queries still fail if the FTS migration is absent.
- Semantic embedding failures use uncached FTS; rerank failures preserve the semantic base result.
- Dedicated search, public/admin post and memo lists, MCP list filters, and suggestion validation share the compiled predicate.
- Unit, SQLite trigger, cache, embedding fallback, and rerank fallback tests are in place.

## Remaining Gaps

- Full repository check, build, E2E, and visual evidence are still required before merge-ready handoff.

## Related Changes

- None yet.

## References

- `./SPEC.md`
- `./HISTORY.md`
