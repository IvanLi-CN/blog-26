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
| `type:*` + `channel:stable` + `release:frontend` | yes | `frontend-vX.Y.Z` + `vX.Y.Z` | stable frontend release | deploy GitHub Pages + GHCR `vX.Y.Z` (+ `latest` only when commit is current `main` head) |
| `type:*` + `channel:rc` + `release:frontend` | yes | `frontend-vX.Y.Z-rc.<sha7>` + `vX.Y.Z-rc.<sha7>` | prerelease frontend release | GHCR `vX.Y.Z-rc.<sha7>` |
| `type:*` + `channel:stable` + `release:backend` | yes | `backend-vX.Y.Z` + `vX.Y.Z` | stable backend release | backend artifacts + GHCR `vX.Y.Z` (+ `latest` only when commit is current `main` head) |
| `type:*` + `channel:rc` + `release:backend` | yes | `backend-vX.Y.Z-rc.<sha7>` + `vX.Y.Z-rc.<sha7>` | prerelease backend release | backend artifacts + GHCR `vX.Y.Z-rc.<sha7>` |
| both `release:frontend` + `release:backend` | yes | both component tags + image tag | both component releases | Pages + backend artifacts + GHCR |

> `type:major` is only valid when both `release:frontend` and `release:backend` are present. Single-component majors are rejected before release so the shared major version cannot drift.
| `type:docs`/`type:skip` | no | none | none | none |

## Version contract

- `frontend` and `backend` keep independent semver histories.
- The unified Docker image keeps a plain `vX.Y.Z` / `vX.Y.Z-rc.<sha7>` semver history.
- CI validates that both components always share the same **major** version.
- If only one component is being released, its major version is checked against the latest stable major tag of the other component (falling back to `package.json` major when no stable component tag exists yet).
- GHCR image tags never use `backend-*`; stable releases may update `latest`, prereleases never do.

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
8. If either release target is present, the workflow:
   - downloads `PUBLIC_CONTENT_BUNDLE_URL`
   - builds a unified Docker image containing `site-dist`, `backend-dist`, and `admin-dist`
   - pushes the image to GHCR with the plain `v*` tag, and `latest` for current-head stable releases

## Frontend content bundle

- Store the bundle URL in GitHub secrets as `PUBLIC_CONTENT_BUNDLE_URL`.
- Preferred value: `https://ivanli.cc/api/public/snapshot`.
- If the live snapshot endpoint is not wired to the public mirror yet, use the repo-hosted fallback bundle instead: `https://raw.githubusercontent.com/IvanLi-CN/blog-26/public-content-bundle/public-bundles/live/public-snapshot.json`.
- The URL may contain an embedded token; do not expose it in `PUBLIC_*` client config.
- Configure these repository variables for GitHub Pages frontend releases:
  - `PUBLIC_SITE_URL=https://ivanli.cc`
  - `PUBLIC_SITE_BASE_PATH=/`
  - `PUBLIC_API_BASE_URL=https://ivanli.cc`
- If old project-Pages variables are still present, the workflow auto-normalizes them to the `public/CNAME` custom domain during release.
- The workflow can consume either:
  - a raw `public-snapshot.json`, or
  - an archive containing `public-snapshot.json`
- Pages runtime requests use `PUBLIC_API_BASE_URL`, and it must point at the live backend origin.
- The primary deployment target is the `ivanli.cc` custom domain. The raw `ivanli-cn.github.io/blog-26` URL is only a fallback/debug path.
- Local unified Docker builds also require the public snapshot. `bun run docker:build` fetches it when `PUBLIC_CONTENT_BUNDLE_URL` is set, reuses `site/generated/public-snapshot.json` when present, and otherwise fails before Docker starts so the build cannot silently read an empty local DB.

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
- Confirm `PUBLIC_SITE_URL` and `PUBLIC_SITE_BASE_PATH` match the custom-domain target (`https://ivanli.cc` + `/`).

### Unified Docker image missing expected assets

- Verify `PUBLIC_CONTENT_BUNDLE_URL` is set or `site/generated/public-snapshot.json` exists before running a local Docker build.
- Verify the Docker build generated `site-dist/`, `admin-dist/`, and `backend-dist/`.
- Verify Docker runtime health at `/api/health`; site status should be `ok` with `site.mode=static`.
- Verify the image was pushed as `vX.Y.Z` / `vX.Y.Z-rc.<sha7>` and not as any `backend-*` tag.
