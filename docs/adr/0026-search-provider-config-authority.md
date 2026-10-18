---
status: accepted
---

# AI 搜索提供方配置权威与质量状态

## Context

AI 搜索同时有持久化的搜索策略和既有 LLM 提供方配置。搜索策略表可能为空，或只保存模式、预算和质量验证记录；如果把质量记录缺失误判为提供方不可用，已有 `llm_settings` 配置就无法驱动 RAG 与查询改写。

## Decision

- 搜索运行时统一通过现有 `getResolvedLlmConfig()` 读取 `llm_settings` 的 chat、embedding、Base URL 和 API Key。`search_settings` 不保存或替代提供方凭据。
- `status.available` 只表示模式启用且当前提供方配置完整。缺少质量记录、质量验证失败或 fingerprint 过期不改变已配置模式的运行资格。
- 管理状态增加派生的 `qualityStatus`：`not-run`、`passed`、`failed`、`stale`。它用于诊断、验证历史和管理页面提示，不作为模型调用前置条件。
- 模式停用或提供方未配置仍回退关键词；实际 provider 超时、不可用或非法输出继续按执行器既有规则回退。embedding 模型与当前索引身份不匹配的保护保持不变，因为它属于索引一致性而非质量记录。

## Consequences

空的或旧的 `search_settings` 不再遮蔽已有 LLM 配置，旧数据库无需迁移或重新保存密钥。管理员可以区分“配置可用但尚未验证”和“配置不可用”，质量验证仍可用于发现质量问题。实现必须在 provider 配置变化后将旧质量记录标记为 `stale`，不能让迟到的验证结果覆盖新 fingerprint。
