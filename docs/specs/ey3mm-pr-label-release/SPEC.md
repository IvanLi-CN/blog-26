# SPEC: PR + Label Driven Release

- Spec ID: `ey3mm`
- Status: `in-progress`
- Last Updated: `2026-03-03`
- Owner: `main-agent`

## 1. Background

Current CI pushes Docker images directly on `main`/`nextjs` with `latest` and `sha` tags.
That path is not explicit about release intent and does not encode stable vs RC channel decisions.

We need a deterministic release contract driven by PR labels, aligned with existing style references:

- `style-playbook/references/tags/pr-label-release.md`
- `dockrev`: label gate + release intent + compute version pattern
- `catnap`: release assets + container publish wiring

## 2. Goals

1. Use PR labels as the single source of truth for release intent.
2. Separate CI quality checks from release publishing.
3. Produce deterministic tags/releases/images for stable and RC channels.
4. Keep reruns idempotent.

## 3. Non-goals

- No runtime API behavior change for the blog application.
- No new publishing platform beyond GitHub Releases + GHCR.
- No change to `.github/workflows/e2e.yml`.

## 4. Contract

### 4.1 PR label contract (hard gate)

- Exactly one `type:*` label is required:
  - release labels: `type:patch`, `type:minor`, `type:major`
  - skip labels: `type:docs`, `type:skip`
- Exactly one `channel:*` label is required:
  - `channel:stable`
  - `channel:rc`
- Unknown `type:*` or `channel:*` labels fail the gate.

### 4.2 Version and artifacts

- Stable tag: `vX.Y.Z`
- RC tag: `vX.Y.Z-rc.<sha7>`
- GitHub Release:
  - stable => `prerelease=false`
  - rc => `prerelease=true`
- GHCR image tags:
  - stable => `:vX.Y.Z`, and update `:latest` only when the release commit is the current `main` head
  - rc => `:vX.Y.Z-rc.<sha7>` only

### 4.3 Release trigger

- Trigger by `workflow_run` of `"CI/CD Pipeline"` on `main`, only when `conclusion=success`.
- If release intent resolves to skip, release workflow exits cleanly with summary.

## 5. Implementation decisions

1. Add dedicated `label-gate.yml` workflow for early PR failure.
2. Add `.github/scripts/release-intent.sh`:
   - skip non-latest `main` commits to avoid out-of-order releases
   - map commit SHA to PR via `/commits/{sha}/pulls`
   - require exactly one PR; otherwise conservative skip
   - evaluate labels and export outputs:
     `should_release`, `bump_level`, `channel`, `intent_type`, `pr_number`, `pr_url`, `reason`
3. Add `.github/scripts/compute-version.sh`:
   - find max stable semver tag (`v?X.Y.Z`)
   - fallback to `package.json` version when no stable tags exist
   - apply `BUMP_LEVEL`
   - generate stable/rc release tag from `CHANNEL`
   - reuse tag already pointing at HEAD for idempotency
4. Add `release.yml` with two jobs:
   - `prepare`: resolve intent, compute tag, create tag if missing
   - `publish`: build/push Docker image and create/update GitHub Release
5. Convert CI docker job to build-only (no registry login, no push).

## 6. Acceptance criteria

1. Label gate behavior:
   - missing `channel:*` fails
   - conflicting `type:*` fails
   - conflicting `channel:*` fails
   - unknown `type:*`/`channel:*` fails
2. Release behavior:
   - `type:patch + channel:stable` => stable tag/release + `latest`
   - `type:minor + channel:rc` => rc tag/release + rc image only
   - `type:skip + channel:stable` => no tag/release/image
3. Rerun behavior:
   - same HEAD rerun reuses existing matching tag and does not double-bump.

## 7. Risks and rollback

### Risks

- Commit-to-PR mapping can be ambiguous for edge merge workflows.
- Label misuse can block release unexpectedly.
- First release with no historical stable tag depends on `package.json` version baseline.

### Mitigations

- resolve release intent strictly by triggering commit SHA (do not skip only because branch head advanced)
- use per-run concurrency keys on CI push/release workflow runs so intermediate commits are not dropped in queue churn
- re-check branch head right before publish; only then allow stable `latest` update
- fail-fast for `unknown_label` / `invalid_label_count` in release prepare job to prevent silent skips when gate drifts
- block release when release labels (`type:*`/`channel:*`) are mutated after PR merge (`post_merge_label_mutation`) to keep merge-time intent stable
- Conservative skip with explicit `reason` output for ambiguity.
- Required check policy includes `PR Label Gate`.
- Runbook documents label matrix and troubleshooting.

### Rollback

- Disable `release.yml` and restore CI docker push path by reverting workflow changes.
- Keep label gate in place if desired, or remove `label-gate.yml` in same rollback.
