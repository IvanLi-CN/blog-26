#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/worktree-bootstrap.XXXXXX")"
SNAPSHOT_REPO="$TMP_DIR/repo"
REGISTRY_DIR="$TMP_DIR/port-registry"
AUTO_WORKTREE="$TMP_DIR/auto"
MANUAL_WORKTREE="$TMP_DIR/manual"
FAIL_WORKTREE="$TMP_DIR/fail"
RECOVERY_WORKTREE="$TMP_DIR/recovery"
LEGACY_WORKTREE="$TMP_DIR/legacy"
DRY_RUN_WORKTREE="$TMP_DIR/dry-run"
EXPORT_WORKTREE="$TMP_DIR/export"
STALE_SCOPE_WORKTREE="$TMP_DIR/stale-scope"
SOURCE_WORKTREE="$TMP_DIR/source"
SECONDARY_WORKTREE="$TMP_DIR/secondary"
FALLBACK_WORKTREE="$TMP_DIR/fallback"
INVALID_SOURCE_WORKTREE="$TMP_DIR/invalid-source"
DAMAGED_WORKTREE="$TMP_DIR/damaged"
CONCURRENT_WORKTREE="$TMP_DIR/concurrent"
PUBLISH_FAIL_WORKTREE="$TMP_DIR/publish-fail"
CRLF_WORKTREE="$TMP_DIR/crlf"
ROOT_ENV_BACKUP="$TMP_DIR/root-env.local.bak"
PORT_HOLDER_PID=""
PORT_HOLDER_PID_2=""

cleanup() {
  if [[ -n "$PORT_HOLDER_PID" ]]; then
    kill "$PORT_HOLDER_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$PORT_HOLDER_PID_2" ]]; then
    kill "$PORT_HOLDER_PID_2" >/dev/null 2>&1 || true
  fi
  git -C "$SNAPSHOT_REPO" worktree remove --force "$AUTO_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$MANUAL_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$FAIL_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$RECOVERY_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$LEGACY_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$DRY_RUN_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$EXPORT_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$STALE_SCOPE_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$SOURCE_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$SECONDARY_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$FALLBACK_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$INVALID_SOURCE_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$DAMAGED_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$CONCURRENT_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$PUBLISH_FAIL_WORKTREE" >/dev/null 2>&1 || true
  git -C "$SNAPSHOT_REPO" worktree remove --force "$CRLF_WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf '[test-worktree-bootstrap] %s\n' "$*"
}

start_port_holder() {
  local port="$1"
  local pid_var="${2:-PORT_HOLDER_PID}"
  python3 - <<'PY' "$port" >/dev/null 2>&1 &
import socket
import sys
import time

sock = socket.socket()
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(("127.0.0.1", int(sys.argv[1])))
sock.listen(1)
try:
    while True:
        time.sleep(1)
finally:
    sock.close()
PY
  printf -v "$pid_var" '%s' "$!"
  sleep 0.3
}

stop_port_holder() {
  local pid_var="${1:-PORT_HOLDER_PID}"
  local pid_value="${!pid_var:-}"
  if [[ -n "$pid_value" ]]; then
    kill "$pid_value" >/dev/null 2>&1 || true
    wait "$pid_value" 2>/dev/null || true
    printf -v "$pid_var" '%s' ""
  fi
}

wait_for_gateway_health() {
  local url="$1"
  local expected_port="$2"
  local attempts="${3:-50}"

  for _ in $(seq 1 "$attempts"); do
    if python3 - <<'PY' "$url" "$expected_port"
import json
import sys
import urllib.error
import urllib.request

url = sys.argv[1]
expected_port = int(sys.argv[2])

try:
    with urllib.request.urlopen(url, timeout=0.5) as response:
        payload = json.load(response)
except urllib.error.HTTPError as error:
    payload = json.load(error)
except urllib.error.URLError:
    raise SystemExit(1)

gateway = payload.get("gateway") or {}
if gateway.get("port") != expected_port:
    raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep 0.2
  done

  return 1
}

worktree_scope_id() {
  local worktree_path="$1"
  (
    cd "$worktree_path"
    bash -c 'source ./scripts/lib/worktree-bootstrap-common.sh; wtb_scope_id'
  )
}

assert_file_contains() {
  local file="$1"
  local pattern="$2"
  if ! grep -qE "$pattern" "$file"; then
    printf 'Assertion failed: %s does not contain /%s/\n' "$file" "$pattern" >&2
    exit 1
  fi
}

assert_file_not_contains() {
  local file="$1"
  local pattern="$2"
  if grep -qE "$pattern" "$file"; then
    printf 'Assertion failed: %s unexpectedly contains /%s/\n' "$file" "$pattern" >&2
    exit 1
  fi
}

copy_root_contents() {
  local destination="$1"
  while IFS= read -r relative_path; do
    local source_path="$ROOT_DIR/$relative_path"
    local target_path="$destination/$relative_path"
    mkdir -p "$(dirname "$target_path")"
    cp "$source_path" "$target_path"
  done < <(git -C "$ROOT_DIR" ls-files --cached --others --exclude-standard)
}

