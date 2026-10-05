# Worktree Bootstrap Environment Recovery Implementation Status

> The current normative contract is in `./SPEC.md`. This file records implementation coverage and rollout facts only.

## Current Status

- Implementation: implemented
- Lifecycle: active
- Catalog note: Requirements are documented; runtime changes remain outside this phase.

## Implementation Coverage

- Existing coverage: the repository retains the repo-owned bootstrap entrypoint, non-blocking `post-checkout` wrapper, Git-dir initialization markers, legacy `PORT` compatibility, and lock-protected worktree port leases.
- Implemented coverage: primary worktree discovery, source-only recovery for missing targets, port-only normalization, source/target damage distinctions, owner-only atomic publication, fallback behavior, and concurrent create-once handling.
- Verification commands: `bun run test:worktree-bootstrap`, shell syntax checks, Python compilation, `bun run check`, and `git diff --check`.
- Review follow-up: the linked-worktree smoke fixture now reads modes through Python's standard library on both BSD and GNU hosts, and uses quoted source port assignments to verify lease rewriting.
- Review follow-up: source reads now use descriptor validation and non-blocking special-file handling, transient source loss returns to generated-default fallback, CRLF files remain loadable, and port values are omitted from success logs.

## Coverage / rollout summary

- Runtime behavior is implemented in the current bootstrap entrypoint and covered by the linked-worktree smoke fixture. Existing target files remain authoritative, while missing linked targets may inherit only the primary `.env.local` content.

## Remaining Gaps

- The approved A1-A5 acceptance paths are covered by the implementation and smoke fixture; exhaustive invalid-input permutations remain represented by the shared validation paths rather than one fixture per permutation.
- The linked-worktree smoke fixture uses real `git worktree add` operations and synthetic secret markers only.

## Related Changes

- `scripts/lib/worktree-bootstrap-env.py`
- `scripts/lib/worktree-bootstrap-common.sh`
- `scripts/worktree-bootstrap.sh`
- `scripts/test-worktree-bootstrap.sh`

## References

- `./SPEC.md`
- `./HISTORY.md`
- `../../../scripts/worktree-bootstrap.sh`
- `../../../scripts/test-worktree-bootstrap.sh`
