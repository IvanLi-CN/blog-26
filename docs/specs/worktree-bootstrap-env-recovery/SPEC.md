# Worktree Bootstrap Environment Recovery

## Context and Scope

- Context: A new linked worktree must recover the local development environment without making the maintainer remember a separate configuration-copy step.
- In scope: The local `.env.local` recovery contract used by the existing worktree bootstrap entrypoints, including source selection, copy-once behavior, worktree port isolation, failure degradation, and verification.
- Out of scope: Production deployment, remote secret management, a general configuration service, copying databases or content trees, dependency installation policy, and replacing the repository's Bun/Lefthook/port-registry tooling.

## Decision Basis

### Owner-confirmed constraints

- A linked worktree that has no `.env.local` must recover it from the primary worktree when that source is available.
- The source file is copied in full, including possible secret-like values; no value, line, diff, or hash may appear in logs or documentation.
- Only `PORT`, `SITE_PORT`, and `ADMIN_PORT` are rewritten after recovery so the target receives its own port lease.
- `DB_PATH`, `LOCAL_CONTENT_BASE_PATH`, `CONTENT_SOURCES`, and all other source variables retain their copied values. Relative paths resolve from the target worktree; absolute paths are not guessed or rewritten.
- An existing target `.env.local` is user-owned and is never overwritten, merged, or normalized by bootstrap.

### Verified repository facts

- `scripts/worktree-bootstrap.sh` is the explicit bootstrap entrypoint and `scripts/post-checkout-worktree-bootstrap.sh` is the non-blocking `post-checkout` wrapper.
- `scripts/lib/worktree-bootstrap-common.sh` currently resolves `.env.local` from the current worktree, creates a default file when it is absent, loads an existing file, and uses `scripts/port-registry.py` for worktree port leases.
- The current default file contains `PORT`, `SITE_PORT`, `ADMIN_PORT`, `DB_PATH`, `LOCAL_CONTENT_BASE_PATH`, and `CONTENT_SOURCES`; `.env.local` is ignored by Git.
- The current bootstrap marker is stored in Git-dir state, and the existing hook runs only for the first branch checkout without that marker.
- The port registry uses a lock-protected, atomic registry update and reuses a complete port block for the same scope when it is available.

## Terms and Interfaces

- `primary worktree`: The first non-bare worktree record returned by `git worktree list --porcelain`. It is identified by Git worktree metadata, not by the name of its checked-out branch.
- `target linked worktree`: The current worktree when its canonical repository root differs from the primary worktree root.
- `source env`: `primary worktree/.env.local`, used only to fill a missing target file.
- `target env`: `target linked worktree/.env.local`, which becomes user-owned as soon as it exists.
- `worktree-local override`: A value selected in the target environment for that worktree. Bootstrap preserves it once the target file exists.
- `automatic bootstrap`: The `post-checkout` path. It is best-effort and must not make the Git checkout fail.
- `manual bootstrap`: The explicit `bun run worktree:bootstrap -- --force` path. It reports operational failures with a non-zero status.
- Interfaces: `scripts/worktree-bootstrap.sh`, `scripts/post-checkout-worktree-bootstrap.sh`, `scripts/lib/worktree-bootstrap-common.sh`, `scripts/port-registry.py`, and `bun run test:worktree-bootstrap`.

## Requirements

### REQ-WTENV-001 - Shared entrypoint and trigger boundary

- The environment recovery MUST run inside the existing bootstrap chain used by both first linked-worktree `post-checkout` and the explicit manual bootstrap entrypoint.
- The primary worktree MUST retain the existing default-env behavior; it MUST NOT copy its own `.env.local` as a recovery source.
- Normal hook execution MUST remain guarded by the existing first-checkout and Git-dir marker rules. A later branch switch MUST NOT perform a new environment copy.
- `--dry-run` MUST inspect and report the planned recovery without writing `.env.local`, changing the port registry, or writing the marker.
- Verification: `VER-WTENV-001`.

### REQ-WTENV-002 - Primary worktree identification