create_snapshot_repo() {
  log "create isolated snapshot repo"
  mkdir -p "$SNAPSHOT_REPO"
  git init "$SNAPSHOT_REPO" >/dev/null
  copy_root_contents "$SNAPSHOT_REPO"
  (
    cd "$SNAPSHOT_REPO"
    git config user.name "Codex"
    git config user.email "codex@example.com"
    git add .
    git commit -m "test snapshot" >/dev/null
    git branch -M main
  )
}

prepare_root_hooks() {
  log "install root hooks and bootstrap baseline"
  if [[ -f "$SNAPSHOT_REPO/.env.local" ]]; then
    mv "$SNAPSHOT_REPO/.env.local" "$ROOT_ENV_BACKUP"
  fi
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-root.log 2>&1
  )
  rm -f "$SNAPSHOT_REPO/.env.local"
  if [[ -f "$ROOT_ENV_BACKUP" ]]; then
    mv "$ROOT_ENV_BACKUP" "$SNAPSHOT_REPO/.env.local"
  fi
}

check_auto_bootstrap() {
  log "check first-checkout auto bootstrap"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add "$AUTO_WORKTREE" >/tmp/worktree-bootstrap-auto.log 2>&1
  )

  local env_file="$AUTO_WORKTREE/.env.local"
  local marker_file
  marker_file="$(git -C "$AUTO_WORKTREE" rev-parse --git-dir)/.codex-worktree-bootstrap-initialized"

  [[ -f "$env_file" ]] || { echo ".env.local missing after auto bootstrap" >&2; exit 1; }
  [[ -f "$marker_file" ]] || { echo "marker missing after auto bootstrap" >&2; exit 1; }

  assert_file_contains /tmp/worktree-bootstrap-auto.log 'worktree bootstrap complete'
  assert_file_contains "$env_file" '^PORT=[1-9][0-9]{4,}$'
  assert_file_contains "$env_file" '^SITE_PORT=[1-9][0-9]{4,}$'
  assert_file_contains "$env_file" '^ADMIN_PORT=[1-9][0-9]{4,}$'
  assert_file_contains "$env_file" '^DB_PATH=\./dev-data/sqlite\.db$'
  assert_file_contains "$env_file" '^LOCAL_CONTENT_BASE_PATH=\./dev-data/local$'
  assert_file_contains "$env_file" '^CONTENT_SOURCES=local$'
  assert_file_not_contains "$env_file" '^PORT=25090$'
  assert_file_not_contains "$env_file" '^SITE_PORT=25093$'
  assert_file_not_contains "$env_file" '^ADMIN_PORT=25094$'
}

write_primary_source_env() {
  cat >"$SNAPSHOT_REPO/.env.local" <<'EOF'
PORT="39111"
SITE_PORT='39114'
ADMIN_PORT=39115
DB_PATH=./dev-data/shared.sqlite.db
LOCAL_CONTENT_BASE_PATH=/tmp/shared-worktree-content
CONTENT_SOURCES=local
SECRET_MARKER=synthetic-source-only
EOF
  chmod 0644 "$SNAPSHOT_REPO/.env.local"
}

check_primary_source_recovery() {
  log "check missing target inherits only primary environment settings"
  write_primary_source_env

  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$SECONDARY_WORKTREE" >/tmp/worktree-bootstrap-secondary.log 2>&1
  )
  cat >"$SECONDARY_WORKTREE/.env.local" <<'EOF'
PORT=39211
SITE_PORT=39214
ADMIN_PORT=39215
DB_PATH=./dev-data/secondary.sqlite.db
LOCAL_CONTENT_BASE_PATH=/tmp/secondary-worktree-content
CONTENT_SOURCES=local
SECRET_MARKER=synthetic-secondary-only
EOF

  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$SOURCE_WORKTREE" >/tmp/worktree-bootstrap-source.log 2>&1
  )

  local source_env="$SNAPSHOT_REPO/.env.local"
  local target_env="$SOURCE_WORKTREE/.env.local"
  local source_nonports="$TMP_DIR/source-nonports"
  local target_nonports="$TMP_DIR/target-nonports"
  grep -vE '^(PORT|SITE_PORT|ADMIN_PORT)=' "$source_env" >"$source_nonports"
  grep -vE '^(PORT|SITE_PORT|ADMIN_PORT)=' "$target_env" >"$target_nonports"

  [[ -f "$target_env" ]] || { echo "recovered target .env.local is missing" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-source.log 'recovered missing \.env\.local with leased worktree ports'
  assert_file_contains "$target_env" '^SECRET_MARKER=synthetic-source-only$'
  assert_file_not_contains "$target_env" 'synthetic-secondary-only'
  assert_file_not_contains /tmp/worktree-bootstrap-source.log 'synthetic-source-only'
  cmp -s "$source_nonports" "$target_nonports" || {
    echo "recovered target changed a non-port source setting" >&2
    exit 1
  }
  local source_port target_port source_mode target_mode
  source_port="$(grep '^PORT=' "$source_env" | cut -d= -f2)"
  target_port="$(grep '^PORT=' "$target_env" | cut -d= -f2)"
  [[ "$target_port" != "$source_port" ]] || { echo "recovered target reused primary PORT" >&2; exit 1; }
  source_mode="$(python3 -c 'import os, stat, sys; print(format(stat.S_IMODE(os.stat(sys.argv[1]).st_mode), "o"))' "$source_env")"
  target_mode="$(python3 -c 'import os, stat, sys; print(format(stat.S_IMODE(os.stat(sys.argv[1]).st_mode), "o"))' "$target_env")"
  [[ "$source_mode" == "644" ]] || { echo "source fixture mode changed unexpectedly" >&2; exit 1; }
  [[ "$target_mode" == "600" ]] || { echo "recovered target mode is not owner-only: $target_mode" >&2; exit 1; }
}

