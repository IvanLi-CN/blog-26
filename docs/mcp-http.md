MCP HTTP Server (Streamable HTTP)
================================

## Run

```bash
DB_PATH=./dev-data/sqlite.db \
LOCAL_CONTENT_BASE_PATH=./dev-data/local \
PORT=25110 \
bun run gateway:dev
```

## Endpoints

- MCP entry: `POST/GET/DELETE http://localhost:${PORT:-25090}/mcp`
- Health check: `GET /api/health`

## Environment

- `PORT`
- `DB_PATH`
- `LOCAL_CONTENT_BASE_PATH`
- `ADMIN_EMAIL` for admin-authenticated write flows

All content writes target the configured local content root. Sync copies `createdVia` into `posts.created_via`; storage-source fields now resolve to local-only semantics.

## Tools

- `posts_list`, `posts_create`, `posts_update_content`, `posts_update_time`, `posts_update_visibility`, `posts_delete`
- `memos_list`, `memos_create`, `memos_update`, `memos_delete`
- `search_semantic`, `search_enhanced`
- `tags.list`, `tags.listPosts`, `tags.listAllPosts`

## Sessions

- The first request must call `initialize` without `Mcp-Session-Id`.
- The response returns `Mcp-Session-Id`; clients must send it on later requests.
- `DELETE /mcp` closes a known session.

## Authentication

- Read tools expose public content by default.
- Write tools require `Authorization: Bearer <PAT>` mapped to `ADMIN_EMAIL`.

## Notes

- Content writes store Markdown with frontmatter in the local content root.
- Persisted Markdown and DB metadata store normalized relative asset paths, not `/api/files/...` links.
- Runtime rendering maps those relative paths to `/api/files/local/...`.
- After each write or delete, the server triggers incremental content sync.
