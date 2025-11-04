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
- Optional WebDAV: `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD`, plus path vars in `src/config/paths.ts`.

Tools
- posts_list, posts_create, posts_update_content, posts_update_time, posts_update_visibility, posts_delete
- memos_list, memos_create, memos_update, memos_delete
- search_semantic, search_enhanced

Notes
- All content operations write Markdown with frontmatter (via WebDAV when configured; if WebDAV is disabled you must provide `LOCAL_CONTENT_BASE_PATH`, otherwise these tools return an error).
- After each write/delete, the server triggers incremental content sync to refresh the SQLite cache and embeddings metadata.

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
