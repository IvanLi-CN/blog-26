# Remote MCP Reimplementation

## Summary

`/mcp` is the stable remote MCP entrypoint for agent access to blog content. It uses the current MCP Streamable HTTP transport model, PAT-backed admin authorization for writes, and durable content origin metadata for MCP-created posts and memos.

## Goals

- Keep `/mcp` as the only remote MCP endpoint.
- Preserve existing post, memo, tag, and search tool capabilities for MCP clients.
- Make Streamable HTTP sessions explicit: clients initialize first, then reuse `Mcp-Session-Id`; `DELETE` closes a known session.
- Ensure post and memo write tools work against both local filesystem content and WebDAV content.
- Mark MCP-created content without confusing the storage source used by file routing and rendering.

## Non-Goals

- No new public UI.
- No change to PAT format or admin identity rules.
- No replacement for the existing local/WebDAV content-source model.
- No migration of existing content to `createdVia: "mcp"` unless the Markdown already declares it.

## Interface Contract

- Endpoint: `POST /mcp`, `GET /mcp`, and `DELETE /mcp`.
- Authentication: write tools require `Authorization: Bearer <personal-access-token>` resolving to the configured admin email.
- Session behavior:
  - `initialize` without `Mcp-Session-Id` creates a new stateful Streamable HTTP session.
  - Requests with a known `Mcp-Session-Id` reuse the existing session transport.
  - Non-initialize requests without a known session return a JSON-RPC protocol error.
  - `DELETE` with a known session closes and removes that session; unknown session deletes are idempotent.
- Content origin:
  - MCP-created Markdown includes `createdVia: "mcp"` in frontmatter.
  - Synced database rows store this value in `posts.created_via`.
  - `posts.source` and `posts.data_source` remain the storage source (`local` or `webdav`).

## Acceptance Criteria

- A current MCP client can initialize, list tools, call read tools, call write tools with an admin PAT, and close a session.
- MCP-created posts and memos are visible through `/mcp` list tools after sync.
- MCP-created Markdown and database rows both preserve `createdVia: "mcp"`.
- Local filesystem and WebDAV write paths both support create, update, visibility/time metadata updates, and delete.
- Invalid session usage produces protocol-safe errors rather than agent-breaking transport failures.
