#!/usr/bin/env bash

set -euo pipefail

WORKTREE_BOOTSTRAP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_BOOTSTRAP_ROOT_DIR="$(cd "${WORKTREE_BOOTSTRAP_LIB_DIR}/../.." && pwd)"
WORKTREE_BOOTSTRAP_PORT_REGISTRY="${WORKTREE_BOOTSTRAP_PORT_REGISTRY:-${WORKTREE_BOOTSTRAP_ROOT_DIR}/scripts/port-registry.py}"
WORKTREE_BOOTSTRAP_ENV_HELPER="${WORKTREE_BOOTSTRAP_LIB_DIR}/worktree-bootstrap-env.py"
WORKTREE_BOOTSTRAP_DEFAULT_CONTENT_SOURCES="local"
WORKTREE_BOOTSTRAP_MARKER_FILENAME=".codex-worktree-bootstrap-initialized"
WORKTREE_BOOTSTRAP_ENV_RELATIVE=".env.local"

wtb_root_dir() {
  printf '%s\n' "$WORKTREE_BOOTSTRAP_ROOT_DIR"
}

wtb_marker_path() {
  printf '%s/%s\n' "$(wtb_git_dir)" "$WORKTREE_BOOTSTRAP_MARKER_FILENAME"
}

wtb_env_path() {
  local root_dir
  root_dir="$(wtb_root_dir)"
  printf '%s/%s\n' "$root_dir" "$WORKTREE_BOOTSTRAP_ENV_RELATIVE"
}

wtb_env_path_kind() {
  local env_path="$1"
  python3 "$WORKTREE_BOOTSTRAP_ENV_HELPER" kind --path "$env_path"
}

wtb_env_file_is_usable() {
  local env_path="$1"
  python3 "$WORKTREE_BOOTSTRAP_ENV_HELPER" validate --path "$env_path" >/dev/null 2>&1
}

wtb_validate_target_env() {
  local env_path="$1"
  if ! wtb_env_file_is_usable "$env_path"; then
    wtb_error ".env.local is damaged or missing a valid PORT value; preserve it and repair it manually"
    return 1
  fi
}

wtb_primary_root() {
  python3 "$WORKTREE_BOOTSTRAP_ENV_HELPER" primary-root --current-root "$(wtb_repo_root)"
}

wtb_current_root_canonical() {
  cd "$(wtb_repo_root)" && pwd -P
}

wtb_log() {
  printf '\033[36m[worktree-bootstrap]\033[0m %s\n' "$*"
}

wtb_warn() {
  printf '\033[33m[worktree-bootstrap][warn]\033[0m %s\n' "$*"
}

wtb_error() {
  printf '\033[31m[worktree-bootstrap][error]\033[0m %s\n' "$*"
}

wtb_repo_root() {
  git rev-parse --show-toplevel
}

wtb_git_common_dir() {
  git rev-parse --git-common-dir
}

wtb_git_dir() {
  git rev-parse --git-dir
}

wtb_current_branch() {
  local branch
  branch="$(git branch --show-current 2>/dev/null || true)"
  if [[ -n "$branch" ]]; then
    printf '%s\n' "$branch"
    return 0
  fi

  local head
  head="$(git rev-parse --short HEAD 2>/dev/null || echo detached)"
  printf 'detached-%s\n' "$head"
}

wtb_project_name() {
  basename "$(wtb_repo_root)"
}

wtb_repo_hash8() {
  python3 - <<'PY' "$(wtb_repo_root)"
import hashlib
import sys

print(hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest()[:8])
PY
}

wtb_scope_slug() {
  python3 - <<'PY' "$(wtb_repo_root)"
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1]).resolve()
name = root.name.lower()
slug = re.sub(r"[^a-z0-9]+", "-", name).strip("-")
print(slug or "workspace")
PY
}

wtb_scope_id() {
  printf '%s--%s--%s\n' "$(wtb_project_name)" "$(wtb_repo_hash8)" "$(wtb_scope_slug)"
}

wtb_service_port_json() {
  local service="$1"
  python3 "$WORKTREE_BOOTSTRAP_PORT_REGISTRY" --json allocate \
    --scope-id "$(wtb_scope_id)" \
    --project "$(wtb_project_name)" \
    --repo-root "$(wtb_repo_root)" \
    --branch "$(wtb_current_branch)" \
    --worktree-path "$(wtb_repo_root)" \
    --service "$service"
}

wtb_service_port_block_json() {
  python3 "$WORKTREE_BOOTSTRAP_PORT_REGISTRY" --json allocate-block \
    --scope-id "$(wtb_scope_id)" \
    --project "$(wtb_project_name)" \
    --repo-root "$(wtb_repo_root)" \
    --branch "$(wtb_current_branch)" \
    --worktree-path "$(wtb_repo_root)" \
    --services web site admin
}

wtb_service_port_register_json() {
  local service="$1"
  local port="$2"
  local port_base="${3:-}"
  local args=(
    register
    --scope-id "$(wtb_scope_id)"
    --service "$service"
    --port "$port"
    --project "$(wtb_project_name)"
    --repo-root "$(wtb_repo_root)"
    --branch "$(wtb_current_branch)"
    --worktree-path "$(wtb_repo_root)"
  )
  if [[ -n "$port_base" ]]; then
    args+=(--port-base "$port_base")
  fi
  python3 "$WORKTREE_BOOTSTRAP_PORT_REGISTRY" --json "${args[@]}"
}

wtb_extract_json_field() {
  local field="$1"
  local payload="$2"
  python3 - <<'PY' "$field" "$payload"
import json
import sys

field = sys.argv[1]
payload = json.loads(sys.argv[2])
value = payload[field]
print(value)
PY
}

