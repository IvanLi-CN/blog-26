---
status: accepted
supersedes: 0021-embedded-tantivy-search.md
---

# 搜索引擎升级保留既有查询兼容性

## Context

新搜索引擎用于新增的关键词和 AI 搜索能力，但既有搜索调用方可能使用 SQLite FTS5 的 `NEAR(...)` 位置语法、enhanced 的 `rerankerModel` 覆盖参数，或 `rerank: false` 语义。仅因新引擎不支持某项语法，拒绝既有调用会把实现选型变成公共 API 破坏。

## Decision

新 Tantivy 简单查询仍由受控 AST 编译执行。遇到 `NEAR(...)` 时，搜索适配层把原查询交给既有 SQLite FTS5 执行器，保持位置语义；不静默转换成 Tantivy 普通词项。旧 enhanced API 继续接受 `rerankerModel`，并保留 `rerank: false` 关闭重排但继续语义检索的行为。新的 RAG 策略配置独立于旧 reranker 覆盖；新管理页面和模式选择不改变旧参数合同。

## Consequences

搜索引擎仍可按查询语法选择执行器，兼容成本限定在既有查询路径。API 和持久状态需分别提供同一 major 内兼容及迁移证据；新增 Tantivy 索引仍是可重建投影。
