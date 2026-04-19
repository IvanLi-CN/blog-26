#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_URL="${PUBLIC_CONTENT_BUNDLE_URL:-}"
OUTPUT_PATH="${PUBLIC_SNAPSHOT_PATH:-${ROOT_DIR}/site/generated/public-snapshot.json}"
WORK_DIR="${PUBLIC_CONTENT_WORK_DIR:-${ROOT_DIR}/.tmp/public-content-bundle}"
ARCHIVE_PATH="${WORK_DIR}/bundle.bin"
EXTRACT_DIR="${WORK_DIR}/extract"

if [[ -z "${BUNDLE_URL}" ]]; then
  echo "PUBLIC_CONTENT_BUNDLE_URL is required" >&2
  exit 2
fi

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}" "$(dirname "${OUTPUT_PATH}")" "${EXTRACT_DIR}"

echo "Downloading public content bundle..."
curl -fsSL \
  --retry 3 \
  --retry-delay 2 \
  --retry-all-errors \
  --max-time 300 \
  "${BUNDLE_URL}" \
  -o "${ARCHIVE_PATH}"

kind="$(python3 - <<'PY' "${ARCHIVE_PATH}"
from pathlib import Path
import sys
path = Path(sys.argv[1])
raw = path.read_bytes()[:4]
if raw.startswith(b'PK\x03\x04'):
    print('zip')
elif raw.startswith(b'\x1f\x8b'):
    print('tar.gz')
else:
    text = path.read_text('utf-8', errors='ignore').lstrip()
    if text.startswith('{'):
        print('json')
    else:
        print('unknown')
PY
)"

case "${kind}" in
  json)
    cp "${ARCHIVE_PATH}" "${OUTPUT_PATH}"
    ;;
  tar.gz)
    tar -xzf "${ARCHIVE_PATH}" -C "${EXTRACT_DIR}"
    ;;
  zip)
    unzip -q "${ARCHIVE_PATH}" -d "${EXTRACT_DIR}"
    ;;
  *)
    echo "Unsupported content bundle format" >&2
    exit 3
    ;;
esac

if [[ "${kind}" != "json" ]]; then
  snapshot_file="$(find "${EXTRACT_DIR}" -type f -name 'public-snapshot.json' | head -n 1)"
  if [[ -z "${snapshot_file}" ]]; then
    echo "public-snapshot.json not found in extracted content bundle" >&2
    exit 4
  fi
  cp "${snapshot_file}" "${OUTPUT_PATH}"
fi

echo "Public snapshot ready at ${OUTPUT_PATH}"
