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
| `type:major`/`type:minor`/`type:patch` | `channel:stable` | yes | `vX.Y.Z` | prerelease = false | `vX.Y.Z`, `latest` |
| `type:major`/`type:minor`/`type:patch` | `channel:rc` | yes | `vX.Y.Z-rc.<sha7>` | prerelease = true | `vX.Y.Z-rc.<sha7>` |
| `type:docs`/`type:skip` | `channel:stable` or `channel:rc` | no | none | none | none |

## Workflow behavior

1. `CI/CD Pipeline` runs on PR and push.
2. `release.yml` triggers on successful `workflow_run` for `main`.
3. `prepare` job resolves release intent from merged PR labels.
4. If `should_release=false`, workflow exits with summary only.
5. If `should_release=true`, it computes tag/version and publishes:
   - tag
   - GitHub Release
   - GHCR image tags based on channel

## Troubleshooting

### `PR Label Gate` failed

- Check PR has one and only one `type:*` + `channel:*`.
- Remove conflicting labels before re-running checks.

### Release skipped unexpectedly

- Open release workflow logs and inspect `reason` output from `release-intent.sh`.
- Common reasons:
  - `ambiguous_or_missing_pr`
  - `invalid_label_count`
  - `unknown_label`
  - `intent_skip`

### Version/tag not as expected

- Confirm stable tags history (`git tag -l 'v*'`).
- Confirm merged PR `type:*` bump level.
- For reruns, tag reuse is expected when tag already points at HEAD.

## Branch protection recommendation

Require these checks on `main`:

- `PR Label Gate / Release intent label gate`
- `CI/CD Pipeline` (or required jobs inside it)
