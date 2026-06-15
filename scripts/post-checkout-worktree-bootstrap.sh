#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BOOTSTRAP_SCRIPT="$ROOT_DIR/scripts/worktree-bootstrap.sh"

previous_ref="${1:-}"
next_ref="${2:-}"
branch_flag="${3:-}"
extra_args=()

if [[ -n "${WORKTREE_BOOTSTRAP_SIMULATE_FAILURE_STEP:-}" ]]; then
  extra_args+=(--simulate-failure-step "$WORKTREE_BOOTSTRAP_SIMULATE_FAILURE_STEP")
fi

if [[ ! -x "$BOOTSTRAP_SCRIPT" ]]; then
  printf '\033[31m[worktree-bootstrap][error]\033[0m bootstrap script missing or not executable: %s\n' "$BOOTSTRAP_SCRIPT" >&2
  printf 'Recovery: bun run worktree:bootstrap -- --force\n' >&2
  exit 0
fi

bootstrap_args=(
  --hook
  --previous-ref "$previous_ref"
  --next-ref "$next_ref"
  --branch-flag "$branch_flag"
)
if [[ ${#extra_args[@]} -gt 0 ]]; then
  bootstrap_args+=("${extra_args[@]}")
fi

if ! "$BOOTSTRAP_SCRIPT" "${bootstrap_args[@]}"; then
  printf '\033[33m[worktree-bootstrap][warn]\033[0m automatic worktree bootstrap failed during post-checkout; checkout stays available\n' >&2
  printf 'Recovery: bun run worktree:bootstrap -- --force\n' >&2
fi

exit 0
