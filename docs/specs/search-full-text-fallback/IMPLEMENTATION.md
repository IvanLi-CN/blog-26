# Search syntax parsing and SQLite FTS5 fallback implementation

> Current behavior and implementation coverage for `./SPEC.md`.

## Current Status

- Implementation: implemented, verification complete
- Lifecycle: active
- Catalog note: FTS5 index, parser, fallback routing, list integration, operational checks, and Storybook evidence are implemented on `th/search-fts-fallback`.

三种模式、默认 RAG、原始关键词保全、名称与别名、独立 AI 链及直接关键词回退由 [搜索相关性主题](../search-relevance/SPEC.md) 定义，已接入运行时，当前交付验收仍在进行。下述仅从语义候选取结果及重排失败返回语义基础结果描述既有实现，不代表新目标。新主题采用内嵌 Tantivy，不以现有 trigram 已满足名称规则为前提；新模式及 enhanced 明确不支持 NEAR，旧列表与独立 semantic 的 SQLite 查询及 NEAR 计量保留，不删除共享 parser 能力。

## Coverage / rollout summary

- Baseline inspection confirmed Bun SQLite FTS5 and the `trigram` tokenizer are available.
- Existing search code had a SQL `LIKE` fallback and an in-process AI result cache; this implementation makes FTS fallback explicit and uncached.

## Completed Coverage

- Migration creates and backfills the FTS5 trigram table and maintains it with insert/update/delete/type-transition triggers.
- `SearchQueryAst` classifies simple, valid advanced, and invalid advanced input; invalid input retries extracted literals with `AND`.
- The parser enforces normalized length, lexer token, AST depth, and compiled SQL parameter budgets; public schemas reject over-budget queries with `400 BAD_REQUEST`.
- Long leaves use bound FTS5 expressions, short leaves use bound field-aware `LIKE`, and short queries still fail if the FTS migration is absent.
- Semantic embedding failures use uncached FTS; rerank failures preserve the semantic base result.
- Semantic vector candidates are joined to eligible posts, scoped by type/model/visibility, and capped at 10,000 rows before vector search; empty, over-limit, or corrupt-vector scopes use uncached FTS.
- Invalid advanced literal retry rechecks the compiled SQL parameter budget, and rerank responses are validated for integer, range, uniqueness, and expected count before enhanced scoring.
- Dedicated search, public/admin post and memo lists, MCP list filters, and suggestion validation share the parser/compiler plan; non-simple AI queries bypass embeddings.
- Public tRPC search and public list contexts pin the published-only visibility filter; the admin-aware memo list retains its authenticated administrator branch, and MCP unpublished requests require administrator authentication.
- Semantic/enhanced cache keys include a non-secret fingerprint of the effective embedding/rerank provider configuration, and rerank model overrides are honored.
- Unit, SQLite trigger, cache, embedding fallback, rerank fallback, API, and Storybook scenario tests are in place.

## Verification

- `bun run check`, migration journal validation, pre-commit checks, targeted search/API tests, and the Storybook canvas scenarios pass.
- The local check, targeted tests, build, E2E, and PR CI results are recorded in the PR checks and delivery history; unrelated baseline failures remain outside the search surface.

## Related Changes

- PR #61: `feat(search): add SQLite FTS5 fallback and query parser`
- Implementation hardening: `fix(search): enforce public visibility boundaries`, `fix(search): harden fallback resource boundaries`, and `fix(search): harden semantic fallback boundaries`

## References

- `./SPEC.md`
- `./HISTORY.md`

## Retained verification and operational considerations

### Acceptance coverage

- Index schema, backfill, and trigger lifecycle are defined.
- Query modes, grammar, precedence, invalid retry, and short-word behavior are defined.
- AI fallback and rerank exception behavior are defined.
- Public/admin/list interface compatibility is defined.
- Operational repair and validation commands are defined.

### Quality gates

#### Testing

- Unit tests cover lexer/parser modes, operator precedence, quoted operators, malformed syntax, and AST compilation.
- Integration tests cover migration, triggers, FTS ranking, Chinese short terms, index check/rebuild, and all search callers.
- API/E2E tests cover public array responses, admin visibility, list pagination/sorting, and rerank fallback.

#### UI / Storybook

- No component contract changes are required. The existing public search render surface must be checked with deterministic fallback result fixtures if result ordering/content changes visibly.

#### Quality checks

- `bun run db:migrations:validate`
- `bun run check`
- targeted tests, `bun run test`, and `bun run build`


FTS5 trigram cannot represent all short tokens; the controlled compiler retains escaped LIKE for those leaves. Direct database writers remain covered by SQLite triggers. Bun FTS5/trigram availability was verified for the original implementation. The three-mode successor does not replace these legacy list and explicit-semantic boundaries.
