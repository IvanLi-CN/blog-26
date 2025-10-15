#!/usr/bin/env bash
set -euo pipefail

# Simple, self-contained one-click dev bootstrap (no script chaining).
# - Installs dependencies (bun install)
# - Installs git hooks via lefthook
# - Validates dev ports (default Web: 25090, WebDAV: 26091), allow env override
# - Optionally prepares local DB and dev data
# - Optional Playwright browsers install for E2E

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

WITH_DB=true
WITH_E2E=false
DRY_RUN=false

log() { printf "\033[36m[setup]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[setup][warn]\033[0m %s\n" "$*"; }
err() { printf "\033[31m[setup][error]\033[0m %s\n" "$*"; }

usage() {
  cat <<USAGE
Usage: ./scripts/setup.sh [--no-db] [--with-e2e] [--dry-run]

Options:
  --no-db       Skip resetting dev DB and seeding dev data (default is to regenerate)
  --with-e2e    Install Playwright browsers (chromium)
  --dry-run     Print steps without executing
  -h, --help    Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-db) WITH_DB=true; warn "--with-db is now default; flag is deprecated."; shift ;;
    --no-db) WITH_DB=false; shift ;;
    --with-e2e) WITH_E2E=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

run() {
  log "$(printf '$ %s' "$*")";
  if [[ "$DRY_RUN" == true ]]; then return 0; fi
  eval "$@"
}

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "$1 is required but not found in PATH"; exit 1;
  fi
}

is_port_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    if lsof -iTCP -sTCP:LISTEN -P | grep -q ":${port}[^0-9]"; then
      return 1
    else
      return 0
    fi
  elif command -v nc >/dev/null 2>&1; then
    # Try to connect; if connection fails, assume free
    if nc -z localhost "$port" >/dev/null 2>&1; then
      return 1
    else
      return 0
    fi
  else
    # Fallback: attempt to bind via python
    python3 - <<PY >/dev/null 2>&1 && return 0 || return 1
import socket, sys
sock = socket.socket()
try:
    sock.bind(('127.0.0.1', int(sys.argv[1])))
    sock.close()
    sys.exit(0)
except OSError:
    sys.exit(1)
PY
    "$port"
  fi
}

validate_ports() {
  # Defaults; allow env override
  local web_port="${PORT:-25090}"
  local dav_port="${WEBDAV_PORT:-26091}"

  if ! [[ "$web_port" =~ ^[0-9]+$ ]] || ! [[ "$dav_port" =~ ^[0-9]+$ ]]; then
    err "PORT and WEBDAV_PORT must be integers"; exit 1
  fi

  if ! is_port_free "$web_port"; then
    err "Web port ${web_port} is not available. Override with PORT=<port>."; exit 1
  fi
  if ! is_port_free "$dav_port"; then
    err "WebDAV port ${dav_port} is not available. Override with WEBDAV_PORT=<port>."; exit 1
  fi

  log "ports OK (web=${web_port}, webdav=${dav_port})"
}

install_lefthook() {
  if command -v bunx >/dev/null 2>&1; then
    run bunx lefthook install -f || true
  else
    run npx lefthook install -f || true
  fi

  # Resolve the actual hooks dir (works with git worktrees).
  local hooks_dir
  hooks_dir=$(git rev-parse --git-path hooks 2>/dev/null || echo ".git/hooks")

  if [[ -f "$hooks_dir/commit-msg" ]]; then
    if grep -i "lefthook" "$hooks_dir/commit-msg" >/dev/null 2>&1; then
      log "lefthook installed ✓ ($hooks_dir)"
    else
      warn "commit-msg hook exists but does not mention lefthook ($hooks_dir)"
    fi
  else
    warn "commit-msg not found after lefthook install ($hooks_dir)"
  fi
}

main() {
  log "cwd=$ROOT_DIR"
  require bun

  # 1) Dependencies
  run bun install

  # 2) Git hooks (lefthook)
  install_lefthook

  # 3) Validate ports (no file writes)
  validate_ports

  # 4) Local DB and dev data (default ON; can be skipped with --no-db)
  if [[ "$WITH_DB" == true ]]; then
    run bun run dev-db:reset
    run bun run dev-data:generate
  else
    log "skip DB and dev data (user passed --no-db)"
  fi

  # 5) Optional: Playwright browsers for E2E
  if [[ "$WITH_E2E" == true ]]; then
    if command -v bunx >/dev/null 2>&1; then
      run bunx playwright install --with-deps chromium || run bunx playwright install chromium
    else
      run npx playwright install chromium
    fi
  fi

  log "setup complete: dependencies installed, hooks checked, dev data ready"
}

main "$@"
