# Remote MCP Reimplementation History

## Initial Contract

The legacy MCP implementation mixed transport concerns with content write logic and did not distinguish MCP-authored content from ordinary local or WebDAV storage sources. The replacement keeps the endpoint stable while aligning with current Streamable HTTP session semantics and adding a separate authoring-origin marker.