check_crlf_source_recovery() {
  log "check CRLF source recovery remains loadable"
  write_primary_source_env
  python3 - "$SNAPSHOT_REPO/.env.local" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
path.write_bytes(path.read_bytes().replace(b"\n", b"\r\n"))
PY
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$CRLF_WORKTREE" >/tmp/worktree-bootstrap-crlf.log 2>&1
  )

  local env_file="$CRLF_WORKTREE/.env.local"
  [[ -f "$env_file" ]] || { echo "CRLF recovery target .env.local is missing" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-crlf.log 'recovered missing \.env\.local with leased worktree ports'
  assert_file_not_contains /tmp/worktree-bootstrap-crlf.log 'synthetic-source-only'
  python3 - "$env_file" <<'PY'
from pathlib import Path
import sys

values = {}
for line in Path(sys.argv[1]).read_bytes().splitlines():
    if b"=" in line:
        key, value = line.split(b"=", 1)
        values[key] = value

if any(not values.get(key, b"").isdigit() for key in (b"PORT", b"SITE_PORT", b"ADMIN_PORT")):
    raise SystemExit("CRLF recovery did not produce numeric ports")
if values.get(b"DB_PATH") != b"./dev-data/shared.sqlite.db":
    raise SystemExit("CRLF recovery changed DB_PATH")
if b"SECRET_MARKER=synthetic-source-only" not in Path(sys.argv[1]).read_bytes():
    raise SystemExit("CRLF recovery lost source settings")
PY
  write_primary_source_env
}

check_existing_env_is_preserved() {
  log "check existing .env.local is preserved"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$MANUAL_WORKTREE" >/dev/null 2>&1
  )

cat >"$MANUAL_WORKTREE/.env.local" <<'EOF'
# target-owned formatting must remain untouched
PORT=32111
SITE_PORT=32114
ADMIN_PORT=32115
DB_PATH=./dev-data/custom.sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/custom-local
CONTENT_SOURCES=local
SECRET_MARKER=synthetic-target-only
EOF
cp "$MANUAL_WORKTREE/.env.local" "$TMP_DIR/existing-target.before"

  (
    cd "$MANUAL_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db --dry-run >/tmp/worktree-bootstrap-manual.log 2>&1
    git checkout -B bootstrap-rerun-check >/tmp/worktree-bootstrap-rerun.log 2>&1
  )

  assert_file_contains "$MANUAL_WORKTREE/.env.local" '^PORT=32111$'
  assert_file_contains "$MANUAL_WORKTREE/.env.local" '^SITE_PORT=32114$'
  assert_file_contains "$MANUAL_WORKTREE/.env.local" '^ADMIN_PORT=32115$'
  cmp -s "$TMP_DIR/existing-target.before" "$MANUAL_WORKTREE/.env.local" || {
    echo "existing target .env.local was rewritten" >&2
    exit 1
  }
  assert_file_contains /tmp/worktree-bootstrap-manual.log 'dry-run: would validate port leases for existing \.env\.local'
  assert_file_not_contains /tmp/worktree-bootstrap-manual.log 'synthetic-target-only'
  assert_file_contains /tmp/worktree-bootstrap-rerun.log 'skip auto bootstrap for this checkout'
}

check_legacy_env_is_accepted() {
  log "check legacy .env.local remains bootstrap-compatible"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$LEGACY_WORKTREE" >/dev/null 2>&1
  )

  cat >"$LEGACY_WORKTREE/.env.local" <<'EOF'
