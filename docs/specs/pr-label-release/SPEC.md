# SPEC: Component-Aware PR Label Release

- Spec ID: `ey3mm`
- Status: `in-progress`
- Owner: `main-agent`

## Related ADRs

- None

## 1. Background

The repository now has two independently deployable surfaces:

1. `frontend`: the public Astro site, shipped as static assets to EdgeOne Makers, with GitHub Pages retained as a hot standby.
2. `backend`: the API/runtime plus admin SPA, shipped as GitHub Release artifacts.
3. unified Docker image: the production container containing the public Astro site, backend runtime, and admin SPA.

The old single-track `vX.Y.Z` release contract is no longer sufficient because frontend and backend can release independently while still needing coordinated major-version compatibility.

## 2. Goals

1. Keep PR labels as the single source of truth for release intent.
2. Allow `frontend` and `backend` to publish independently from the same merged PR.
3. Give each component its own semver/tag lineage while enforcing matching major versions.
4. Move public-site generation fully to CI build time and deploy it from prebuilt static assets.
5. Publish a unified Docker image for any frontend or backend release without using backend-prefixed image tags.

## 3. Non-goals

- No change to public information architecture or admin feature behavior.
- No second backend image; admin SPA and backend runtime stay in one Docker image.
- No runtime public-site SSG inside the Docker image; public pages are served from prebuilt static assets.

## 4. Contract

### 4.1 PR label contract (hard gate)

Each PR targeting `main` must have:

- exactly one `type:*`
  - release intents: `type:patch`, `type:minor`, `type:major`
  - skip intents: `type:docs`, `type:skip`
- exactly one `channel:*`
  - `channel:stable`
  - `channel:rc`
- when the intent is a release (`patch|minor|major`), at least one `release:*`
  - `release:frontend`
  - `release:backend`
  - `type:major` is only valid when both target labels are present

Unknown `type:*`, `channel:*`, or `release:*` labels fail the gate.

### 4.2 Component versioning

- Frontend stable tag: `frontend-vX.Y.Z`
- Frontend RC tag: `frontend-vX.Y.Z-rc.<sha7>`
- Backend stable tag: `backend-vX.Y.Z`
- Backend RC tag: `backend-vX.Y.Z-rc.<sha7>`

Version bumps are computed only from the tag history of the target component.

Major-version compatibility rule:

- when both components release from the same PR, the computed frontend and backend majors must match
- when only one component releases, its computed major must match the latest stable major of the other component
- therefore, single-component releases are limited to changes that stay within the already-published shared major

### 4.3 Mainline source contract

- The release workflow only accepts the exact current `main` head SHA as its release source.
- `workflow_run` releases use the completed `main` push SHA; manual `workflow_dispatch` requires the same current `main` head SHA as input.
- A stale or non-main SHA fails in `prepare` before any tag, release artifact, container image, Pages deployment, or EdgeOne deployment is created. Each release side effect rechecks the same source immediately before publishing.

### 4.4 Release outputs

Frontend release:

- GitHub Release tagged with the frontend component tag
- prerelease flag mirrors the label channel
- release assets include `frontend-site-dist-<version>.tar.gz` and checksum
- the exact same verified `site-dist` artifact is deployed to EdgeOne Makers and GitHub Pages for `channel:stable`
- `channel:rc` frontend releases publish release assets but do not replace either production frontend host
- the EdgeOne release job consumes only repository secret `EDGEONE_API_TOKEN` and repository variable `EDGEONE_PROJECT_NAME`; its first eligible stable deployment creates the named direct-upload project if it is absent, while custom-domain binding, certificate issuance, and DNS traffic switching remain outside CI

Backend release:

- GitHub Release tagged with the backend component tag
- prerelease flag mirrors the label channel
- release assets include:
  - `backend-runtime-dist-<version>.tar.gz`
  - `backend-admin-dist-<version>.tar.gz`
  - checksum manifest

Unified Docker image release:

- runs when either `release:frontend` or `release:backend` is present
- image version is computed from the plain `vX.Y.Z` / `vX.Y.Z-rc.<sha7>` tag lineage using the same bump and channel intent
- GHCR image tags:
  - always publish `ghcr.io/<repo>:vX.Y.Z` or `ghcr.io/<repo>:vX.Y.Z-rc.<sha7>`
  - additionally publish `ghcr.io/<repo>:latest` only for stable releases whose commit is still the current `main` head
  - never publish `backend-*` image tags

### 4.5 Frontend content source contract

- CI fetches a content bundle from `PUBLIC_CONTENT_BUNDLE_URL`
- the bundle must contain `public-snapshot.json` (directly or inside an archive)
- Astro SSG consumes the snapshot and must not depend on runtime DB or local content directories during release publishing or Docker image startup
- public runtime API/file URLs inside the static site are rewritten against `PUBLIC_API_BASE_URL`, which must be configured to the live backend origin
- Docker image builds must receive a preloaded `site/generated/public-snapshot.json` or fetch one from `PUBLIC_CONTENT_BUNDLE_URL`; they must fail fast instead of falling back to an empty local DB when the snapshot is missing

### 4.6 Docker runtime contract

- The unified Docker image contains `site-dist`, backend runtime bundle, and `admin-dist`
- The Docker container must not run public-site SSG at startup
- Production health reports public-site status as `ok` with `site.mode=static`
- Public-page routes such as `/` and `/posts` are served by the Docker image from `site-dist`

### 4.7 PR release receipt comment contract

