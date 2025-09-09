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

docker build \
  --file Dockerfile \
  --target "${TARGET}" \
  --build-arg "WITH_PLAYWRIGHT=${WITH_PLAYWRIGHT}" \
  --build-arg "DRIZZLE_ORM_VERSION=${DRIZZLE_ORM_VERSION}" \
  -t "${IMAGE_TAG}" \
  .

echo "[docker-build] Done. Run: docker run --rm -p 25090:25090 ${IMAGE_TAG}"