PORT=33111
DB_PATH=./dev-data/legacy.sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/legacy-local
CONTENT_SOURCES=local
EOF

  (
    cd "$LEGACY_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-legacy.log 2>&1
  )

  local derived_site_port derived_admin_port
  derived_site_port="$(cd "$LEGACY_WORKTREE" && bun ./scripts/resolve-worktree-port.ts site)"
  derived_admin_port="$(cd "$LEGACY_WORKTREE" && bun ./scripts/resolve-worktree-port.ts admin)"

  assert_file_contains /tmp/worktree-bootstrap-legacy.log 'worktree ports loaded$'
  assert_file_contains "$LEGACY_WORKTREE/.env.local" '^PORT=33111$'
  assert_file_not_contains "$LEGACY_WORKTREE/.env.local" '^SITE_PORT='
  assert_file_not_contains "$LEGACY_WORKTREE/.env.local" '^ADMIN_PORT='
  [[ "$derived_site_port" == "33114" ]] || { echo "legacy site port did not derive from PORT" >&2; exit 1; }
  [[ "$derived_admin_port" == "33115" ]] || { echo "legacy admin port did not derive from PORT" >&2; exit 1; }

  local gateway_pid=""
  (
    cd "$LEGACY_WORKTREE"
    env -u PORT -u SITE_PORT -u ADMIN_PORT bun run gateway:dev >/tmp/worktree-bootstrap-legacy-gateway.log 2>&1 &
    gateway_pid="$!"
    echo "$gateway_pid" > /tmp/worktree-bootstrap-legacy-gateway.pid
  )
  gateway_pid="$(cat /tmp/worktree-bootstrap-legacy-gateway.pid)"
  rm -f /tmp/worktree-bootstrap-legacy-gateway.pid

  if ! wait_for_gateway_health "http://127.0.0.1:33111/api/health" 33111; then
    kill "$gateway_pid" >/dev/null 2>&1 || true
    wait "$gateway_pid" 2>/dev/null || true
    cat /tmp/worktree-bootstrap-legacy-gateway.log >&2 || true
    echo "gateway dev did not bind the legacy PORT from .env.local" >&2
    exit 1
  fi

  kill "$gateway_pid" >/dev/null 2>&1 || true
  wait "$gateway_pid" 2>/dev/null || true
  assert_file_contains /tmp/worktree-bootstrap-legacy-gateway.log 'publicPort: 33111'
}

check_primary_source_fallback() {
  log "check missing primary source falls back to generated default"
  rm -f "$SNAPSHOT_REPO/.env.local"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$FALLBACK_WORKTREE" >/tmp/worktree-bootstrap-fallback.log 2>&1
  )

  local env_file="$FALLBACK_WORKTREE/.env.local"
  [[ -f "$env_file" ]] || { echo "fallback target .env.local is missing" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-fallback.log 'no usable inherited environment is available'
  assert_file_contains "$env_file" '^DB_PATH=\./dev-data/sqlite\.db$'
  assert_file_not_contains "$env_file" 'synthetic-source-only'
}

check_invalid_primary_source_fallback() {
  log "check invalid primary source falls back without copying content"
  cat >"$SNAPSHOT_REPO/.env.local" <<'EOF'
PORT=not-a-port
SECRET_MARKER=synthetic-invalid-only
EOF
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$INVALID_SOURCE_WORKTREE" >/tmp/worktree-bootstrap-invalid-source.log 2>&1
  )

  local env_file="$INVALID_SOURCE_WORKTREE/.env.local"
  [[ -f "$env_file" ]] || { echo "invalid-source fallback .env.local is missing" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-invalid-source.log 'no usable inherited environment is available'
  assert_file_contains "$env_file" '^DB_PATH=\./dev-data/sqlite\.db$'
  assert_file_not_contains "$env_file" 'synthetic-invalid-only'
  write_primary_source_env
}

check_damaged_target_is_preserved() {
  log "check damaged target is never overwritten"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$DAMAGED_WORKTREE" >/tmp/worktree-bootstrap-damaged-add.log 2>&1
  )

  local marker_file
  marker_file="$(git -C "$DAMAGED_WORKTREE" rev-parse --git-dir)/.codex-worktree-bootstrap-initialized"
  rm -f "$DAMAGED_WORKTREE/.env.local" "$marker_file"
  printf 'PORT=not-a-port\nSECRET_MARKER=synthetic-damaged-only\n' >"$DAMAGED_WORKTREE/.env.local"
  cp "$DAMAGED_WORKTREE/.env.local" "$TMP_DIR/damaged-target.before"
  (
    cd "$DAMAGED_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    if bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-damaged-file.log 2>&1; then
      echo "bootstrap unexpectedly accepted damaged target" >&2
      exit 1
    fi
  )
  cmp -s "$TMP_DIR/damaged-target.before" "$DAMAGED_WORKTREE/.env.local" || {
    echo "damaged target file was overwritten" >&2
    exit 1
  }
  assert_file_contains /tmp/worktree-bootstrap-damaged-file.log 'bootstrap failed at phase=env'
  assert_file_not_contains /tmp/worktree-bootstrap-damaged-file.log 'synthetic-damaged-only'

  rm -f "$DAMAGED_WORKTREE/.env.local"
  mkdir "$DAMAGED_WORKTREE/.env.local"
  (
    cd "$DAMAGED_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    if bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-damaged-directory.log 2>&1; then
      echo "bootstrap unexpectedly replaced non-regular target" >&2
      exit 1
    fi
  )
  [[ -d "$DAMAGED_WORKTREE/.env.local" ]] || { echo "non-regular target was replaced" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-damaged-directory.log 'not a regular file'

  local fifo_path="$TMP_DIR/source-fifo"
  mkfifo "$fifo_path"
  python3 - "$ROOT_DIR/scripts/lib/worktree-bootstrap-env.py" "$fifo_path" <<'PY'
import subprocess
import sys

completed = subprocess.run(
    [sys.executable, sys.argv[1], "validate", "--path", sys.argv[2]],
    capture_output=True,
    text=True,
    timeout=2,
    check=False,
)
if completed.returncode == 0 or completed.stdout.strip() != "unusable":
    raise SystemExit("FIFO validation was not rejected promptly")
PY
}

