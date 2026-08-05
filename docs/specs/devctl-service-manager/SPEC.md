# Development Service Management

## Background

Development service guidance previously described a separate service-manager layout. The repository now has a single supported local development entrypoint.

## Current Contract

- `bun run dev` starts Astro, the admin SPA, and the Bun gateway.
- Development uses the local filesystem content root.
- No remote content-source helper is started or documented.
- Long-running local services follow the repository port-lease policy.

## Acceptance Criteria

- Human-facing development guidance points to `bun run dev`.
- No maintained document instructs contributors to start the retired remote content-source service.

## References

- `README.md`
- `AGENTS.md`
