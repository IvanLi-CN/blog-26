#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo "The search backend currently supports linux/amd64; use the Agent VM backend." >&2
  exit 1
fi
cargo build --manifest-path "${ROOT_DIR}/native/search/Cargo.toml" --release --locked
SEARCH_TARGET_DIR="${CARGO_TARGET_DIR:-${ROOT_DIR}/native/search/target}"
SEARCH_MODULE_TEMP="$(mktemp "${ROOT_DIR}/native/search/.search-module.XXXXXX")"
trap 'rm -f "${SEARCH_MODULE_TEMP}"' EXIT
cp "${SEARCH_TARGET_DIR}/release/libblog_search.so" "${SEARCH_MODULE_TEMP}"
chmod 644 "${SEARCH_MODULE_TEMP}"
mv "${SEARCH_MODULE_TEMP}" "${ROOT_DIR}/native/search/search.linux-x64.node"