check_publish_failure_is_strict_and_non_blocking() {
  log "check environment publication failure boundaries"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$PUBLISH_FAIL_WORKTREE" >/tmp/worktree-bootstrap-publish-fail-add.log 2>&1
  )

  local marker_file
  marker_file="$(git -C "$PUBLISH_FAIL_WORKTREE" rev-parse --git-dir)/.codex-worktree-bootstrap-initialized"
  rm -f "$PUBLISH_FAIL_WORKTREE/.env.local" "$marker_file"
  chmod u-w "$PUBLISH_FAIL_WORKTREE"
  (
    cd "$PUBLISH_FAIL_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    if bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-publish-fail-manual.log 2>&1; then
      echo "manual bootstrap unexpectedly published into read-only worktree" >&2
      exit 1
    fi
  )
  chmod u+w "$PUBLISH_FAIL_WORKTREE"
  [[ ! -e "$PUBLISH_FAIL_WORKTREE/.env.local" ]] || { echo "failed publication left a target file" >&2; exit 1; }
  [[ -z "$(find "$PUBLISH_FAIL_WORKTREE" -maxdepth 1 -name '.env.local.*.tmp' -print -quit)" ]] || {
    echo "failed publication left a temporary target" >&2
    exit 1
  }
  assert_file_contains /tmp/worktree-bootstrap-publish-fail-manual.log 'bootstrap failed at phase=env'

  chmod u-w "$PUBLISH_FAIL_WORKTREE"
  (
    cd "$PUBLISH_FAIL_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    if ! ./scripts/post-checkout-worktree-bootstrap.sh \
      0000000000000000000000000000000000000000 \
      "$(git rev-parse HEAD)" \
      1 >/tmp/worktree-bootstrap-publish-fail-auto.log 2>&1; then
      echo "automatic bootstrap wrapper unexpectedly failed" >&2
      exit 1
    fi
  )
  chmod u+w "$PUBLISH_FAIL_WORKTREE"
  [[ ! -e "$PUBLISH_FAIL_WORKTREE/.env.local" ]] || { echo "automatic failed publication left a target file" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-publish-fail-auto.log 'automatic worktree bootstrap failed'
  assert_file_not_contains /tmp/worktree-bootstrap-publish-fail-auto.log 'synthetic-source-only'
}

check_concurrent_publication_is_atomic() {
  log "check concurrent missing-target publication is atomic"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$CONCURRENT_WORKTREE" >/tmp/worktree-bootstrap-concurrent-add.log 2>&1
  )

  local marker_file scope_id
  marker_file="$(git -C "$CONCURRENT_WORKTREE" rev-parse --git-dir)/.codex-worktree-bootstrap-initialized"
  rm -f "$CONCURRENT_WORKTREE/.env.local" "$marker_file"
  scope_id="$(worktree_scope_id "$CONCURRENT_WORKTREE")"
  python3 "$SNAPSHOT_REPO/scripts/port-registry.py" \
    --registry-dir "$REGISTRY_DIR" \
    --json release-scope \
    --scope-id "$scope_id" >/dev/null

  (
    cd "$CONCURRENT_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db --simulate-failure-step install >/tmp/worktree-bootstrap-concurrent-a.log 2>&1
  ) &
  local first_pid=$!
  (
    cd "$CONCURRENT_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db --simulate-failure-step install >/tmp/worktree-bootstrap-concurrent-b.log 2>&1
  ) &
  local second_pid=$!
  wait "$first_pid" || true
  wait "$second_pid" || true

  local env_file="$CONCURRENT_WORKTREE/.env.local"
  [[ -f "$env_file" ]] || { echo "concurrent publication produced no target" >&2; exit 1; }
  assert_file_contains "$env_file" '^SECRET_MARKER=synthetic-source-only$'
  assert_file_not_contains /tmp/worktree-bootstrap-concurrent-a.log 'synthetic-source-only'
  assert_file_not_contains /tmp/worktree-bootstrap-concurrent-b.log 'synthetic-source-only'
  [[ -z "$(find "$CONCURRENT_WORKTREE" -maxdepth 1 -name '.env.local.*.tmp' -print -quit)" ]] || {
    echo "concurrent publication left a temporary target" >&2
    exit 1
  }

  local inspect_json inspect_count
  inspect_json="$(python3 "$SNAPSHOT_REPO/scripts/port-registry.py" --registry-dir "$REGISTRY_DIR" --json inspect --scope-id "$scope_id")"
  inspect_count="$(python3 - <<'PY' "$inspect_json"
