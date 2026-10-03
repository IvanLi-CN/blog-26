#!/usr/bin/env bash
set -euo pipefail
# Uses existing content, media and PWA gates. Does not publish a tag/version/image.
bun scripts/generate-version.ts
bun run site:build
bun scripts/verify-playbook-artifact.ts
bun scripts/verify-pages-build.ts
bun run frontend:package-media
rm -rf edgeone-dist
mkdir -p edgeone-dist
cp -R site-dist/. edgeone-dist/
cp -R edge-functions edgeone-dist/edge-functions
bun scripts/prepare-edgeone-pwa-config.ts
PUBLIC_EDGEONE_ARTIFACT_DIR=./edgeone-dist bun run pwa:verify-edgeone-artifact
PUBLIC_MEDIA_ARTIFACT_DIR=./edgeone-dist bun run frontend:verify-media
