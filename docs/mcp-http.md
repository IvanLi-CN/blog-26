MCP HTTP Server (Streamable HTTP)
================================

Run (Gateway)

- Prepare DB (optional): `DB_PATH=./dev-data/sqlite.db bun run dev-db:reset`
- Start gateway (choose free ports, avoid 25090/25091 in worktrees):
  - `PORT=25110 bun run gateway:dev`

Endpoints

- MCP entry: `POST/GET/DELETE http://localhost:${PORT:-25090}/mcp` (Streamable HTTP transport)
- Health check: `GET /api/health`

- Environment
- `PORT` (gateway port)
- `DB_PATH` (default `./sqlite.db`, dev: `./dev-data/sqlite.db`)
- Content root (FS): `LOCAL_CONTENT_BASE_PATH`
- Content sources allowlist (optional): `CONTENT_SOURCES=local,webdav` (FS-only: `CONTENT_SOURCES=local`)
- Optional WebDAV: `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`, plus path vars in `src/config/paths.ts`.

Tools
- posts_list, posts_create, posts_update_content, posts_update_time, posts_update_visibility, posts_delete
- memos_list, memos_create, memos_update, memos_delete
- search_semantic, search_enhanced
- tags.list, tags.listPosts, tags.listAllPosts

Sessions

- The first request must be `initialize` without `Mcp-Session-Id`.
- The response includes `Mcp-Session-Id`; clients must send it on later requests.
- Requests without a known session return JSON-RPC errors instead of creating implicit transports.
- `DELETE /mcp` with a known `Mcp-Session-Id` closes the session. Unknown session deletes are idempotent.

Authentication

- Read tools expose public content by default.
- Write tools require `Authorization: Bearer <PAT>` where the PAT resolves to `ADMIN_EMAIL`.
- Tag tools only require admin auth when `includeDrafts` or `includeUnpublished` is requested.

Notes
- All content operations write Markdown with frontmatter (content source can be local FS or WebDAV; if WebDAV is disabled you must provide `LOCAL_CONTENT_BASE_PATH`).
- MCP-created posts and memos write `createdVia: "mcp"` to Markdown frontmatter.
- During sync, `createdVia` is copied into `posts.created_via`; `source` and `data_source` continue to mean storage source (`local` or `webdav`).
- Persisted content policy (Plan #0002): Markdown + DB metadata must store normalized relative paths (no `/api/files/...`); runtime rendering maps relative paths to `/api/files/<source>/...`.
- Files API FS-only behavior: when WebDAV is disabled, `GET /api/files/webdav/<...>.png` returns a fixed placeholder PNG (200), while non-image reads and all writes return `410` JSON `{ error: "ERR_WEBDAV_DISABLED", ... }`.
- After each write/delete, the server triggers incremental content sync to refresh the SQLite cache and embeddings metadata.
- Tag tools default to published posts only; pass `includeDrafts` / `includeUnpublished` when broader visibility is required. `tags.listAllPosts` accepts an optional `limitPerTag` to trim per-tag payload size.
- 标签工具仅在读取草稿或非公开文章时需要管理员身份；保持默认参数即可匿名读取公开标签。

Quick check

```
# initialize
curl -sN -X POST http://localhost:25110/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":"1",
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-03-26",
      "capabilities":{},
      "clientInfo":{"name":"curl","version":"0.0.1"}
    }
  }'

# list tools (replace <session> with Mcp-Session-Id from initialize)
curl -sN -X POST http://localhost:25110/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Protocol-Version: 2025-03-26' \
  -H 'Mcp-Session-Id: <session>' \
  -d '{"jsonrpc":"2.0","id":"2","method":"tools/list","params":{}}'

# call posts_list
curl -sN -X POST http://localhost:25110/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Protocol-Version: 2025-03-26' \
  -H 'Mcp-Session-Id: <session>' \
  -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"posts_list","arguments":{"page":1,"limit":5}}}'
```