import json
import sys

print(json.loads(sys.argv[1])["count"])
PY
)"
  [[ "$inspect_count" == "3" ]] || { echo "expected one complete three-port lease block, got $inspect_count" >&2; exit 1; }
}

check_dry_run_is_read_only() {
  log "check dry-run does not mutate env or registry"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$DRY_RUN_WORKTREE" >/dev/null 2>&1
  )

  local env_file="$DRY_RUN_WORKTREE/.env.local"
  rm -f "$env_file"
  local marker_file
  marker_file="$(git -C "$DRY_RUN_WORKTREE" rev-parse --git-dir)/.codex-worktree-bootstrap-initialized"
  rm -f "$marker_file"
  local before_count
  before_count="$(python3 "$SNAPSHOT_REPO/scripts/port-registry.py" --registry-dir "$REGISTRY_DIR" --json inspect | python3 -c 'import json,sys; print(json.load(sys.stdin)["count"])')"

  (
    cd "$DRY_RUN_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db --dry-run >/tmp/worktree-bootstrap-dry-run.log 2>&1
  )

  local after_count
  after_count="$(python3 "$SNAPSHOT_REPO/scripts/port-registry.py" --registry-dir "$REGISTRY_DIR" --json inspect | python3 -c 'import json,sys; print(json.load(sys.stdin)["count"])')"

  [[ ! -f "$env_file" ]] || { echo ".env.local should not be created during dry-run" >&2; exit 1; }
  [[ ! -f "$marker_file" ]] || { echo "initialized marker should not be written during dry-run" >&2; exit 1; }
  [[ "$before_count" == "$after_count" ]] || { echo "registry count changed during dry-run" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-dry-run.log 'dry-run: would recover missing \.env\.local from primary and re-lease target ports'
}

check_existing_env_rejects_occupied_port() {
  log "check existing .env.local still rejects occupied ports"
  start_port_holder 34111
  cat >"$MANUAL_WORKTREE/.env.local" <<'EOF'
PORT=34111
SITE_PORT=34114
ADMIN_PORT=34115
DB_PATH=./dev-data/custom.sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/custom-local
CONTENT_SOURCES=local
EOF

  (
    cd "$MANUAL_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    if bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-occupied.log 2>&1; then
      echo "bootstrap unexpectedly accepted occupied port" >&2
      exit 1
    fi
  )

  stop_port_holder
  assert_file_contains /tmp/worktree-bootstrap-occupied.log 'port 34111 is currently LISTENing; refuse to register blindly'
  assert_file_contains /tmp/worktree-bootstrap-occupied.log 'bootstrap failed at phase=env'
}

check_atomic_block_allocation_skips_derived_port_conflict() {
  log "check atomic block allocation skips derived port conflict"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$RECOVERY_WORKTREE" >/dev/null 2>&1
  )

  rm -f "$RECOVERY_WORKTREE/.env.local"
  rm -f "$(git -C "$RECOVERY_WORKTREE" rev-parse --git-dir)/.codex-worktree-bootstrap-initialized"
  local scope_id
  scope_id="$(worktree_scope_id "$RECOVERY_WORKTREE")"
  python3 "$SNAPSHOT_REPO/scripts/port-registry.py" \
    --registry-dir "$REGISTRY_DIR" \
    --json release-scope \
    --scope-id "$scope_id" >/dev/null

  local suggested_json blocked_site_port blocked_admin_port
  suggested_json="$(cd "$RECOVERY_WORKTREE" && CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR" python3 ./scripts/port-registry.py --json suggest --scope-id "$scope_id" --service web)"
  blocked_site_port="$(( $(python3 - <<'PY' "$suggested_json"
import json
import sys
print(json.loads(sys.argv[1])["port"])
PY
) + 3 ))"
  blocked_admin_port="$(( blocked_site_port + 1 ))"

  start_port_holder "$blocked_site_port" PORT_HOLDER_PID
  start_port_holder "$blocked_admin_port" PORT_HOLDER_PID_2

  (
    cd "$RECOVERY_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-partial-block.log 2>&1
  )

  stop_port_holder PORT_HOLDER_PID
  stop_port_holder PORT_HOLDER_PID_2

  local env_file="$RECOVERY_WORKTREE/.env.local"
  [[ -f "$env_file" ]] || { echo ".env.local missing after atomic block allocation" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-partial-block.log 'worktree bootstrap complete'
  assert_file_not_contains "$env_file" "^SITE_PORT=${blocked_site_port}$"
  assert_file_not_contains "$env_file" "^ADMIN_PORT=${blocked_admin_port}$"

  local leased_ports_before
  leased_ports_before="$(grep -E '^(PORT|SITE_PORT|ADMIN_PORT)=' "$env_file" | tr '\n' ';')"
  local inspect_json inspect_count
  inspect_json="$(python3 "$SNAPSHOT_REPO/scripts/port-registry.py" --registry-dir "$REGISTRY_DIR" --json inspect --scope-id "$scope_id")"
  inspect_count="$(python3 - <<'PY' "$inspect_json"
import json
import sys
payload = json.loads(sys.argv[1])
print(payload["count"])
PY
)"
  [[ "$inspect_count" == "3" ]] || { echo "expected exactly 3 leased ports for scope, got $inspect_count" >&2; exit 1; }

  (
    cd "$RECOVERY_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-recovery.log 2>&1
  )

  local leased_ports_after
  leased_ports_after="$(grep -E '^(PORT|SITE_PORT|ADMIN_PORT)=' "$env_file" | tr '\n' ';')"
  assert_file_contains /tmp/worktree-bootstrap-recovery.log 'worktree bootstrap complete'
  [[ "$leased_ports_before" == "$leased_ports_after" ]] || { echo "force rerun changed leased ports unexpectedly" >&2; exit 1; }
}

