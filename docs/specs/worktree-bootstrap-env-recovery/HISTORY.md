# Worktree Bootstrap Environment Recovery Topic History

> This file records topic background and compatibility context. The current requirements remain in `./SPEC.md`.

## Lifecycle / Compatibility

- The topic is active and its runtime requirements are implemented in the current bootstrap chain.
- Existing default generation, existing-target preservation, legacy `PORT` handling, and non-blocking hook failure behavior remain the compatibility baseline.
- Missing linked-worktree targets now inherit a usable primary `.env.local` with target-specific ports; unavailable or invalid sources use the existing generated-default path.

## Replacements / Background

- The broader [linked worktree bootstrap solution](../../solutions/worktree/worktree-bootstrap-contract.md) established the checked-in bootstrap entrypoint, `post-checkout` trigger, Git-dir marker, port registry integration, and smoke-test boundary.
- This topic isolates the missing-environment recovery decision: a missing linked-worktree `.env.local` may inherit the primary worktree's local configuration, while an existing target file remains authoritative.
- The primary source is deliberately limited to `.env.local`; databases, content roots, dependencies, and other ignored runtime state retain their existing ownership boundaries.

## Related Changes

- `scripts/lib/worktree-bootstrap-env.py` provides primary discovery, validation, and atomic publication.
- `scripts/test-worktree-bootstrap.sh` covers source inheritance, fallback, damage preservation, permissions, publication failure, and concurrent publication.

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
- `../../solutions/worktree/worktree-bootstrap-contract.md`