- Every successful release run for a merged PR upserts exactly one managed PR issue comment as the release receipt.
- The managed comment is keyed by repository + PR number through an HTML marker and must be updated in place on rerun or `workflow_dispatch` for the current `main` head instead of appending a new history comment.
- The receipt body must include:
  - PR number + URL
  - release `head_sha`
  - trigger kind (`workflow_run` or `workflow_dispatch`)
  - `intent_type`
  - `channel`
  - actual `release:*` targets
  - actual `frontend-*` / `backend-*` release tags with GitHub Release links when those targets were published
  - plain `ghcr.io/<repo>:v*` image ref when any release target was published
  - GitHub Actions run URL
  - last-updated timestamp
- `Pages` and `EdgeOne Makers` status are reported only for `frontend` releases:
  - `deployed` with the deployed Pages URL when the deploy step actually ran
  - `deployed` for EdgeOne Makers when the verified static artifact upload completes
  - `skipped` with an explicit reason when the workflow intentionally skips production deploy because the release is `channel:rc` or the release commit is no longer the latest `main` head
- The receipt is written only when the current run's expected release outputs all succeeded:
  - `frontend` release => `publish_frontend=success`
  - `backend` release => `publish_backend=success`
  - any release target => `publish_image=success`
  - `deploy_frontend_pages` may be `success` or contractually `skipped`
  - `deploy_frontend_edgeone` may be `success` or contractually `skipped`
- No receipt is written for `should_release=false`, ambiguous/missing merged PR resolution, missing PR number, or any failed expected publish job.
- The receipt comment path is best-effort and must not flip an otherwise successful release run to failed:
  - permission or API failures are surfaced in the workflow summary as `permission_blocked` / `failed_soft`
  - release tags, releases, EdgeOne and Pages deploys, and Docker publish remain the release workflow's source-of-truth outcome

## 5. Implementation decisions

1. Extend `label-gate.yml` and `release-intent.sh` to understand `release:frontend` / `release:backend`.
2. Make `compute-version.sh` component-aware and derive versions from `frontend-v*` / `backend-v*` tags.
3. Split release publishing into:
   - `publish_frontend` + `deploy_frontend_edgeone` + `deploy_frontend_pages`
   - `publish_backend`
   - `publish_image`
4. Add CI-time content-bundle download for frontend SSG via `PUBLIC_CONTENT_BUNDLE_URL`.
5. Produce a dedicated `backend-dist` runtime bundle and package it with `admin-dist` plus prebuilt `site-dist` in the unified Docker image.
6. Update CI smoke coverage so the Docker image proves:
   - `/api/health` reports `site.status=ok` and `site.mode=static`
   - `/api/public/*` stays available
   - `/posts` is served by the unified Docker image
7. Add a dedicated release-receipt comment step that consumes `prepare` outputs as the only source of receipt truth and upserts the managed PR comment through the issue-comments API.
8. Require the release source SHA to equal the current `main` head before resolving release intent or publishing any output.

## 6. Acceptance criteria

1. Label gate:
   - missing `release:*` for release intents fails
   - unknown `release:*` fails
   - conflicting/missing `type:*` or `channel:*` still fail
2. Frontend-only release:
   - creates only `frontend-*` tag/release
   - deploys the same static artifact to EdgeOne Makers and GitHub Pages
   - publishes the unified Docker image with a plain `v*` image tag
3. Backend-only release:
   - creates only `backend-*` tag/release
   - publishes backend/admin release artifacts
   - publishes the unified Docker image with a plain `v*` image tag
   - does not deploy Pages
4. Combined release:
   - both component release paths execute from the same merged PR
   - versions may differ in minor/patch/prerelease but majors must match
5. Runtime packaging:
   - Docker image starts without runtime public-site build
   - `/api/health` stays healthy and reports `site.status=ok`
   - `/posts` is served from bundled static assets
6. Release receipt comment:
   - a successful release run creates or updates exactly one managed PR receipt comment
   - rerun and `workflow_dispatch` backfill update the same managed comment instead of creating a second one
   - the comment shows only the actual outputs from the current run
   - the comment is omitted when any expected publish job fails or when release intent is skipped
   - `Pages` and `EdgeOne Makers` are reported as `deployed` or explicit `skipped`, not guessed from release intent alone
   - receipt permission/API failures are reported as non-blocking summary states and do not mark the release run itself failed
7. A manual dispatch or delayed release run for a stale or non-main SHA fails before it can publish an artifact, tag, image, Pages deployment, or EdgeOne deployment.

## 7. Risks and rollback

### Risks

- Component tag history can drift if tags are edited manually.
- Frontend releases depend on availability and correctness of `PUBLIC_CONTENT_BUNDLE_URL`.
- EdgeOne Makers, GitHub Pages, backend artifact releases, and unified Docker image releases now have partially independent failure modes.
- Managed receipt comments can drift if repository permissions stop allowing issue-comment updates or if multiple historical managed comments already exist.
- GitHub may still deny PR comment writes in some `workflow_run` contexts even when the workflow requests comment permissions.

### Mitigations

- Validate release intent and major alignment before any tag is pushed.
- Fail fast when the content bundle cannot be downloaded or does not contain `public-snapshot.json`.
- Keep release jobs idempotent by reusing existing matching tags on rerun.
- Preserve explicit workflow summaries for skip/failure reasons.
- Keep the EdgeOne project type as direct upload so the workflow can publish the verified artifact without a second build.
- Deduplicate managed receipt comments during update and scope write permission to the dedicated receipt job.
- Treat the receipt upsert as best-effort so a comment-permission regression cannot block actual artifact publication.
- Repository admins still need GitHub-side proof that `PR Label Gate` is configured as a required check; the workflow/spec cannot prove that from within this private repo context.

### Rollback

- Revert the EdgeOne deployment job and artifact handoff together if the secondary frontend publisher must be removed.
- Restore the previous backend-only image workflow only if Docker no longer needs to serve the public site.
