# Remote MCP Reimplementation Implementation

## Coverage

- Status: implemented.
- `/mcp` now requires explicit Streamable HTTP session initialization and reuses stateful transports by `Mcp-Session-Id`.
- Authenticated Streamable HTTP sessions retain the PAT-derived user context so clients that only attach auth during initialization can still make authorized follow-up tool calls on the same session.
- Post and memo writes use storage-source-aware helpers so local filesystem and WebDAV rows update/delete through their actual backing source.
- MCP-created posts and memos persist `createdVia: "mcp"` in Markdown and `posts.created_via` after sync.

## Verification

- `bun run check`
- `bun test src/server/mcp-http.test.ts src/lib/content-sources/__tests__/utils.test.ts`
- `bun run db:migrations:validate`
- `RUN_MCP_TESTS=1 MCP_PORT=25110 bun test tests/mcp`
- `codex exec` with a real temporary streamable HTTP MCP server config created a memo through `/mcp`, listed it back, and verified `posts.created_via = "mcp"` plus Markdown `createdVia: "mcp"`.
- `bunx playwright test -c tests/e2e/mcp memo-create.spec.ts`
- `DB_PATH=./test-data/sqlite.db LOCAL_CONTENT_BASE_PATH=./test-data/local CONTENT_SOURCES=local PUBLIC_SITE_URL=http://127.0.0.1:25110 bun run build`
