#!/usr/bin/env bash
set -euo pipefail

ACTION=${1:-start}
PORT=${PORT:-25090}
WEBDAV_PORT=${WEBDAV_PORT:-25091}
DB_PATH=${DB_PATH:-./dev-data/sqlite.db}
LOCAL_CONTENT_BASE_PATH=${LOCAL_CONTENT_BASE_PATH:-./dev-data/local}
WEBDAV_URL=${WEBDAV_URL:-http://localhost:${WEBDAV_PORT}}

LOG_DIR="tmp"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/dev-stack-${PORT}.log"
PID_FILE="$LOG_DIR/dev-stack-${PORT}.pid"

ensure_not_running() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || true)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "Process already running (PID $pid). Use '$0 stop' first." >&2
      exit 1;
    else
      rm -f "$PID_FILE"
    fi
  fi
}

case "$ACTION" in
  start)
    ensure_not_running
    echo "Starting dev stack on port $PORT (log: $LOG_FILE)" >&2
    nohup env PORT="$PORT" WEBDAV_PORT="$WEBDAV_PORT" DB_PATH="$DB_PATH" \
      LOCAL_CONTENT_BASE_PATH="$LOCAL_CONTENT_BASE_PATH" WEBDAV_URL="$WEBDAV_URL" \
      bun run dev >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
    ;;
  stop)
    if [[ -f "$PID_FILE" ]]; then
      pid=$(cat "$PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        echo "Stopping dev stack (PID $pid)" >&2
        kill "$pid"
        wait "$pid" 2>/dev/null || true
      fi
      rm -f "$PID_FILE"
    else
      echo "No PID file found. Nothing to stop." >&2
    fi
    ;;
  status)
    if [[ -f "$PID_FILE" ]]; then
      pid=$(cat "$PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        echo "Running (PID $pid, log $LOG_FILE)"
      else
        echo "PID file present but process not running."
      fi
    else
      echo "Not running"
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|status}" >&2
    exit 1
    ;;
esac
