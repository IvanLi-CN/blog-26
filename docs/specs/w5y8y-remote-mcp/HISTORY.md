# Remote MCP Reimplementation History

## Initial Contract

The legacy MCP implementation mixed transport concerns with content write logic and did not distinguish MCP-authored content from ordinary local or WebDAV storage sources. The replacement keeps the endpoint stable while aligning with current Streamable HTTP session semantics and adding a separate authoring-origin marker.

## Codex Client Validation

Real Codex CLI validation showed that some Streamable HTTP clients authenticate the initialized MCP session but may omit authorization on later session-bound tool calls. The `/mcp` session store now carries the PAT-derived auth context with the transport so follow-up requests using the same `Mcp-Session-Id` preserve admin write capability.
