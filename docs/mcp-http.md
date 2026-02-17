MCP HTTP Server (Streamable HTTP)
================================

Run (Integrated)

- Prepare DB (optional): `DB_PATH=./dev-data/sqlite.db bun run dev-db:reset`
- Start integrated server (choose free port, avoid 25090/25091 in worktrees):
  - `PORT=25110 bun run src/scripts/start-integrated-server.ts`

Endpoints

- MCP entry: `POST/GET http://localhost:${PORT:-25091}/mcp` (Streamable HTTP transport)
- Health check: `GET /health` → `{ ok: true }`

- Environment
- `PORT` (Next integrated server port)
- `DB_PATH` (default `./sqlite.db`, dev: `./dev-data/sqlite.db`)
- Content root (FS): `LOCAL_CONTENT_BASE_PATH`
- Content sources allowlist (optional): `CONTENT_SOURCES=local,webdav` (FS-only: `CONTENT_SOURCES=local`)
- Optional WebDAV: `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`, plus path vars in `src/config/paths.ts`.

Tools
- posts.list, posts.create, posts.updateContent, posts.updateTime, posts.updateVisibility, posts.delete
- memos.list, memos.create, memos.update, memos.delete
- search.semantic, search.enhanced
- tags.list, tags.listPosts, tags.listAllPosts

Notes
- All content operations write Markdown with frontmatter (content source can be local FS or WebDAV; if WebDAV is disabled you must provide `LOCAL_CONTENT_BASE_PATH`).
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

# list tools
curl -sN -X POST http://localhost:25110/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Protocol-Version: 2025-03-26' \
  -d '{"jsonrpc":"2.0","id":"2","method":"tools/list","params":{}}'

# call posts_list
curl -sN -X POST http://localhost:25110/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Protocol-Version: 2025-03-26' \
  -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"posts_list","arguments":{"page":1,"limit":5}}}'
```
