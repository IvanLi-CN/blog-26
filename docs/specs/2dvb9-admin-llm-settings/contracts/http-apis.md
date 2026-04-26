# Admin LLM settings HTTP contract

## `GET /api/admin/llm-settings`

Returns the admin-editable draft plus the resolved effective configuration and embedding reindex hints.

Response shape:

```json
{
  "savedAt": 1712345678901,
  "settings": {
    "chat": {
      "model": "gpt-4o-mini",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": { "hasValue": true, "maskedValue": "sk-***abcd", "source": "env" }
    },
    "embedding": {
      "model": "text-embedding-3-small",
      "useCustomProvider": false,
      "baseUrlMode": "inherit",
      "baseUrl": "",
      "apiKeyMode": "inherit",
      "apiKey": { "hasValue": true, "maskedValue": "sk-***abcd", "source": "inherited" }
    },
    "rerank": {
      "model": "cohere/rerank-v3.5",
      "useCustomProvider": false,
      "baseUrlMode": "inherit",
      "baseUrl": "",
      "apiKeyMode": "inherit",
      "apiKey": { "hasValue": true, "maskedValue": "sk-***abcd", "source": "inherited" }
    }
  },
  "resolved": {
    "chat": {
      "model": "gpt-4o-mini",
      "baseUrl": "https://api.openai.com/v1",
      "apiKeyAvailable": true,
      "sources": { "model": "env", "baseUrl": "default", "apiKey": "env" }
    }
  },
  "hints": {
    "embeddingReindexRequired": false,
    "embeddingReindexSuggested": false,
    "currentIndexedModel": "text-embedding-3-small",
    "currentResolvedModel": "text-embedding-3-small",
    "currentIndexedUpdatedAt": 1712345678901
  }
}
```

## `PUT /api/admin/llm-settings`

Persists non-secret overrides and optional secret replacements/clears.

Request shape:

```json
{
  "chat": {
    "model": "gpt-4.1-mini",
    "baseUrl": "https://api.openai.com/v1",
    "apiKeyInput": "",
    "clearApiKey": false
  },
  "embedding": {
    "model": "text-embedding-3-small",
    "useCustomProvider": true,
    "baseUrlMode": "custom",
    "baseUrl": "https://embed.example.test/v1",
    "apiKeyMode": "custom",
    "apiKeyInput": "secret",
    "clearApiKey": false
  },
  "rerank": {
    "model": "cohere/rerank-v3.5",
    "useCustomProvider": false,
    "baseUrlMode": "inherit",
    "baseUrl": "",
    "apiKeyMode": "inherit",
    "apiKeyInput": "",
    "clearApiKey": false
  }
}
```

Behavior rules:

- Empty `apiKeyInput` keeps the current stored secret unless `clearApiKey=true`.
- `clearApiKey=true` removes the stored encrypted secret for that tier.
- Secret write requests require `LLM_SETTINGS_MASTER_KEY`.
- Child tiers use `useCustomProvider` as the authoritative toggle for whether independent `baseURL` / `API Key` settings are active.
- Turning `useCustomProvider=false` keeps any previously saved child-tier custom provider data in storage, but the resolved runtime falls back to the default chain.
- Turning `useCustomProvider=true` requires both a valid `baseURL` and a usable custom API key for that tier.
- Successful writes return the same shape as `GET`.

## `POST /api/admin/llm-settings/test`

Runs a best-effort connectivity test against the current unsaved form state for one tier.

Request shape:

```json
{
  "tier": "embedding",
  "settings": {
    "chat": {
      "model": "gpt-4.1-mini",
      "baseUrl": "https://chat.example.test/v1",
      "apiKeyInput": "chat-secret",
      "clearApiKey": false
    },
    "embedding": {
      "model": "text-embedding-3-small",
      "useCustomProvider": true,
      "baseUrlMode": "custom",
      "baseUrl": "https://embed.example.test/v1",
      "apiKeyMode": "custom",
      "apiKeyInput": "embed-secret",
      "clearApiKey": false
    },
    "rerank": {
      "model": "cohere/rerank-v3.5",
      "useCustomProvider": false,
      "baseUrlMode": "inherit",
      "baseUrl": "",
      "apiKeyMode": "inherit",
      "apiKeyInput": "",
      "clearApiKey": false
    }
  }
}
```

Response shape:

```json
{
  "tier": "embedding",
  "ok": true,
  "model": "text-embedding-3-small",
  "baseUrl": "https://embed.example.test/v1",
  "summary": "嵌入模型测试通过",
  "details": ["模型：text-embedding-3-small", "返回向量：1536 维"]
}
```

Behavior rules:

- The request validates the same unsaved payload shape used by `PUT`.
- URL and secret rules are enforced before any outbound call is attempted.
- The test does not persist settings.
- The endpoint returns tier-specific success/error summaries for the UI popover.

## `GET /api/admin/llm-settings/catalog`

Supports optional `tier=chat|embedding|rerank` to annotate provider availability for the active tier.

Response shape:

```json
{
  "generatedAt": "2026-04-23T08:00:00.000Z",
  "source": "generated",
  "items": [
    {
      "id": "openai/gpt-4.1-mini",
      "name": "GPT-4.1 mini",
      "description": "Fast chat model",
      "contextLength": 1047576,
      "capabilities": ["chat", "tools", "structured-output"],
      "availableOnProvider": true,
      "source": "openrouter"
    }
  ]
}
```
