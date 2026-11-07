#!/usr/bin/env bash
set -euo pipefail

# Native preparation followed by packaging only; never compile inside Docker.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
IMAGE_TAG=${IMAGE_TAG:-ivan/blog:local}
TARGET=${TARGET:-app-image-built}
if [[ "${WITH_PLAYWRIGHT:-false}" != false ]]; then
  echo "WITH_PLAYWRIGHT=true is unsupported; native runtime bundles do not install browsers" >&2
  exit 2
fi
case "$TARGET" in app-image-built|app-image-prebuilt) ;; *) echo "Unsupported packaging target: $TARGET" >&2; exit 2 ;; esac

if [[ -z "${BUILD_ARTIFACT_DIR:-}" ]]; then
  # Fail before network acquisition or Docker access on unsupported hosts.
  bun -e 'await (await import("./scripts/runtime-bundle.ts")).requireNativePlatform()'
  PUBLIC_SNAPSHOT_PATH=${PUBLIC_SNAPSHOT_PATH:-${ROOT_DIR}/site/generated/public-snapshot.json}
  if [[ -n "${PUBLIC_CONTENT_BUNDLE_URL:-}" && "$PUBLIC_CONTENT_BUNDLE_URL" != preloaded ]]; then
    PUBLIC_SNAPSHOT_PATH="$PUBLIC_SNAPSHOT_PATH" bash scripts/fetch-public-content-bundle.sh
  elif [[ ! -f "$PUBLIC_SNAPSHOT_PATH" ]]; then
    echo "Public snapshot required: provide PUBLIC_CONTENT_BUNDLE_URL or $PUBLIC_SNAPSHOT_PATH" >&2
    exit 2
  fi
  export PUBLIC_SNAPSHOT_PATH PUBLIC_CONTENT_BUNDLE_URL=preloaded
  export RUSTUP_TOOLCHAIN=1.91.0
  bun run search:native:build
  bun run search:native:verify
  BUILD_ARTIFACT_DIR="$ROOT_DIR/.tmp/runtime-bundle-$(date +%s)-$$"
  BUILD_ARTIFACT_PROFILE=local
  bun run image:prepare --profile local --output "$BUILD_ARTIFACT_DIR"
  EXPECTED_SOURCE_SHA=$(git rev-parse HEAD)
  EXPECTED_CONFIG_DIGEST=$(bun -e 'console.log((await import("./scripts/runtime-bundle.ts")).configurationDigest())')
else
  : "${EXPECTED_SOURCE_SHA:?Set EXPECTED_SOURCE_SHA from the trusted Actions run or frozen source}"
  : "${EXPECTED_CONFIG_DIGEST:?Set EXPECTED_CONFIG_DIGEST from the trusted Actions run or frozen configuration}"
  BUILD_ARTIFACT_PROFILE=${BUILD_ARTIFACT_PROFILE:-ci}
fi

VERIFY_ARGS=(--profile "$BUILD_ARTIFACT_PROFILE" --source-sha "$EXPECTED_SOURCE_SHA" --config-digest "$EXPECTED_CONFIG_DIGEST" --output "$BUILD_ARTIFACT_DIR")
if [[ "$(uname -s)" != Linux ]]; then VERIFY_ARGS+=(--portable); fi
bun run image:verify "${VERIFY_ARGS[@]}"
export DOCKER_BUILDKIT=1 BUILDKIT_PROGRESS=${BUILDKIT_PROGRESS:-plain}
docker buildx build --load --platform linux/amd64 --file "$BUILD_ARTIFACT_DIR/Dockerfile" --target "$TARGET" \
  --build-arg "PUBLIC_ASSISTANT_LAUNCHER_DEFAULT=${PUBLIC_ASSISTANT_LAUNCHER_DEFAULT:-true}" \
  -t "$IMAGE_TAG" "$BUILD_ARTIFACT_DIR"
echo "[docker-build] Packaged verified bundle: $BUILD_ARTIFACT_DIR -> $IMAGE_TAG"