check_managed_custom_content_root_is_used() {
  log "check dev data generation respects managed custom LOCAL_CONTENT_BASE_PATH"
  local custom_root="$MANUAL_WORKTREE/dev-data/local-fixtures"
  (
    cd "$MANUAL_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    CONTENT_SOURCES=local LOCAL_CONTENT_BASE_PATH="$custom_root" bun run dev-data:generate >/tmp/worktree-bootstrap-custom-content.log 2>&1
  )

  [[ -f "$custom_root/blog/hello-world.md" ]] || { echo "custom content root missing generated fixture" >&2; exit 1; }
}

check_public_export_uses_env_local() {
  log "check public export loads env.local DB settings"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$EXPORT_WORKTREE" >/dev/null 2>&1
  )

  cat >"$EXPORT_WORKTREE/.env.local" <<'EOF'
DB_PATH=./dev-data/export.sqlite.db
LOCAL_CONTENT_BASE_PATH=./dev-data/export-local
CONTENT_SOURCES=local
EOF

  (
    cd "$EXPORT_WORKTREE"
    DB_PATH=./dev-data/export.sqlite.db bun run migrate >/tmp/worktree-bootstrap-export-migrate.log 2>&1
    DB_PATH=./dev-data/export.sqlite.db bun run seed >/tmp/worktree-bootstrap-export-seed.log 2>&1
    CONTENT_SOURCES=local LOCAL_CONTENT_BASE_PATH=./dev-data/export-local bun run dev-data:generate >/tmp/worktree-bootstrap-export-data.log 2>&1
    DB_PATH=./dev-data/export.sqlite.db LOCAL_CONTENT_BASE_PATH=./dev-data/export-local CONTENT_SOURCES=local bun run dev-sync:trigger >/tmp/worktree-bootstrap-export-sync.log 2>&1
    env -u DB_PATH -u LOCAL_CONTENT_BASE_PATH -u CONTENT_SOURCES bun run public:export >/tmp/worktree-bootstrap-export-public.log 2>&1
  )

  local snapshot_file="$EXPORT_WORKTREE/site/generated/public-snapshot.json"
  [[ -f "$snapshot_file" ]] || { echo "public snapshot missing after env-local export" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-export-public.log 'Exported public snapshot to'
  python3 - <<'PY' "$snapshot_file"
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

if not payload.get("posts"):
    raise SystemExit("expected exported snapshot to include posts from env-local database")
PY
}

check_test_env_reset_respects_custom_local_root() {
  log "check test-env:reset respects custom LOCAL_CONTENT_BASE_PATH"
  local custom_test_root="$SNAPSHOT_REPO/test-data/custom-local"

  (
    cd "$SNAPSHOT_REPO"
    DB_PATH=./test-data/custom-reset.sqlite.db \
      LOCAL_CONTENT_BASE_PATH="$custom_test_root" \
      CONTENT_SOURCES=local \
      bun run test-env:reset >/tmp/worktree-bootstrap-test-env-reset.log 2>&1
  )

  [[ -f "$custom_test_root/blog/hello-world.md" ]] || {
    echo "test-env:reset did not generate fixtures in the custom LOCAL_CONTENT_BASE_PATH" >&2
    exit 1
  }
}

check_stale_scope_port_block_is_revalidated() {
  log "check stale scope leases are revalidated before reuse"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$STALE_SCOPE_WORKTREE" >/dev/null 2>&1
  )

  (
    cd "$STALE_SCOPE_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-stale-initial.log 2>&1
  )

  local env_file="$STALE_SCOPE_WORKTREE/.env.local"
  local marker_file
  marker_file="$(git -C "$STALE_SCOPE_WORKTREE" rev-parse --git-dir)/.codex-worktree-bootstrap-initialized"
  local stale_port stale_site_port stale_admin_port
  stale_port="$(grep '^PORT=' "$env_file" | cut -d= -f2)"
  stale_site_port="$(grep '^SITE_PORT=' "$env_file" | cut -d= -f2)"
  stale_admin_port="$(grep '^ADMIN_PORT=' "$env_file" | cut -d= -f2)"

  rm -f "$env_file" "$marker_file"
  start_port_holder "$stale_port" PORT_HOLDER_PID
  start_port_holder "$stale_site_port" PORT_HOLDER_PID_2

  (
    cd "$STALE_SCOPE_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    bash ./scripts/worktree-bootstrap.sh --force --no-db >/tmp/worktree-bootstrap-stale-reuse.log 2>&1
  )

  stop_port_holder PORT_HOLDER_PID
  stop_port_holder PORT_HOLDER_PID_2

  [[ -f "$env_file" ]] || { echo ".env.local missing after stale scope rebootstrap" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-stale-reuse.log 'worktree bootstrap complete'
  assert_file_not_contains "$env_file" "^PORT=${stale_port}$"
  assert_file_not_contains "$env_file" "^SITE_PORT=${stale_site_port}$"
  assert_file_not_contains "$env_file" "^ADMIN_PORT=${stale_admin_port}$"
}

