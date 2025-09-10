#!/usr/bin/env bash
set -euo pipefail

# Simple local Docker build helper (docker prebuild)
# - Always performs Next.js build inside Docker (target=app-image-built)
# - Produces final image using build-time artifacts (no host build)
# - Auto-reads drizzle-orm version from package.json and passes as build-arg

IMAGE_TAG=${IMAGE_TAG:-ivan/blog-astrowind:local}
WITH_PLAYWRIGHT=${WITH_PLAYWRIGHT:-false}
TARGET=${TARGET:-app-image-built}

# Read drizzle-orm version from package.json (strip leading ^ ~ etc.)
DRIZZLE_ORM_VERSION=$(node -e "const p=require('./package.json'); const v=(p.dependencies&&p.dependencies['drizzle-orm'])||(p.devDependencies&&p.devDependencies['drizzle-orm'])||''; process.stdout.write(String(v||'').replace(/^\\D+/,''));")

echo "[docker-build] Target: ${TARGET} (docker prebuild)"
echo "[docker-build] Image:  ${IMAGE_TAG}"
echo "[docker-build] drizzle-orm: ${DRIZZLE_ORM_VERSION}"

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
  -t "${IMAGE_TAG}" \
  .

echo "[docker-build] Done. Run: docker run --rm -p 25090:25090 ${IMAGE_TAG}"
