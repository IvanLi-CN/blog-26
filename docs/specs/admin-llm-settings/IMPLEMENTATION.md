# Implementation: Admin LLM settings + model catalog

## Status

- Overall: implemented
- Runtime config resolver: implemented
- Admin HTTP resources: implemented
- Admin SPA page + model picker dialog: implemented
- Catalog refresh + fallback merge: implemented
- Validation coverage: implemented
- Visual evidence: captured in `SPEC.md`

## Delivered scope

### Persistence and secret handling

- Added SQLite table `llm_settings` with a single-row config payload and timestamps.
- Persisted config is validated through Zod before save/load.
- API keys are stored as AES-256-GCM encrypted payloads and require `LLM_SETTINGS_MASTER_KEY`.
- Missing `LLM_SETTINGS_MASTER_KEY` on secret writes returns `LLM_SETTINGS_MASTER_KEY_MISSING` with a Chinese operator action message.
- Admin responses expose masked secret state only; plaintext keys never leave server memory.

### Runtime resolution

- Added a shared runtime resolver for `chat`, `embedding`, and `rerank`.
- Chat resolves as `DB -> env -> built-in default`.
- Embedding and rerank keep independent model selection while inheriting base URL / API key by default.
- Child-tier effective updates propagate through inheritance so reindex hints stay correct when parent settings change.
- Embedding reindex hints distinguish between hard model mismatches and softer provider-config drift when the model stays the same.

### Browser/admin contract

- Added:
  - `GET /api/admin/llm-settings`
  - `PUT /api/admin/llm-settings`
  - `GET /api/admin/llm-settings/catalog`
  - `POST /api/admin/llm-settings/test`
- Added admin route `/admin/llm-settings` and navigation entry `LLM 设置`.
- The admin page exposes three progressive cards: chat, embedding, rerank.
- The form keeps the active model/base URL in placeholders, removes the earlier summary tiles, and reduces API key editing to a masked password input plus a minimal clear action.
- Chat stays direct-edit, while embedding and rerank now use a single `高级设置` switch to control whether independent `baseURL` / `API Key` fields are visible and active.
- Turning the advanced switch off hides child-tier provider fields but keeps any previously saved custom provider data intact in SQLite.
- Turning the advanced switch on requires a valid `baseURL` and an available custom API key for that tier.
- Every tier now has a `测试` action next to `选择模型`; a result bubble shows staged progress labels while pending and returns success or error details inline.
- URL handling is validated in two layers: browser `type=url` inputs plus server-side `http|https` normalization/validation.
- Model selection uses a reusable dialog with search, capability badge filters, context length, descriptions, source labels, and provider availability hints.
- The model picker shows explicit loading, not-yet-fetched, upstream-empty, filtered-empty, and error states with retry/preset/custom-model paths.

### Container runtime guardrails

- Production gateway/admin startup sources `/run/secrets/blog_env` when present, then requires `LLM_SETTINGS_MASTER_KEY` and exits before app start when it is still missing.
- The entrypoint logs only set/unset status for sensitive runtime inputs and no longer prints the full environment.

### Catalog data pipeline

- Added build-time refresh script `scripts/update-llm-model-catalog.ts`.
- `prebuild` now refreshes generated catalog data from OpenRouter on a best-effort basis.
- Runtime catalog reads merge generated snapshot, repo fallback metadata, curated overrides, and current provider `/models` availability signals.
- Fallback metadata remains the offline/development safety net.

### Existing AI call sites migrated

- Tag grouping and icon reranking now read the resolved chat config at execution time.
- Embedding/vectorization/search flows now read the resolved embedding config at execution time.
- Enhanced search reranking now reads the resolved rerank config at execution time.
- Admin vectorization status now uses the same resolved embedding configuration and reindex hint logic.

## Validation

- `bun run check`
- `bun run test`
- `bun run build`
- Service/unit coverage for runtime resolution + secret persistence
- HTTP compatibility coverage for settings GET/PUT/catalog/test
- Playwright coverage for open page, picker filtering, advanced-setting toggles, tier test feedback, persistence, and embedding reindex warning

## Follow-up notes

- Saving settings does not auto-run connectivity checks; test actions stay opt-in and do not mutate persisted config.
- Changing embedding settings does not auto-trigger revectorization; the admin page surfaces a warning and points the operator to content sync / vectorization flows.