wtb_allocate_ports() {
  local block_json
  block_json="$(wtb_service_port_block_json)"
  WTB_PORT="$(wtb_extract_json_field web_port "$block_json")"
  WTB_SITE_PORT="$(wtb_extract_json_field site_port "$block_json")"
  WTB_ADMIN_PORT="$(wtb_extract_json_field admin_port "$block_json")"
  export WTB_PORT WTB_SITE_PORT WTB_ADMIN_PORT
}

wtb_ensure_registered_port() {
  local service="$1"
  local port="$2"
  local port_base="${3:-}"
  wtb_service_port_register_json "$service" "$port" "$port_base" >/dev/null
}

wtb_write_initial_env_file() {
  local env_path="$1"
  local path_kind
  path_kind="$(wtb_env_path_kind "$env_path")" || return 1
  if [[ "$path_kind" == "regular" ]]; then
    wtb_log ".env.local already exists, keep existing values"
    return 0
  fi
  if [[ "$path_kind" != "missing" ]]; then
    wtb_error "cannot create .env.local because the existing path is not a regular file"
    return 1
  fi

  wtb_allocate_ports

  local result
  result="$(python3 "$WORKTREE_BOOTSTRAP_ENV_HELPER" default \
    --target "$env_path" \
    --port "$WTB_PORT" \
    --site-port "$WTB_SITE_PORT" \
    --admin-port "$WTB_ADMIN_PORT")" || {
    wtb_error "failed to publish generated .env.local"
    return 1
  }
  case "$result" in
    created)
      wtb_log "created .env.local with leased worktree ports"
      ;;
    exists)
      wtb_log ".env.local appeared during bootstrap, keep existing values"
      ;;
    *)
      wtb_error "generated .env.local publication returned an unexpected status"
      return 1
      ;;
  esac
}

wtb_recover_env_from_primary() {
  local primary_root source_env current_root source_kind result
  primary_root="$(wtb_primary_root 2>/dev/null)" || return 2
  current_root="$(wtb_current_root_canonical)"
  if [[ "$primary_root" == "$current_root" ]]; then
    return 2
  fi

  source_env="$primary_root/$WORKTREE_BOOTSTRAP_ENV_RELATIVE"
  source_kind="$(wtb_env_path_kind "$source_env")" || return 2
  if [[ "$source_kind" != "regular" ]] || ! wtb_env_file_is_usable "$source_env"; then
    return 2
  fi

  wtb_allocate_ports || return 1
  if result="$(python3 "$WORKTREE_BOOTSTRAP_ENV_HELPER" publish \
    --source "$source_env" \
    --target "$(wtb_env_path)" \
    --port "$WTB_PORT" \
    --site-port "$WTB_SITE_PORT" \
    --admin-port "$WTB_ADMIN_PORT")"; then
    :
  else
    local publish_status=$?
    if [[ "$publish_status" == 2 ]]; then
      return 2
    fi
    wtb_error "failed to publish recovered .env.local"
    return 1
  fi
  case "$result" in
    created)
      wtb_log "recovered missing .env.local with leased worktree ports"
      ;;
    exists)
      wtb_log ".env.local appeared during recovery, keep existing values"
      ;;
    *)
      wtb_error "recovered .env.local publication returned an unexpected status"
      return 1
      ;;
  esac
}

wtb_describe_dry_run_recovery() {
  local primary_root source_env current_root source_kind
  primary_root="$(wtb_primary_root 2>/dev/null)" || {
    wtb_log "dry-run: primary worktree unavailable; would create generated .env.local"
    return 0
  }
  current_root="$(wtb_current_root_canonical)"
  if [[ "$primary_root" == "$current_root" ]]; then
    wtb_log "dry-run: primary worktree would create generated .env.local"
    return 0
  fi

  source_env="$primary_root/$WORKTREE_BOOTSTRAP_ENV_RELATIVE"
  source_kind="$(wtb_env_path_kind "$source_env")" || source_kind=unavailable
  if [[ "$source_kind" == "regular" ]] && wtb_env_file_is_usable "$source_env"; then
    wtb_log "dry-run: would recover missing .env.local from primary and re-lease target ports"
  else
    wtb_log "dry-run: primary .env.local unavailable; would create generated .env.local"
  fi
}

wtb_load_env_file() {
  local env_path="$1"
  if [[ ! -f "$env_path" ]]; then
    return 0
  fi

  while IFS= read -r raw; do
    local line="$raw"
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" == \#* ]] && continue
    if [[ "$line" != *=* ]]; then
      continue
    fi
    local key="${line%%=*}"
    local value="${line#*=}"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    export "$key=$value"
  done <"$env_path"
}

wtb_require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    wtb_error "$command_name is required but not found in PATH"
    return 1
  fi
}

wtb_is_first_checkout_context() {
  local previous_ref="${1:-}"
  local branch_flag="${2:-}"
  if [[ "$branch_flag" != "1" ]]; then
    return 1
  fi
  if [[ "$previous_ref" == "0000000000000000000000000000000000000000" ]]; then
    return 0
  fi
  return 1
}

wtb_should_run_auto_bootstrap() {
  local previous_ref="${1:-}"
  local branch_flag="${2:-}"
  local marker_path
  marker_path="$(wtb_marker_path)"
  if [[ -f "$marker_path" ]]; then
    return 1
  fi
  wtb_is_first_checkout_context "$previous_ref" "$branch_flag"
}

wtb_mark_initialized() {
  local marker_path
  marker_path="$(wtb_marker_path)"
  mkdir -p "$(dirname "$marker_path")"
  date -u +"%Y-%m-%dT%H:%M:%SZ" >"$marker_path"
}

wtb_print_recovery_hint() {
  printf 'Recovery: bun run worktree:bootstrap -- --force\n'
}
