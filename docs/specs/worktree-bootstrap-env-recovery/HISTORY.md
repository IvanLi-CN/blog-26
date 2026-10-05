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

## Review Follow-up

- Tier 3 review identified a BSD-only file-mode assertion in the smoke fixture; it now uses Python standard-library mode inspection so the test runs on macOS and Ubuntu.
- The source fixture includes quoted port assignments, preserving the contract proof that recovery replaces all three lease-bound port values.
- A follow-up review hardened special-file/race handling, preserved fallback for transient source loss, normalized CRLF loading, and removed port values from bootstrap logs.
- The final review follow-up skips malformed shell variable names without exporting their values and expands topology and source/target validation-matrix coverage.
- The final repair makes quoted and duplicate port assignments explicit in the rewrite contract, guarantees owner-read access on recovered files, and keeps permission fixtures portable for root-run test environments.

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
- `../../solutions/worktree/worktree-bootstrap-contract.md`
