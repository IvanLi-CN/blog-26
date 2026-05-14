# Remote MCP Reimplementation History

## Initial Contract

The legacy MCP implementation mixed transport concerns with content write logic and did not distinguish MCP-authored content from ordinary local or WebDAV storage sources. The replacement keeps the endpoint stable while aligning with current Streamable HTTP session semantics and adding a separate authoring-origin marker.

## Codex Client Validation

Real Codex CLI validation showed that some Streamable HTTP clients authenticate the initialized MCP session but may omit authorization on later session-bound tool calls. The `/mcp` session store now carries the PAT-derived auth context with the transport so follow-up requests using the same `Mcp-Session-Id` preserve admin write capability.

## Live Delete Consistency

Live Codex CLI validation showed that MCP delete tools removed Markdown files but left indexed rows visible until a later database cleanup path. Delete now removes the storage file and the matching `posts` row in the same tool call before triggering sync.

## Markdown Write Formatting

MCP-authored content can arrive from clients as raw Markdown without editor-side normalization. MCP post and memo create/update tools now format the Markdown body server-side before storage so files keep stable spacing for headings, paragraphs, lists, tables, code fences, tasks, and math while preserving frontmatter metadata.
