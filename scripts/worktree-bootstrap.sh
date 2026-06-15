#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT_DIR/scripts/lib/worktree-bootstrap-common.sh"

WITH_DB=true
WITH_E2E=false
DRY_RUN=false
MARK_ON_SUCCESS=true
FORCE_RUN=false
HOOK_MODE=false
PREVIOUS_REF=""
NEXT_REF=""
BRANCH_FLAG=""
SIMULATE_FAILURE_STEP=""
CURRENT_PHASE=""

usage() {
  cat <<'USAGE'
Usage: ./scripts/worktree-bootstrap.sh [options]

Options:
  --no-db              Skip resetting dev DB and generating dev data
  --with-e2e           Install Playwright browsers
  --dry-run            Print planned commands without executing
  --force              Run even if already initialized
  --skip-mark          Do not write the initialized marker
  --hook               Internal hook mode
  --previous-ref <sha> Hook-provided previous ref
  --next-ref <sha>     Hook-provided next ref
  --branch-flag <0|1>  Hook-provided branch checkout flag
  --simulate-failure-step <step>
                     Test-only failure injection: env|install|db|e2e
  -h, --help           Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-db) WITH_DB=true; shift ;;
    --no-db) WITH_DB=false; shift ;;
    --with-e2e) WITH_E2E=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --force) FORCE_RUN=true; shift ;;
    --skip-mark) MARK_ON_SUCCESS=false; shift ;;
    --hook) HOOK_MODE=true; shift ;;
    --previous-ref) PREVIOUS_REF="${2:-}"; shift 2 ;;
    --next-ref) NEXT_REF="${2:-}"; shift 2 ;;
    --branch-flag) BRANCH_FLAG="${2:-}"; shift 2 ;;
    --simulate-failure-step) SIMULATE_FAILURE_STEP="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      wtb_error "unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

run() {
  wtb_log "$(printf '$ %s' "$*")"
  if [[ "$DRY_RUN" == true ]]; then
    return 0
  fi
  eval "$@"
}

maybe_fail() {
  local step="$1"
  if [[ "$SIMULATE_FAILURE_STEP" == "$step" ]]; then
    wtb_error "simulated failure at step=$step"
    return 1
  fi
}

validate_ports() {
  local web_port="${PORT:-}"
  if [[ "$web_port" =~ ^[0-9]+$ ]]; then
    if ! [[ "${SITE_PORT:-}" =~ ^[0-9]+$ ]]; then
      export SITE_PORT="$((web_port + 3))"
    fi
    if ! [[ "${ADMIN_PORT:-}" =~ ^[0-9]+$ ]]; then
      export ADMIN_PORT="$((web_port + 4))"
    fi
  fi

  local site_port="${SITE_PORT:-}"
  local admin_port="${ADMIN_PORT:-}"
  for value in "$web_port" "$site_port" "$admin_port"; do
    if ! [[ "$value" =~ ^[0-9]+$ ]]; then
      wtb_error "PORT/SITE_PORT/ADMIN_PORT must all be integers after loading .env.local"
      return 1
    fi
  done

  local port_base
  port_base="$((web_port - (web_port % 10)))"
  if [[ "$DRY_RUN" == true ]]; then
    wtb_log "dry-run: would validate port leases for existing .env.local"
  else
    wtb_ensure_registered_port web "$web_port" "$port_base" || return 1
    wtb_ensure_registered_port site "$site_port" "$port_base" || return 1
    wtb_ensure_registered_port admin "$admin_port" "$port_base" || return 1
  fi
  wtb_log "worktree ports loaded (PORT=${web_port}, SITE_PORT=${site_port}, ADMIN_PORT=${admin_port})"
}

install_lefthook() {
  local hooks_dir
  hooks_dir="$(git rev-parse --git-path hooks 2>/dev/null || echo ".git/hooks")"
  if [[ -f "$hooks_dir/post-checkout" && -f "$hooks_dir/pre-commit" && -f "$hooks_dir/commit-msg" ]]; then
    wtb_log "lefthook already installed ✓ ($hooks_dir)"
    return 0
  fi

  local os_arch cpu_arch native_lefthook local_lefthook
  os_arch="$(uname | tr '[:upper:]' '[:lower:]')"
  cpu_arch="$(uname -m | sed 's/aarch64/arm64/;s/x86_64/x64/')"
  native_lefthook="$ROOT_DIR/node_modules/lefthook-${os_arch}-${cpu_arch}/bin/lefthook"
  local_lefthook="$ROOT_DIR/node_modules/.bin/lefthook"

  if [[ -x "$native_lefthook" ]]; then
    run "\"$native_lefthook\" install -f" || return 1
  elif [[ -x "$local_lefthook" ]]; then
    run "\"$local_lefthook\" install -f" || return 1
  elif command -v bunx >/dev/null 2>&1; then
    run bunx lefthook install -f || return 1
  else
    run npx lefthook install -f || return 1
  fi
  if [[ -f "$hooks_dir/post-checkout" ]]; then
    wtb_log "lefthook installed ✓ ($hooks_dir)"
  else
    wtb_warn "post-checkout hook not found after lefthook install ($hooks_dir)"
  fi
}

