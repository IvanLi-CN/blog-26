#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_URL="${PUBLIC_CONTENT_BUNDLE_URL:-}"
SNAPSHOT_URL="${PUBLIC_CONTENT_SNAPSHOT_URL:-}"
OUTPUT_PATH="${PUBLIC_SNAPSHOT_PATH:-${ROOT_DIR}/site/generated/public-snapshot.json}"
WORK_DIR="${PUBLIC_CONTENT_WORK_DIR:-${ROOT_DIR}/.tmp/public-content-bundle}"
ARCHIVE_PATH="${WORK_DIR}/bundle.bin"
EXTRACT_DIR="${WORK_DIR}/extract"
LIVE_SNAPSHOT_PATH="${WORK_DIR}/live-public-snapshot.json"

if [[ -z "${BUNDLE_URL}" ]]; then
  echo "PUBLIC_CONTENT_BUNDLE_URL is required" >&2
  exit 2
fi

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}" "$(dirname "${OUTPUT_PATH}")" "${EXTRACT_DIR}"

echo "Downloading public content bundle..."
curl -fsSL \
  --http1.1 \
  --retry 5 \
  --retry-delay 5 \
  --retry-max-time 300 \
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

python3 - "${OUTPUT_PATH}" <<'PY'
from pathlib import Path
import json
import sys

path = Path(sys.argv[1])
try:
    snapshot = json.loads(path.read_text("utf-8"))
except (OSError, json.JSONDecodeError) as exc:
    raise SystemExit(f"Invalid bundled public snapshot: {exc}")

if not isinstance(snapshot, dict):
    raise SystemExit("Bundled public snapshot must be a JSON object")
for key in ("posts", "memos", "tags"):
    if key not in snapshot:
        raise SystemExit(f"Bundled public snapshot is missing required key: {key}")
PY

if [[ -n "${SNAPSHOT_URL}" ]]; then
  if PUBLIC_CONTENT_BUNDLE_URL="${BUNDLE_URL}" PUBLIC_CONTENT_SNAPSHOT_URL="${SNAPSHOT_URL}" python3 - <<'PY'
from os import environ
from urllib.parse import parse_qsl, urlsplit

credential_query_keys = {
    "token",
    "bundle-token",
    "bundle_token",
    "access_token",
    "auth_token",
    "api_token",
    "api_key",
    "api-key",
    "apikey",
    "auth",
    "sig",
    "signature",
    "x-amz-signature",
    "x-goog-signature",
}

def content_query(url):
    return sorted(
        (key, value)
        for key, value in parse_qsl(url.query, keep_blank_values=True)
        if key.lower() not in credential_query_keys
    )

try:
    bundle = urlsplit(environ["PUBLIC_CONTENT_BUNDLE_URL"])
    snapshot = urlsplit(environ["PUBLIC_CONTENT_SNAPSHOT_URL"])
    default_ports = {"http": 80, "https": 443}
    bundle_scheme = bundle.scheme.lower()
    snapshot_scheme = snapshot.scheme.lower()
    same_endpoint = (
        bundle_scheme == snapshot_scheme
        and bundle.hostname == snapshot.hostname
        and (bundle.port or default_ports.get(bundle_scheme))
        == (snapshot.port or default_ports.get(snapshot_scheme))
        and bundle.path == snapshot.path
        and content_query(bundle) == content_query(snapshot)
    )
except (KeyError, ValueError):
    same_endpoint = False

raise SystemExit(0 if same_endpoint else 1)
PY
  then
    echo "Reusing the downloaded content bundle; its URL matches the live snapshot endpoint."
  else
    echo "Refreshing public snapshot from the configured endpoint..."
    curl -fsSL \
      --http1.1 \
      --retry 5 \
      --retry-delay 5 \
      --retry-max-time 300 \
      --retry-all-errors \
      --max-time 120 \
      "${SNAPSHOT_URL}" \
      -o "${LIVE_SNAPSHOT_PATH}"

    python3 - "${LIVE_SNAPSHOT_PATH}" "${OUTPUT_PATH}" <<'PY'
from pathlib import Path
import json
import sys

source = Path(sys.argv[1])
output = Path(sys.argv[2])
try:
    snapshot = json.loads(source.read_text("utf-8"))
except (OSError, json.JSONDecodeError) as exc:
    raise SystemExit(f"Invalid live public snapshot: {exc}")

if not isinstance(snapshot, dict):
    raise SystemExit("Live public snapshot must be a JSON object")
for key in ("posts", "memos", "tags"):
    if key not in snapshot:
        raise SystemExit(f"Live public snapshot is missing required key: {key}")

output.write_text(
    json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
PY
    echo "Live public snapshot accepted and written to ${OUTPUT_PATH}"
  fi
fi

echo "Public snapshot ready at ${OUTPUT_PATH}"
