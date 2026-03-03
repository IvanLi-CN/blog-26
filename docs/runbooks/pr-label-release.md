# PR + Label Release Runbook

This runbook documents the label-driven release workflow for `IvanLi-CN/blog-25`.

## Required PR labels

Each PR targeting `main` must have exactly one `type:*` and exactly one `channel:*` label.

### `type:*`

- `type:major`
- `type:minor`
- `type:patch`
- `type:docs`
- `type:skip`

### `channel:*`

- `channel:stable`
- `channel:rc`

Unknown `type:*` or `channel:*` labels fail the `PR Label Gate` check.

## Release matrix

| type | channel | should release | Git tag | GitHub Release | GHCR tags |
|---|---|---|---|---|---|
| `type:major`/`type:minor`/`type:patch` | `channel:stable` | yes | `vX.Y.Z` | prerelease = false | `vX.Y.Z` (+ `latest` only when commit is current `main` head) |
| `type:major`/`type:minor`/`type:patch` | `channel:rc` | yes | `vX.Y.Z-rc.<sha7>` | prerelease = true | `vX.Y.Z-rc.<sha7>` |
| `type:docs`/`type:skip` | `channel:stable` or `channel:rc` | no | none | none | none |

## Workflow behavior

1. `CI/CD Pipeline` runs on PR and push.
2. `release.yml` triggers on successful `workflow_run` for `main`.
3. `prepare` resolves release intent by the triggering commit SHA, even when `main` has already moved forward.
4. `prepare` verifies no post-merge mutations on release labels (`type:*` / `channel:*`), then resolves release intent from merged PR labels.
5. If `should_release=false`, workflow exits with summary only.
6. If `should_release=true`, it computes tag/version and publishes:
   - tag
   - GitHub Release
   - GHCR image tags based on channel (`latest` only when the release commit is current `main` head, re-checked again right before publish)

## Stable release drill (manual)

Use this flow when you want to validate the full stable publish path end-to-end.

1. Open a PR to `main` with labels: `type:patch` + `channel:stable`.
2. Wait for required checks to pass (`PR Label Gate` + `CI/CD Pipeline`).
3. Merge PR and wait for:
   - `CI/CD Pipeline` (push on `main`)
   - `Release (PR Label Driven)` (`workflow_run`)
4. Verify outputs:
   - a new stable tag `vX.Y.Z`
   - a GitHub Release with `prerelease=false`
   - GHCR tags `vX.Y.Z` and `latest` (only when release commit is current `main` head)

## Troubleshooting

### `PR Label Gate` failed

- Check PR has one and only one `type:*` + `channel:*`.
- Remove conflicting labels before re-running checks.

### Release skipped unexpectedly

- Open release workflow logs and inspect `reason` output from `release-intent.sh`.
- Common reasons:
  - `ambiguous_or_missing_pr`
  - `pr_not_merged_or_missing_merged_at`
  - `intent_skip`

### Release failed in `prepare`

- This is fail-fast by design to avoid silent wrong releases.
- Common failure reasons:
  - `invalid_label_count(...)`
  - `unknown_label(...)`
  - `post_merge_label_mutation(...)`
  - `api_failure:pr_issue_events(page=...)`
  - `api_failure:pr_issue_events_page_limit(...)`
  - `api_failure:*`

### Version/tag not as expected

- Confirm stable tags history (`git tag -l 'v*'`).
- Confirm merged PR `type:*` bump level.
- For reruns, tag reuse is expected when tag already points at HEAD.

## Branch protection recommendation

Require these checks on `main`:

- `PR Label Gate / Release intent label gate`
- `CI/CD Pipeline` (or required jobs inside it)