- Bootstrap MUST select the first non-bare worktree record from `git worktree list --porcelain` as the primary worktree.
- The comparison between primary and target MUST use canonical repository roots. Branch names, the `main` branch, parent directories, and other linked worktrees MUST NOT be used as alternative source-selection heuristics.
- If the primary record is absent, prunable, or does not resolve to an accessible directory, bootstrap MUST treat the primary source as unavailable rather than guessing another worktree.
- Verification: `VER-WTENV-002`.

### REQ-WTENV-003 - Copy scope

- The recovery operation MUST read at most the primary `.env.local` file for environment inheritance.
- It MUST NOT copy `dev-data`, SQLite files, content directories, `node_modules`, hooks, other `.env*` files, or arbitrary ignored files as part of this contract.
- The source is untracked local state. Bootstrap MUST NOT read a historical Git revision to reconstruct it.
- Verification: `VER-WTENV-003`.

### REQ-WTENV-004 - Missing target environment

- When the target `.env.local` is absent and the source is a readable regular file, bootstrap MUST use the source file as the complete configuration baseline.
- The final target file MUST retain every source setting other than the three worktree port assignments defined by `REQ-WTENV-008`.
- When the source is unavailable or unusable under `REQ-WTENV-009`, bootstrap MUST use the existing generated-default path instead of leaving a missing target environment when default generation succeeds.
- Verification: `VER-WTENV-004`.

### REQ-WTENV-005 - Existing target environment preservation

- An existing target `.env.local` MUST be authoritative. Bootstrap MUST NOT copy from the primary, merge values, rewrite formatting, rewrite paths, or rewrite ports in that file, including during `--force`.
- A readable regular target file that defines only `PORT` remains compatible with the existing legacy derivation of `SITE_PORT` and `ADMIN_PORT` at runtime.
- An existing path that is not a usable regular file MUST be preserved and treated as a damaged target environment; bootstrap MUST NOT replace it.
- Verification: `VER-WTENV-005`.

### REQ-WTENV-006 - Environment validity and damaged files

- Blank lines, comments, unknown variables, and the existing supported `KEY=VALUE` parsing forms MUST remain accepted unless they prevent the required runtime values from being established.
- A target environment is damaged when it cannot be read as a usable environment file, when `PORT` is absent or non-numeric after loading, or when explicitly present `SITE_PORT` or `ADMIN_PORT` is non-numeric.
- A damaged target MUST remain untouched. Manual bootstrap MUST fail during the environment phase and print only a non-sensitive recovery hint; automatic bootstrap MUST emit a warning and allow checkout to complete.
- A source environment that cannot be read, is not usable as a regular file, or fails the same required-value validation MUST be treated as unavailable for source inheritance; it MUST NOT be copied over a target or exposed in logs.
- Verification: `VER-WTENV-006`.

### REQ-WTENV-007 - Sensitive values and file permissions

- If the primary source is used, all source content, including secret-like values, MUST be copied without redaction so the recovered worktree has the same configuration surface.
- Logs MUST contain only operation status, phase, and non-sensitive failure reasons. They MUST NOT contain environment values, individual assignments, file diffs, or content hashes.
- The recovered target file MUST be owner-only readable/writable (`0600` or stricter) and MUST NOT broaden the source file's effective permissions.
- Tests and examples MUST use synthetic placeholders and MUST NOT copy or display a real API key or other real credential.
- Verification: `VER-WTENV-007`.

### REQ-WTENV-008 - Worktree port isolation and local overrides

- A recovered linked worktree MUST receive a target-specific `PORT`, `SITE_PORT`, and `ADMIN_PORT` block from the existing port registry.
- Source port assignments MUST be replaced by the target lease, and missing port assignments MUST be added as needed. The primary worktree's port values MUST NOT be reused merely because they were present in the source file.
- `DB_PATH`, `LOCAL_CONTENT_BASE_PATH`, `CONTENT_SOURCES`, and all other source values MUST be retained literally. Relative paths therefore resolve from the target worktree; absolute paths remain explicit shared or external paths and MUST NOT be automatically translated.
- An existing target environment is exempt from this normalization under `REQ-WTENV-005`.
- Verification: `VER-WTENV-008`.

