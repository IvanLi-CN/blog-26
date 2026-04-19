# SPEC: Component-Aware PR Label Release

- Spec ID: `ey3mm`
- Status: `in-progress`
- Owner: `main-agent`

## 1. Background

The repository now has two independently deployable surfaces:

1. `frontend`: the public Astro site, shipped as static assets and deployed to GitHub Pages.
2. `backend`: the API/runtime plus admin SPA, shipped as GitHub Release artifacts and a single GHCR image.

The old single-track `vX.Y.Z` release contract is no longer sufficient because frontend and backend can release independently while still needing coordinated major-version compatibility.

## 2. Goals

1. Keep PR labels as the single source of truth for release intent.
2. Allow `frontend` and `backend` to publish independently from the same merged PR.
3. Give each component its own semver/tag lineage while enforcing matching major versions.
4. Move public-site generation fully to CI build time and deploy it from prebuilt static assets.
5. Keep backend runtime images free of frontend source/build-time responsibilities.

## 3. Non-goals

- No change to public information architecture or admin feature behavior.
- No second backend image; admin SPA and backend runtime stay in one Docker image.
- No runtime public-site rendering inside the backend image.

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

### 4.3 Release outputs

Frontend release:

- GitHub Release tagged with the frontend component tag
- prerelease flag mirrors the label channel
- release assets include `frontend-site-dist-<version>.tar.gz` and checksum
- the exact same build output is deployed to GitHub Pages

Backend release:

- GitHub Release tagged with the backend component tag
- prerelease flag mirrors the label channel
- release assets include:
  - `backend-runtime-dist-<version>.tar.gz`
  - `backend-admin-dist-<version>.tar.gz`
  - checksum manifest
- GHCR image tags:
  - always publish `ghcr.io/<repo>:<backend-release-tag>`
  - additionally publish `ghcr.io/<repo>:backend-latest` only for stable releases whose commit is still the current `main` head

### 4.4 Frontend content source contract

- CI fetches a content bundle from `PUBLIC_CONTENT_BUNDLE_URL`
- the bundle must contain `public-snapshot.json` (directly or inside an archive)
- Astro SSG consumes the snapshot and must not depend on runtime DB, WebDAV, or local content directories during release publishing
- public runtime API/file URLs inside the static site are rewritten against `PUBLIC_API_BASE_URL`, which must be configured to the live backend origin

### 4.5 Backend runtime contract

- The backend image contains the backend runtime bundle plus `admin-dist`
- The backend container must not run public-site SSG at startup
- Production health reports public-site status as `external`
- Public-page routes are no longer served by the backend image unless explicitly enabled for non-production local workflows

## 5. Implementation decisions

1. Extend `label-gate.yml` and `release-intent.sh` to understand `release:frontend` / `release:backend`.
2. Make `compute-version.sh` component-aware and derive versions from `frontend-v*` / `backend-v*` tags.
3. Split release publishing into:
   - `publish_frontend` + `deploy_frontend_pages`
   - `publish_backend`
4. Add CI-time content-bundle download for frontend SSG via `PUBLIC_CONTENT_BUNDLE_URL`.
5. Produce a dedicated `backend-dist` runtime bundle and keep the Docker image limited to backend runtime + `admin-dist`.
6. Update CI smoke coverage so the Docker image proves:
   - `/api/health` reports `site.status=external`
   - `/api/public/*` stays available
   - `/posts` is not served by the backend image

## 6. Acceptance criteria

1. Label gate:
   - missing `release:*` for release intents fails
   - unknown `release:*` fails
   - conflicting/missing `type:*` or `channel:*` still fail
2. Frontend-only release:
   - creates only `frontend-*` tag/release
   - deploys GitHub Pages
   - does not push backend image
3. Backend-only release:
   - creates only `backend-*` tag/release
   - publishes backend image and backend/admin release artifacts
   - does not deploy Pages
4. Combined release:
   - both component release paths execute from the same merged PR
   - versions may differ in minor/patch/prerelease but majors must match
5. Runtime packaging:
   - backend image starts without frontend source or runtime public-site build
   - `/api/health` stays healthy and reports `site.status=external`

## 7. Risks and rollback

### Risks

- Component tag history can drift if tags are edited manually.
- Frontend releases depend on availability and correctness of `PUBLIC_CONTENT_BUNDLE_URL`.
- GitHub Pages deploys and backend releases now have partially independent failure modes.

### Mitigations

- Validate release intent and major alignment before any tag is pushed.
- Fail fast when the content bundle cannot be downloaded or does not contain `public-snapshot.json`.
- Keep release jobs idempotent by reusing existing matching tags on rerun.
- Preserve explicit workflow summaries for skip/failure reasons.

### Rollback

- Revert the component-aware release workflow, label gate, and version scripts together.
- Restore the previous single-track release workflow only if frontend Pages deployment is also reverted.
