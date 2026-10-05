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
- The follow-up repair aligns source parsing with the shell loader's LF boundaries, rejects mixed quote forms, and expands the smoke evidence for manual recovery, prunable-primary fallback, full lease replacement, and concurrent publication.
- The latest repair preserves EOF bytes when no port rows need adding, derives target permissions from the bytes actually opened, and strengthens dry-run, automatic-damage, and create-once publication evidence.
- The final evidence pass loads unterminated final environment records correctly and proves effective target preservation plus synchronized create-once races.
- The final permission/race hardening rejects mode-bit sources that cannot safely yield an owner-readable target and verifies the full winning publication bytes.
- The final parser hardening rewrites every port-key record, separates trailing-CR additions safely, and adds root-portable permission and deterministic failure evidence.
- The final evidence repair makes helper overrides explicit for deterministic fixtures and synchronizes the shell-level publisher race, including its loser reload path.

## References

- `./SPEC.md`
- `./IMPLEMENTATION.md`
- `../../solutions/worktree/worktree-bootstrap-contract.md`
