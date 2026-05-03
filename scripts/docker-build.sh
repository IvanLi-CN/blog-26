#!/usr/bin/env bash
set -euo pipefail

# Simple local Docker build helper (docker prebuild)
# - Always performs public site + backend/admin build inside Docker (target=app-image-built)
# - Produces final unified image using build-time artifacts (no host build)
# - Requires a preloaded public snapshot or PUBLIC_CONTENT_BUNDLE_URL
# - Auto-reads drizzle-orm version from package.json and passes as build-arg

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

IMAGE_TAG=${IMAGE_TAG:-ivan/blog:local}
WITH_PLAYWRIGHT=${WITH_PLAYWRIGHT:-false}
TARGET=${TARGET:-app-image-built}
PUBLIC_SNAPSHOT_PATH=${PUBLIC_SNAPSHOT_PATH:-${ROOT_DIR}/site/generated/public-snapshot.json}

# Read drizzle-orm version from package.json (strip leading ^ ~ etc.)
DRIZZLE_ORM_VERSION=$(node -e "const p=require('./package.json'); const v=(p.dependencies&&p.dependencies['drizzle-orm'])||(p.devDependencies&&p.devDependencies['drizzle-orm'])||''; process.stdout.write(String(v||'').replace(/^\\D+/,''));")

echo "[docker-build] Target: ${TARGET} (docker prebuild)"
echo "[docker-build] Image:  ${IMAGE_TAG}"
echo "[docker-build] drizzle-orm: ${DRIZZLE_ORM_VERSION}"

if [[ -n "${PUBLIC_CONTENT_BUNDLE_URL:-}" && "${PUBLIC_CONTENT_BUNDLE_URL}" != "preloaded" ]]; then
  echo "[docker-build] Fetching public content bundle into ${PUBLIC_SNAPSHOT_PATH}"
  PUBLIC_SNAPSHOT_PATH="${PUBLIC_SNAPSHOT_PATH}" bash ./scripts/fetch-public-content-bundle.sh
elif [[ "${PUBLIC_CONTENT_BUNDLE_URL:-}" == "preloaded" && ! -f "${PUBLIC_SNAPSHOT_PATH}" ]]; then
  echo "[docker-build] PUBLIC_CONTENT_BUNDLE_URL=preloaded requires ${PUBLIC_SNAPSHOT_PATH}" >&2
  exit 2
elif [[ -z "${PUBLIC_CONTENT_BUNDLE_URL:-}" && -f "${PUBLIC_SNAPSHOT_PATH}" ]]; then
  echo "[docker-build] Reusing preloaded public snapshot at ${PUBLIC_SNAPSHOT_PATH}"
  PUBLIC_CONTENT_BUNDLE_URL=preloaded
elif [[ -z "${PUBLIC_CONTENT_BUNDLE_URL:-}" ]]; then
  echo "[docker-build] Public snapshot is required for unified image builds." >&2
  echo "[docker-build] Set PUBLIC_CONTENT_BUNDLE_URL or precreate ${PUBLIC_SNAPSHOT_PATH}." >&2
  exit 2
fi

# Prefer buildx when available; fallback to docker-buildx CLI; else to docker build with BuildKit
if docker buildx version >/dev/null 2>&1; then
  export DOCKER_BUILDKIT=1
  export BUILDKIT_PROGRESS=${BUILDKIT_PROGRESS:-plain}
  BUILD_CMD=(docker buildx build --load)
elif command -v docker-buildx >/dev/null 2>&1; then
  export DOCKER_BUILDKIT=1
  export BUILDKIT_PROGRESS=${BUILDKIT_PROGRESS:-plain}
  BUILD_CMD=(docker-buildx build --load)
else
  echo "[docker-build] buildx not found; falling back to 'docker build' with BuildKit."
  export DOCKER_BUILDKIT=1
  export BUILDKIT_PROGRESS=${BUILDKIT_PROGRESS:-plain}
  BUILD_CMD=(docker build)
fi

"${BUILD_CMD[@]}" \
  --file Dockerfile \
  --target "${TARGET}" \
  --build-arg "WITH_PLAYWRIGHT=${WITH_PLAYWRIGHT}" \
  --build-arg "DRIZZLE_ORM_VERSION=${DRIZZLE_ORM_VERSION}" \
  --build-arg "PUBLIC_API_BASE_URL=${PUBLIC_API_BASE_URL:-}" \
  --build-arg "PUBLIC_SITE_URL=${PUBLIC_SITE_URL:-}" \
  --build-arg "PUBLIC_SITE_BASE_PATH=${PUBLIC_SITE_BASE_PATH:-}" \
  --build-arg "PUBLIC_CONTENT_BUNDLE_URL=${PUBLIC_CONTENT_BUNDLE_URL:-}" \
  -t "${IMAGE_TAG}" \
  .

echo "[docker-build] Done. Run: docker run --rm -p 25090:25090 ${IMAGE_TAG}"