check_dev_fixture_guardrail_for_real_root() {
  log "check dev fixture generation refuses real content roots"
  local real_root="$TMP_DIR/real-content-root"
  mkdir -p "$real_root/Hardware"
  printf 'keep\n' >"$real_root/Hardware/existing.md"

  (
    cd "$SNAPSHOT_REPO"
    if LOCAL_CONTENT_BASE_PATH="$real_root" bun ./scripts/generate-test-data.ts --dev >/tmp/worktree-bootstrap-real-root.log 2>&1; then
      echo "dev fixture generation unexpectedly accepted real content root" >&2
      exit 1
    fi
  )

  [[ -f "$real_root/Hardware/existing.md" ]] || { echo "real content root was mutated" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-real-root.log 'Refusing to manage dev fixtures outside'
  assert_file_contains /tmp/worktree-bootstrap-real-root.log 'Use bun run dev-sync:trigger for existing local content roots'
}

check_test_fixture_clean_removes_root_artifacts() {
  log "check test fixture clean removes root artifacts"
  mkdir -p "$SNAPSHOT_REPO/test-data/local"
  printf 'db\n' >"$SNAPSHOT_REPO/test-data/sqlite.db"
  printf 'post\n' >"$SNAPSHOT_REPO/test-data/local/post.md"

  (
    cd "$SNAPSHOT_REPO"
    LOCAL_CONTENT_BASE_PATH="$SNAPSHOT_REPO/test-data/local" \
      bun ./scripts/generate-test-data.ts --clean >/tmp/worktree-bootstrap-test-clean.log 2>&1
  )

  [[ ! -e "$SNAPSHOT_REPO/test-data/sqlite.db" ]] || { echo "test sqlite artifact should be removed by clean" >&2; exit 1; }
  [[ ! -e "$SNAPSHOT_REPO/test-data/local/post.md" ]] || { echo "test local fixture should be removed by clean" >&2; exit 1; }
  assert_file_contains /tmp/worktree-bootstrap-test-clean.log '已清理 test 数据目录'
}

check_failure_is_non_blocking() {
  log "check post-checkout failure degrades to warning"
  (
    cd "$SNAPSHOT_REPO"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    git worktree add --detach "$FAIL_WORKTREE" >/dev/null 2>&1
  )

  rm -f "$FAIL_WORKTREE/.env.local"
  rm -f "$(git -C "$FAIL_WORKTREE" rev-parse --git-dir)/.codex-worktree-bootstrap-initialized"
  (
    cd "$FAIL_WORKTREE"
    export CODEX_PORT_REGISTRY_DIR="$REGISTRY_DIR"
    export WORKTREE_BOOTSTRAP_SIMULATE_FAILURE_STEP=env
    if ! ./scripts/post-checkout-worktree-bootstrap.sh \
      0000000000000000000000000000000000000000 \
      "$(git rev-parse HEAD)" \
      1 >/tmp/worktree-bootstrap-fail.log 2>&1; then
      echo "post-checkout helper unexpectedly failed" >&2
      exit 1
    fi
  )

  assert_file_contains /tmp/worktree-bootstrap-fail.log 'bootstrap failed at phase=env'
  assert_file_contains /tmp/worktree-bootstrap-fail.log 'automatic worktree bootstrap failed'
  assert_file_contains /tmp/worktree-bootstrap-fail.log 'Recovery: bun run worktree:bootstrap -- --force'
}

create_snapshot_repo
prepare_root_hooks
check_auto_bootstrap
check_primary_source_recovery
check_crlf_source_recovery
check_existing_env_is_preserved
check_legacy_env_is_accepted
check_dry_run_is_read_only
check_primary_source_fallback
check_invalid_primary_source_fallback
check_damaged_target_is_preserved
check_publish_failure_is_strict_and_non_blocking
check_concurrent_publication_is_atomic
check_existing_env_rejects_occupied_port
check_atomic_block_allocation_skips_derived_port_conflict
check_managed_custom_content_root_is_used
check_public_export_uses_env_local
check_test_env_reset_respects_custom_local_root
check_stale_scope_port_block_is_revalidated
check_dev_fixture_guardrail_for_real_root
check_test_fixture_clean_removes_root_artifacts
check_failure_is_non_blocking
log "all worktree bootstrap checks passed"
