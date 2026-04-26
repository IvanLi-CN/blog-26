# History: Admin LLM settings + model catalog

## 2026-04-23

- Created spec `2dvb9` to define a durable admin control plane for chat, embedding, and rerank configuration.
- Locked the browser/API contract for `/admin/llm-settings` and the three `/api/admin/llm-settings*` resources.
- Chose SQLite single-row persistence with encrypted secret storage guarded by `LLM_SETTINGS_MASTER_KEY`.
- Chose progressive inheritance for base URL and API keys: embedding inherits chat by default, rerank inherits embedding by default.
- Chose a reusable model picker dialog backed by generated OpenRouter metadata plus repo fallback/curated catalog data.
- Implemented runtime resolver adoption across tag grouping, icon reranking, vectorization, semantic search, and rerank flows.
- Simplified the admin inheritance UX by removing explicit mode selectors from the embedding/rerank cards; blank base URLs now mean “inherit”, while API key overrides are created by typing a new key and removed by clearing the saved child key.
