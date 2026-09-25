# SPEC: Component-Aware PR Label Release

- Spec ID: `ey3mm`
- Status: `in-progress`
- Owner: `main-agent`

## Related ADRs

- [ADR 0008](../../adr/0008-ci-dependency-freshness-policy.md)

## Context and Scope

This spec owns the label-driven release workflow and the CI quality gates that must pass before that workflow can publish frontend, backend, unified-image, or EdgeOne outputs. It covers reproducible installation, functional validation, release intent, and current-main source integrity. It does not own dependency upgrade scheduling or vulnerability scanning policy.

## Requirements

- `REQ-CI-FRESHNESS`: CI MUST NOT execute `bun outdated` or fail because a newer registry version exists.
- `REQ-CI-REPRODUCIBLE`: CI MUST keep `bun install --frozen-lockfile` as a blocking reproducible-installation check.
- `REQ-CI-FUNCTIONAL`: CI MUST keep lint, unit, worktree bootstrap, build, and Docker smoke checks as blocking functional gates.
- `REQ-RELEASE-INTENT`: Release publication MUST use the validated PR `type:*`, `channel:*`, and `release:*` label contract.
- `REQ-RELEASE-CURRENT-MAIN`: Release publication MUST use the exact current `main` head and MUST reject stale or non-main source SHAs before publication.

## Verification

- `VER-CI-FRESHNESS`: Inspect the CI workflow and run the lint job against a candidate with newer registry versions; covers: `REQ-CI-FRESHNESS`.
- `VER-CI-REPRODUCIBLE`: Run `bun install --frozen-lockfile` and confirm the lockfile remains unchanged; covers: `REQ-CI-REPRODUCIBLE`.
- `VER-CI-FUNCTIONAL`: Run lint, unit, worktree, build, Docker smoke, and applicable E2E checks; covers: `REQ-CI-FUNCTIONAL`.
- `VER-RELEASE-INTENT`: Run the label gate and inspect the release intent resolution for the labeled repair PR; covers: `REQ-RELEASE-INTENT`.
- `VER-RELEASE-CURRENT-MAIN`: Inspect release prepare checks and the post-merge workflow source SHA; covers: `REQ-RELEASE-CURRENT-MAIN`.

## 1. Background

The repository now has two independently deployable surfaces:

1. `frontend`: the public Astro site, shipped as static assets plus Makers proxy functions to EdgeOne Makers.
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
- A stale or non-main SHA fails in `prepare` before any tag, release artifact, container image, or EdgeOne deployment is created. Each release side effect rechecks the same source immediately before publishing.

### 4.4 Release outputs

Frontend release:

- GitHub Release tagged with the frontend component tag
- prerelease flag mirrors the label channel
- release assets include `frontend-site-dist-<version>.tar.gz` and checksum
- the verified `site-dist` output plus `edge-functions` is deployed to EdgeOne Makers for `channel:stable`
- `channel:rc` frontend releases publish release assets but do not replace the production frontend host
- the EdgeOne release job consumes only repository secret `EDGEONE_API_TOKEN` and repository variable `EDGEONE_PROJECT_NAME`; the Makers project's production environment provides `BLOG_BACKEND_ORIGIN=https://api.ivanli.cc` for same-origin `/api/public/*`, `/api/health`, and `/mcp` proxy routes
- custom-domain binding, certificate issuance, and DNS traffic switching remain outside CI, while a bound production domain follows the latest successful Makers production deployment

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

### 4.7 Publication reporting contract

- Release job summaries and publish job results are the source of truth for the actual publication outcome.
- The release-owning agent reports successful publication or failure to the owner after inspecting the release workflow.
- The release workflow does not write a release result comment to the source PR.

### 4.8 CI quality gate contract

- `bun install --frozen-lockfile` remains a blocking check for reproducible dependency installation.
- `bun run check`, unit tests, worktree bootstrap, production build, and Docker smoke checks remain blocking functional quality gates.
- CI does not run `bun outdated`; registry freshness is not a required merge or release gate.
- Dependency declarations and `bun.lock` changes remain independent maintenance work and are not implied by a passing CI run.

## 5. Implementation decisions

1. Extend `label-gate.yml` and `release-intent.sh` to understand `release:frontend` / `release:backend`.
2. Make `compute-version.sh` component-aware and derive versions from `frontend-v*` / `backend-v*` tags.
3. Split release publishing into:
   - `publish_frontend` + `deploy_frontend_edgeone`
   - `publish_backend`
   - `publish_image`
4. Add CI-time content-bundle download for frontend SSG via `PUBLIC_CONTENT_BUNDLE_URL`.
5. Produce a dedicated `backend-dist` runtime bundle and package it with `admin-dist` plus prebuilt `site-dist` in the unified Docker image.
6. Update CI smoke coverage so the Docker image proves:
   - `/api/health` reports `site.status=ok` and `site.mode=static`
   - `/api/public/*` stays available
   - `/posts` is served by the unified Docker image
7. Report publication outcomes from release job summaries through the release-owning agent rather than writing to the source PR.
8. Require the release source SHA to equal the current `main` head before resolving release intent or publishing any output.

## 6. Acceptance criteria

1. Label gate:
   - missing `release:*` for release intents fails
   - unknown `release:*` fails
   - conflicting/missing `type:*` or `channel:*` still fail
2. Frontend-only release:
   - creates only `frontend-*` tag/release
   - deploys the verified static artifact and proxy functions to EdgeOne Makers
   - publishes the unified Docker image with a plain `v*` image tag
3. Backend-only release:
   - creates only `backend-*` tag/release
   - publishes backend/admin release artifacts
   - publishes the unified Docker image with a plain `v*` image tag
   - does not deploy EdgeOne Makers
4. Combined release:
   - both component release paths execute from the same merged PR
   - versions may differ in minor/patch/prerelease but majors must match
5. Runtime packaging:
   - Docker image starts without runtime public-site build
   - `/api/health` stays healthy and reports `site.status=ok`
   - `/posts` is served from bundled static assets
6. Publication reporting:
   - release job summaries expose the actual outcomes of expected publication jobs
   - the release-owning agent reports successful publication or failure to the owner
   - the workflow does not write a result comment to the source PR
7. A manual dispatch or delayed release run for a stale or non-main SHA fails before it can publish an artifact, tag, image, or EdgeOne deployment.

## 7. Risks and rollback

### Risks

- Component tag history can drift if tags are edited manually.
- Frontend releases depend on availability and correctness of `PUBLIC_CONTENT_BUNDLE_URL`.
- EdgeOne Makers, backend artifact releases, and unified Docker image releases now have partially independent failure modes.

### Mitigations

- Validate release intent and major alignment before any tag is pushed.
- Fail fast when the content bundle cannot be downloaded or does not contain `public-snapshot.json`.
- Keep release jobs idempotent by reusing existing matching tags on rerun.
- Preserve explicit workflow summaries for skip/failure reasons.
- Keep the EdgeOne project type as direct upload so the workflow can publish the verified artifact without a second build.
- Repository admins still need GitHub-side proof that `PR Label Gate` is configured as a required check; the workflow/spec cannot prove that from within this private repo context.

### Rollback

- Preserve the previous root-domain CNAME before a Makers cutover; restore it manually only after the owner decides to roll back a failed cutover.
- Restore the previous backend-only image workflow only if Docker no longer needs to serve the public site.
