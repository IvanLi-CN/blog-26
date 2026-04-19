#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${BACKEND_DIST_DIR:-${ROOT_DIR}/backend-dist}"

rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}" "${DIST_DIR}/scripts"

copy_file() {
  local source="$1"
  local target_dir="$2"
  mkdir -p "${target_dir}"
  cp "${ROOT_DIR}/${source}" "${target_dir}/"
}

copy_tree() {
  local source="$1"
  local target="$2"
  rm -rf "${target}"
  mkdir -p "${target}"
  cp -R "${source}/." "${target}/"
}

copy_file "package.json" "${DIST_DIR}"
copy_file "bun.lock" "${DIST_DIR}"
copy_file "bunfig.toml" "${DIST_DIR}"
copy_file "tsconfig.json" "${DIST_DIR}"
copy_file "docker-entrypoint.sh" "${DIST_DIR}"
copy_file "scripts/start-gateway.ts" "${DIST_DIR}/scripts"
copy_file "scripts/migrate.ts" "${DIST_DIR}/scripts"

copy_tree "${ROOT_DIR}/src" "${DIST_DIR}/src"
find "${DIST_DIR}/src" -type d -name "__tests__" -prune -exec rm -rf {} +
find "${DIST_DIR}/src" -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) -delete

copy_tree "${ROOT_DIR}/drizzle" "${DIST_DIR}/drizzle"
copy_tree "${ROOT_DIR}/public" "${DIST_DIR}/public"

chmod +x "${DIST_DIR}/docker-entrypoint.sh"

echo "Prepared backend runtime bundle at ${DIST_DIR}"
