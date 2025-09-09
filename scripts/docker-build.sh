#!/usr/bin/env bash
set -euo pipefail

# Simple local Docker build helper
# - Chooses target automatically:
#   - If .next/standalone exists -> use app-prebuilt (faster, smaller)
#   - Else -> use runner (build Next.js inside image)
# - Auto-reads drizzle-orm version from package.json and passes as build-arg

IMAGE_TAG=${IMAGE_TAG:-ivan/blog-astrowind:local}
WITH_PLAYWRIGHT=${WITH_PLAYWRIGHT:-false}

if [ -d ".next/standalone" ]; then
  TARGET=${TARGET:-app-prebuilt}
else
  TARGET=${TARGET:-runner}
fi

# Read drizzle-orm version from package.json (strip leading ^ ~ etc.)
DRIZZLE_ORM_VERSION=$(node -e "const p=require('./package.json'); const v=(p.dependencies&&p.dependencies['drizzle-orm'])||(p.devDependencies&&p.devDependencies['drizzle-orm'])||''; process.stdout.write(String(v||'').replace(/^\\D+/,''));")

echo "[docker-build] Target: ${TARGET}"
echo "[docker-build] Image:  ${IMAGE_TAG}"
echo "[docker-build] drizzle-orm: ${DRIZZLE_ORM_VERSION}"

# Prefer buildx when available
if docker buildx version >/dev/null 2>&1; then
  export DOCKER_BUILDKIT=1
  export BUILDKIT_PROGRESS=${BUILDKIT_PROGRESS:-plain}
  BUILD_CMD=(docker buildx build --load)
else
  echo "[docker-build] buildx is not available."
  echo "[docker-build] This Dockerfile uses RUN --mount which requires BuildKit/buildx."
  echo "[docker-build] Please install buildx (Docker Desktop has it built-in) or:"
  echo "[docker-build]   - On Linux: sudo apt-get install docker-buildx-plugin (or equivalent)"
  echo "[docker-build]   - Or: docker buildx install"
  exit 1
fi

"${BUILD_CMD[@]}" \
  --file Dockerfile \
  --target "${TARGET}" \
  --build-arg "WITH_PLAYWRIGHT=${WITH_PLAYWRIGHT}" \
  --build-arg "DRIZZLE_ORM_VERSION=${DRIZZLE_ORM_VERSION}" \
  -t "${IMAGE_TAG}" \
  .

echo "[docker-build] Done. Run: docker run --rm -p 25090:25090 ${IMAGE_TAG}"