### REQ-WTENV-009 - Primary-source fallback

- If primary discovery fails, the primary directory is unavailable, or the primary `.env.local` is absent or unusable, bootstrap MUST fall back to the existing generated-default environment with a fresh target port lease when the target is missing.
- A successful fallback MUST be reported as a warning or informational degraded-recovery event without exposing source content. It MUST not block automatic checkout, and manual bootstrap MAY succeed when the default environment was created successfully.
- If the source is readable but publishing the recovered target fails because of an operational I/O or permission error, bootstrap MUST not leave a partial target file. Automatic bootstrap MUST warn and return control to Git; manual bootstrap MUST return non-zero.
- Verification: `VER-WTENV-009`.

### REQ-WTENV-010 - Failure boundaries

- The automatic `post-checkout` wrapper MUST keep its existing non-blocking behavior: an environment recovery failure reports the failed phase and the manual recovery command, then exits successfully from the hook wrapper.
- The manual entrypoint MUST preserve strict failure signaling for damaged target files and operational copy/publish failures.
- Failure output MUST not reveal secret-like values or source file contents.
- No bootstrap path may start a long-lived development server as part of this contract.
- Verification: `VER-WTENV-010`.

### REQ-WTENV-011 - Atomicity, concurrency, and repeat execution

- Two concurrent bootstrap processes targeting the same missing `.env.local` MUST publish at most one complete target file. A process that loses the race MUST re-read and preserve the winner's file rather than truncating, merging, or overwriting it.
- Temporary files MUST not become the visible target environment, and failed publication MUST clean up or safely abandon only its private temporary artifact.
- Port allocation MUST reuse the existing lock-protected per-scope registry behavior so concurrent invocations do not create conflicting leases for the same target scope.
- Repeated `--force` execution MUST be idempotent: it may validate and re-register the existing target values, but it MUST not copy, normalize, or overwrite the target file.
- Verification: `VER-WTENV-011`.

### REQ-WTENV-012 - Historical revisions and unusual Git layouts

- The current target checkout's bootstrap runner and library MUST be the only implementation source for that invocation.
- If the current revision lacks the runner or required helper, the hook path MUST safely no-op or warn and MUST not borrow an older script from the primary worktree or another worktree.
- Prunable non-primary worktrees, custom Git directories, and changed primary paths MUST not cause bootstrap to select an unintended environment source.
- These conditions MUST degrade to safe fallback, warning, or no-op according to the entrypoint failure boundary; they MUST not make `git worktree add` fail solely because environment recovery is unavailable.
- Verification: `VER-WTENV-012`.

## Verification

### VER-WTENV-001

- Method: Exercise both the real `post-checkout` first-checkout path and the explicit manual entrypoint against a primary worktree and a linked target; also run the dry-run path.
- covers: `REQ-WTENV-001`
- Pass condition: Only a first linked-worktree checkout performs automatic recovery; primary setup remains default generation; manual and automatic paths share environment semantics; dry-run makes no file, registry, or marker mutation.

### VER-WTENV-002

- Method: Create a temporary repository with a primary worktree on a non-`main` branch, several linked worktrees, and a prunable secondary record; invoke recovery from a linked target.
- covers: `REQ-WTENV-002`
- Pass condition: The first valid non-bare worktree is the only source candidate; branch names and secondary worktrees do not change selection; an unavailable primary selects fallback rather than another worktree.

### VER-WTENV-003

- Method: Place a synthetic source `.env.local` beside decoy ignored files and content directories in the primary fixture, then inspect the target after recovery.
- covers: `REQ-WTENV-003`
- Pass condition: Only `.env.local` contributes configuration; no database, content, dependency, hook, or other ignored file is copied.

### VER-WTENV-004

