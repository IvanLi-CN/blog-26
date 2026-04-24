---
title: "Admin-managed LLM runtime configuration"
module: "admin-llm-settings"
problem_type: "runtime-config"
component: "admin-ui, compatibility-api, ai-runtime"
tags:
  - admin
  - llm
  - config
  - sqlite
  - encryption
status: "active"
related_specs:
  - "docs/specs/2dvb9-admin-llm-settings/SPEC.md"
symptoms:
  - "AI-backed features read different env variables directly and drift apart at runtime."
  - "Operators cannot safely change models, base URLs, or keys without a restart."
  - "Embedding model drift is hard to detect after an override changes."
root_cause: "Provider settings were resolved independently in multiple modules at import time, with no durable admin-owned state or shared inheritance model."
resolution_type: "shared-runtime-resolver"
---

# Context

The admin now owns one durable configuration surface for chat, embedding, and rerank providers. The browser edits masked state only, while the server resolves effective runtime settings from database overrides, environment defaults, and built-in fallbacks.

# Symptoms

- Tag grouping, icon reranking, vectorization, and semantic search disagree about which model or base URL is active.
- Local development works only when the correct env variables are already exported before startup.
- Rotating keys or switching embedding models requires deploy-time changes and makes existing vector indexes ambiguous.

# Root cause

The project previously let each AI-related module read environment variables directly. That scattered the source of truth, locked values at module-load time, and made it impossible to express one durable default chain while still letting embedding or rerank opt into their own provider settings only when needed.

# Resolution

1. Persist a single validated `llm_settings` record in SQLite.
2. Store API keys as AES-256-GCM encrypted payloads; require `LLM_SETTINGS_MASTER_KEY` for secret writes/decryption.
3. Resolve runtime config on demand:
   - chat: `DB -> env -> built-in default`
   - embedding model: `DB -> env -> built-in default`
   - embedding base URL / key: follow the default chain unless `useCustomProvider=true`
   - rerank model: `DB -> env -> missing`
   - rerank base URL / key: follow the default chain unless `useCustomProvider=true`
4. Route all AI call sites through the shared resolver instead of import-time env snapshots.
5. Compute embedding reindex notices from the resolved embedding tier plus existing `post_embeddings` metadata so inherited parent changes stay visible: model mismatches require revectorization, while same-model provider changes produce an advisory resync warning.
6. Keep the browser UX compact instead of exposing separate “mode” dropdowns or effective-value summary cards:
   - inputs use the active model/base URL as placeholders
   - API keys render as same-length masked placeholders
   - embedding/rerank expose one `高级设置` switch to reveal or hide independent provider fields
   - turning that switch off keeps saved custom provider data intact instead of clearing it
7. Validate all provider URLs through browser `type=url` inputs plus server-side `http|https` URL parsing and normalization.
8. Expose a tier-level connectivity test endpoint and UI bubble so operators can validate unsaved form state before saving.
9. Back the model picker with generated OpenRouter snapshot data, repo fallback metadata, curated overrides, and best-effort provider `/models` availability annotations.

# Guardrails / Reuse notes

- Never return plaintext API keys from admin/browser APIs; return masked state and source metadata only.
- An empty secret field during save means “keep current value”; use an explicit clear flag to remove persisted secrets.
- Child-tier provider fields are governed by the advanced switch, not by free-form “inherit/custom” dropdowns.
- Turning a child tier advanced switch off must not delete its saved custom base URL or encrypted key.
- Turning a child tier advanced switch on must fail fast unless both a valid custom `baseURL` and a usable custom API key are available.
- If a tier saves a non-empty `baseURL`, the resolved configuration must still have an API key available; reject saves that would leave the tier pointing at a provider URL without credentials.
- Provider `/models` data is advisory availability metadata, not the canonical catalog.
- Catalog refresh must fail open so local builds remain usable without network access.

# References

- `docs/specs/2dvb9-admin-llm-settings/SPEC.md`
- `docs/specs/2dvb9-admin-llm-settings/contracts/http-apis.md`
- `/Users/ivan/.codex/worktrees/50d8/blog-25/src/server/services/llm-settings.ts`
- `/Users/ivan/.codex/worktrees/50d8/blog-25/src/server/services/llm-model-catalog.ts`
