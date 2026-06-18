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
9. After all expected publish jobs succeed, the workflow best-effort upserts one managed PR `Release Receipt` comment through the PR conversation comment path.

## PR release receipt comment

- A successful release run keeps exactly one managed PR comment as the release receipt.
- Reruns and manual `workflow_dispatch` backfills update the same comment instead of creating a new one.
- The receipt includes:
  - PR link
  - release `head_sha`
  - trigger kind (`workflow_run` or `workflow_dispatch`)
  - `intent_type`
  - `channel`
  - actual `release:*` targets
  - actual component release tags with GitHub Release links
  - plain `ghcr.io/<repo>:v*` image ref
  - workflow run URL
  - last-updated timestamp
- `Pages` is reported only for `frontend` releases:
  - `deployed` with the Pages URL when the deploy step actually ran
  - `skipped` with an explicit reason when the deploy contract intentionally skipped because the commit was no longer the latest `main` head
- The receipt is not written when:
  - `should_release=false`
  - the merged PR cannot be resolved uniquely
  - `pr_number` is missing
  - any expected publish job failed
- If GitHub rejects the comment write itself, the workflow summary records `permission_blocked` or `failed_soft`, but the release run stays green when all publish jobs succeeded.

## Permissions and required-check note

- The release workflow now requests PR comment write permissions because GitHub can reject PR conversation writes from `workflow_run` jobs unless the token carries explicit comment scopes.
- The receipt step is still best-effort: a PR comment write failure must not turn a successful artifact release into a failed release run.
- This repository context cannot prove GitHub-side branch protection or ruleset state because the private-repo API is restricted here. Repository admins still need to verify that `PR Label Gate` is configured as a required check if label-driven release intent is meant to stay protected.

## Frontend content bundle

- Store the bundle URL in GitHub secrets as `PUBLIC_CONTENT_BUNDLE_URL`.
- Preferred value: `https://ivanli.cc/api/public/snapshot`.
- If the live snapshot endpoint is not wired to the public mirror yet, use the repo-hosted fallback bundle instead: `https://raw.githubusercontent.com/IvanLi-CN/blog-26/public-content-bundle/public-bundles/live/public-snapshot.json`.
- The URL may contain an embedded token; do not expose it in `PUBLIC_*` client config.
- Configure these repository variables for GitHub Pages frontend releases:
  - `PUBLIC_SITE_URL=https://ivanli.cc`
  - `PUBLIC_SITE_BASE_PATH=/`
  - `PUBLIC_API_BASE_URL=https://ivanli.cc`
- `PUBLIC_API_BASE_URL=https://ivanli.cc` is only valid when the public domain already routes same-origin anonymous backend traffic, including `/api/public/assets/*`, to the live gateway.
- The frontend release remains a static `site-dist` build. Public images, GIF derivatives, video posters, and playback URLs are not bundled into static assets; they continue to depend on the live same-origin `/api/public/assets/*` facade.
- If old project-Pages variables are still present, the workflow auto-normalizes them to the `public/CNAME` custom domain during release.
- The workflow can consume either:
  - a raw `public-snapshot.json`, or
  - an archive containing `public-snapshot.json`
- Pages runtime requests use `PUBLIC_API_BASE_URL`, and it must point at the live backend origin.
- A release is incomplete if `site-dist` points at `/api/public/assets/*` but the public entrypoint does not actually forward those requests to the live backend/gateway.
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
  - receipt summary `action=skipped` when publish success conditions were not met

### Release failed in `prepare`

- Common failure reasons:
  - `invalid_label_count(...)`
  - `unknown_label(...)`
  - `post_merge_label_mutation(...)`
  - component major mismatch

### Frontend build failed

- Verify `PUBLIC_CONTENT_BUNDLE_URL` is configured and downloadable from Actions.
- Confirm the bundle contains `public-snapshot.json`.
- Confirm `PUBLIC_API_BASE_URL` points at the live backend/gateway origin that really serves anonymous `/api/public/*` and `/api/public/assets/*` traffic.
- Confirm the live imagor deployment also allows internal HTTP source fetches from the blog service, including `HTTP_LOADER_BLOCK_PRIVATE_NETWORKS=0` for the `blog:25090` internal-source model.
- Confirm the published `site-dist` also contains `watermark-ivanli.svg`, and the public entrypoint serves `https://ivanli.cc/watermark-ivanli.svg` directly from the same-origin static surface.
- Confirm `PUBLIC_SITE_URL` and `PUBLIC_SITE_BASE_PATH` match the custom-domain target (`https://ivanli.cc` + `/`).

### Unified Docker image missing expected assets

- Verify `PUBLIC_CONTENT_BUNDLE_URL` is set or `site/generated/public-snapshot.json` exists before running a local Docker build.
- Verify the Docker build generated `site-dist/`, `admin-dist/`, and `backend-dist/`.
- Verify Docker runtime health at `/api/health`; site status should be `ok` with `site.mode=static`.
- Verify the container also serves at least one real `/api/public/assets/*` URL from the generated public content set; `/api/health` alone is not sufficient.
- Verify the container serves `/watermark-ivanli.svg` from `site-dist`; imagor watermark fetches depend on that same-origin static file.
- Verify the image was pushed as `vX.Y.Z` / `vX.Y.Z-rc.<sha7>` and not as any `backend-*` tag.

### Release receipt comment missing or stale

- Check the `Release receipt comment` section in the workflow summary:
  - `action=skipped` means the workflow intentionally did not write a success receipt
  - `action=permission_blocked` means GitHub rejected PR comment writes for this run context
  - `action=failed_soft` means the comment upsert path itself failed, but release artifacts were still published
- Confirm the workflow had a resolved merged PR number and all expected publish jobs succeeded.
- Confirm the release workflow still carries comment-write permissions for the dedicated receipt step.
- If multiple historical managed receipt comments exist, rerun the release once; the managed update step should keep the newest one and delete duplicates.