- Method: Run a real linked-worktree first checkout with a readable synthetic source env and with no source env.
- covers: `REQ-WTENV-004`
- Pass condition: A readable source produces a target baseline with all non-port settings retained; no source produces the normal generated default with a target lease.

### VER-WTENV-005

- Method: Pre-create target files containing custom ports, custom relative and absolute paths, comments, unknown variables, legacy `PORT`-only content, and a damaged file; run automatic and forced manual bootstrap.
- covers: `REQ-WTENV-005`
- Pass condition: Usable target files are byte-for-byte preserved and not normalized; legacy content remains accepted; damaged or non-regular paths are preserved and never replaced.

### VER-WTENV-006

- Method: Test unreadable, empty, missing-port, non-numeric-port, and explicitly invalid derived-port fixtures for both source and target roles.
- covers: `REQ-WTENV-006`
- Pass condition: Damaged targets remain untouched and produce strict manual failure / automatic warning; unusable sources trigger default fallback without copying their contents.

### VER-WTENV-007

- Method: Use a synthetic secret marker in a temporary source env, capture bootstrap output, inspect the recovered file mode, and review repository docs and test fixtures.
- covers: `REQ-WTENV-007`
- Pass condition: The marker is present only in the recovered local file, never in output or committed documentation; target permissions are owner-only or stricter; no real credential is used.

### VER-WTENV-008

- Method: Give the primary synthetic env its own ports and worktree paths, then recover multiple linked targets and inspect the effective env and registry leases.
- covers: `REQ-WTENV-008`
- Pass condition: Each target has a distinct leased port block; only the three port keys differ from the source baseline; database/content/source values retain their source text; existing target ports remain unchanged.

### VER-WTENV-009

- Method: Simulate missing primary, missing source file, unusable source file, and publication permission failure.
- covers: `REQ-WTENV-009`
- Pass condition: Discovery/source absence falls back to a generated target env; publication failure leaves no partial target and differs by automatic warning versus manual non-zero status.

### VER-WTENV-010

- Method: Inject environment-phase and copy/publish failures through the existing test seam and invoke both hook and manual paths.
- covers: `REQ-WTENV-010`
- Pass condition: Hook checkout remains successful with a non-sensitive recovery hint; manual execution exposes failure; no long-lived server is started.

### VER-WTENV-011

- Method: Start concurrent bootstrap processes against one missing target, then repeat normal hook, forced manual, and dry-run invocations while inspecting target bytes, temporary artifacts, marker state, and registry rows.
- covers: `REQ-WTENV-011`
- Pass condition: One complete target file wins without overwrite or mixture, the target scope has no conflicting port lease, repeats are idempotent, and dry-run remains non-mutating.

### VER-WTENV-012

- Method: Run a fixture from a historical revision without the current runner, alter primary path metadata, and include prunable secondary worktrees and separate Git directories.
- covers: `REQ-WTENV-012`
- Pass condition: Recovery uses only the current target revision, safely no-ops or warns when unavailable, never borrows an old script, and never blocks checkout because the recovery source is unavailable.

## Related ADRs

- [ADR 0012 - Linked Worktree Environment Recovery](../../adr/0012-linked-worktree-env-recovery.md)

## Visual Evidence

- None

## References

- [Linked worktree bootstrap contract](../../solutions/worktree/worktree-bootstrap-contract.md)
- [Repository worktree bootstrap guidance](../../../README.md#worktree-bootstrap)
- [Bootstrap entrypoint](../../../scripts/worktree-bootstrap.sh)
- [Post-checkout wrapper](../../../scripts/post-checkout-worktree-bootstrap.sh)
- [Bootstrap common library](../../../scripts/lib/worktree-bootstrap-common.sh)
- [Port registry](../../../scripts/port-registry.py)
- [Bootstrap smoke test](../../../scripts/test-worktree-bootstrap.sh)
- [Worktree bootstrap Topic](https://github.com/IvanLi-CN/style-playbook-skills/blob/main/skills/style-playbook/references/topics/worktree-bootstrap/TOPIC.md)
