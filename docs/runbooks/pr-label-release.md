# PR + Label Release Runbook

This runbook documents the component-aware label-driven release workflow for this repository.

## Required PR labels

Each PR targeting `main` must have exactly one `type:*`, exactly one `channel:*`, and at least one `release:*` when release intent is enabled.

### `type:*`

- `type:docs`
- `type:skip`
- `type:patch`
- `type:minor`
- `type:major`

### `channel:*`

- `channel:stable`
- `channel:rc`

### `release:*`

- `release:frontend`
- `release:backend`

Unknown `type:*`, `channel:*`, or `release:*` labels fail the `PR Label Gate` check.

## Release matrix

| labels | should release | Git tag | GitHub Release | Additional publish |
|---|---|---|---|---|
| `type:*` + `channel:stable` + `release:frontend` | yes | `frontend-vX.Y.Z` | stable frontend release | deploy GitHub Pages |
| `type:*` + `channel:rc` + `release:frontend` | yes | `frontend-vX.Y.Z-rc.<sha7>` | prerelease frontend release | deploy GitHub Pages |
| `type:*` + `channel:stable` + `release:backend` | yes | `backend-vX.Y.Z` | stable backend release | GHCR `backend-vX.Y.Z` (+ `backend-latest` only when commit is current `main` head) |
| `type:*` + `channel:rc` + `release:backend` | yes | `backend-vX.Y.Z-rc.<sha7>` | prerelease backend release | GHCR `backend-vX.Y.Z-rc.<sha7>` |
| both `release:frontend` + `release:backend` | yes | both component tags | both component releases | Pages + GHCR |

> `type:major` is only valid when both `release:frontend` and `release:backend` are present. Single-component majors are rejected before release so the shared major version cannot drift.
| `type:docs`/`type:skip` | no | none | none | none |

## Version contract

- `frontend` and `backend` keep independent semver histories.
- CI validates that both components always share the same **major** version.
- If only one component is being released, its major version is checked against the latest stable major tag of the other component (falling back to `package.json` major when no stable component tag exists yet).

## Workflow behavior

1. `CI/CD Pipeline` runs on PR and push.
2. `release.yml` triggers on successful `workflow_run` for `main`.
3. `prepare` resolves release intent by the triggering commit SHA, even when `main` has already moved forward.
4. `prepare` verifies no post-merge mutations on release labels (`type:*` / `channel:*` / `release:*`), then resolves release intent from merged PR labels.
5. If `should_release=false`, workflow exits with summary only.
6. If `release:frontend` is present, the workflow:
   - downloads `PUBLIC_CONTENT_BUNDLE_URL`
   - reuses the bundled `public-snapshot.json`
   - builds `site-dist`
   - uploads frontend release assets
   - deploys the same build output to GitHub Pages
7. If `release:backend` is present, the workflow:
   - builds `admin-dist`
   - prepares `backend-dist`
   - uploads backend release assets
   - builds and pushes the backend/admin Docker image to GHCR

## Frontend content bundle

- Store the bundle URL in GitHub secrets as `PUBLIC_CONTENT_BUNDLE_URL`.
- The URL may contain an embedded token; do not expose it in `PUBLIC_*` client config.
- Configure these repository variables for GitHub Pages frontend releases:
  - `PUBLIC_SITE_URL=https://ivanli-cn.github.io/blog-26`
  - `PUBLIC_SITE_BASE_PATH=/blog-26`
  - `PUBLIC_API_BASE_URL=https://blog.ivanli.cc`
- The workflow can consume either:
  - a raw `public-snapshot.json`, or
  - an archive containing `public-snapshot.json`
- Pages runtime requests use `PUBLIC_API_BASE_URL`, and it must point at the live backend origin.
- The first-phase deployment target is the default project Pages URL above; custom domains and EO path splitting stay out of scope.

## Troubleshooting

### `PR Label Gate` failed

- Check PR has one and only one `type:*` + `channel:*`.
- Check at least one valid `release:*` label exists for release-bearing PRs.
- Remove conflicting or unknown labels before re-running checks.

### Release skipped unexpectedly

- Open release workflow logs and inspect `reason` output from `release-intent.sh`.
- Common reasons:
  - `ambiguous_or_missing_pr`
  - `pr_not_merged_or_missing_merged_at`
  - `intent_skip`

### Release failed in `prepare`

- Common failure reasons:
  - `invalid_label_count(...)`
  - `unknown_label(...)`
  - `post_merge_label_mutation(...)`
  - component major mismatch

### Frontend build failed

- Verify `PUBLIC_CONTENT_BUNDLE_URL` is configured and downloadable from Actions.
- Confirm the bundle contains `public-snapshot.json`.
- Confirm `PUBLIC_API_BASE_URL` points to the backend origin if the Pages site must call backend APIs cross-origin.
- Confirm `PUBLIC_SITE_URL` and `PUBLIC_SITE_BASE_PATH` match the project Pages target (`https://ivanli-cn.github.io/blog-26` + `/blog-26`).

### Backend image missing expected assets

- Verify `bun run backend:build` generated both `admin-dist/` and `backend-dist/`.
- Verify Docker runtime health at `/api/health`; site status should be `external`, not `down`.