run_phase() {
  local phase="$1"
  shift
  CURRENT_PHASE="$phase"
  "$@"
}

prepare_env() {
  local env_path="$1"
  maybe_fail env || return 1

  if [[ -f "$env_path" ]]; then
    wtb_load_env_file "$env_path"
  elif [[ "$DRY_RUN" == true ]]; then
    export PORT=10000
    export SITE_PORT=10003
    export ADMIN_PORT=10004
    export DB_PATH=./dev-data/sqlite.db
    export LOCAL_CONTENT_BASE_PATH=./dev-data/local
    export CONTENT_SOURCES=local
    wtb_log "dry-run: would create .env.local with leased worktree ports"
  else
    wtb_write_initial_env_file "$env_path" || return 1
    wtb_load_env_file "$env_path"
  fi

  validate_ports || return 1
}

install_dependencies_and_hooks() {
  maybe_fail install || return 1
  run bun install || return 1
  install_lefthook || return 1
}

is_managed_dev_content_root() {
  local content_root="${LOCAL_CONTENT_BASE_PATH:-}"
  if [[ -z "$content_root" ]]; then
    return 1
  fi

  local resolved_root managed_root
  resolved_root="$(cd "$ROOT_DIR" && python3 - <<'PY' "$content_root"
from pathlib import Path
import sys

print(Path(sys.argv[1]).resolve())
PY
)"
  managed_root="$(cd "$ROOT_DIR" && python3 - <<'PY'
from pathlib import Path

print((Path.cwd() / "dev-data").resolve())
PY
)"

  case "$resolved_root" in
    "$managed_root"/*) return 0 ;;
    *) return 1 ;;
  esac
}

prepare_dev_data() {
  maybe_fail db || return 1
  if [[ "$WITH_DB" == true ]]; then
    run bun run dev-db:reset || return 1
    if is_managed_dev_content_root; then
      run bun run dev-data:generate || return 1
    else
      wtb_warn "LOCAL_CONTENT_BASE_PATH points outside ./dev-data; skip fixture generation and sync existing content instead"
    fi
    run bun run dev-sync:trigger || return 1
  else
    wtb_log "skip DB and dev data"
  fi
}

install_e2e_browsers() {
  if [[ "$WITH_E2E" != true ]]; then
    return 0
  fi
  maybe_fail e2e || return 1
  if command -v bunx >/dev/null 2>&1; then
    run bunx playwright install --with-deps chromium || run bunx playwright install chromium
  else
    run npx playwright install chromium
  fi
}

perform_bootstrap() {
  local env_path="$1"
  wtb_require_command bun || return 1
  if [[ ! -f "$WORKTREE_BOOTSTRAP_PORT_REGISTRY" ]]; then
    wtb_error "port registry helper not found: $WORKTREE_BOOTSTRAP_PORT_REGISTRY"
    return 1
  fi

  run_phase env prepare_env "$env_path" || return 1
  run_phase install install_dependencies_and_hooks || return 1
  run_phase db prepare_dev_data || return 1
  run_phase e2e install_e2e_browsers || return 1
}

main() {
  cd "$ROOT_DIR"
  local marker_path
  marker_path="$(wtb_marker_path)"
  local env_path
  env_path="$(wtb_env_path)"

  if [[ "$FORCE_RUN" != true && "$HOOK_MODE" == true ]]; then
    if ! wtb_should_run_auto_bootstrap "$PREVIOUS_REF" "$BRANCH_FLAG"; then
      wtb_log "skip auto bootstrap for this checkout"
      exit 0
    fi
  fi

  if [[ "$FORCE_RUN" != true && "$HOOK_MODE" != true && -f "$marker_path" ]]; then
    wtb_log "worktree already initialized; use --force to rerun"
    exit 0
  fi

  wtb_log "starting worktree bootstrap (branch=$(wtb_current_branch), hook_mode=$HOOK_MODE)"
  if ! perform_bootstrap "$env_path"; then
    local failed_phase="${CURRENT_PHASE:-unknown}"
    wtb_error "bootstrap failed at phase=${failed_phase}"
    wtb_print_recovery_hint
    exit 1
  fi

  if [[ "$MARK_ON_SUCCESS" == true && "$DRY_RUN" != true ]]; then
    wtb_mark_initialized
  fi
  wtb_log "worktree bootstrap complete"
}

main "$@"
