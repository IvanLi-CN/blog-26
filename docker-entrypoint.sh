#!/bin/bash
set -euo pipefail

echo "🚀 Starting Docker container..."

echo "🌐 Environment variables (startup):"
if command -v printenv >/dev/null 2>&1; then
  printenv | sort
else
  env | sort
fi

RUN_UID=${RUN_UID:-${APP_UID:-1000}}
RUN_GID=${RUN_GID:-${APP_GID:-1000}}
if [ "$#" -gt 0 ]; then
  APP_CMD=("$@")
else
  APP_CMD=(bun run gateway:start)
fi

export DB_PATH="${DB_PATH:-/app/data/sqlite.db}"
export PORT="${PORT:-25090}"
export INTERNAL_NEXT_PORT="${INTERNAL_NEXT_PORT:-$((PORT + 2))}"
export SITE_PORT="${SITE_PORT:-$((PORT + 3))}"
export SITE_DIST_DIR="${SITE_DIST_DIR:-/app/site-dist}"
export ADMIN_DIST_DIR="${ADMIN_DIST_DIR:-/app/admin-dist}"
export PUBLIC_SNAPSHOT_PATH="${PUBLIC_SNAPSHOT_PATH:-/app/site/generated/public-snapshot.json}"
export ASTRO_TYPES_DIR="${ASTRO_TYPES_DIR:-/app/.astro}"
export ASTRO_CACHE_DIR="${ASTRO_CACHE_DIR:-${SITE_DIST_DIR}/.astro-cache}"
export VITE_CACHE_DIR="${VITE_CACHE_DIR:-${SITE_DIST_DIR}/.vite-cache}"

if [ -z "${PUBLIC_SITE_URL:-}" ] && [ -n "${NEXT_PUBLIC_SITE_URL:-}" ]; then
  export PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL}"
fi
if [ -z "${NEXT_PUBLIC_SITE_URL:-}" ] && [ -n "${PUBLIC_SITE_URL:-}" ]; then
  export NEXT_PUBLIC_SITE_URL="${PUBLIC_SITE_URL}"
fi
if [ -z "${NEXT_PUBLIC_SITE_URL:-}" ] && [ -n "${SITE_URL:-}" ]; then
  export NEXT_PUBLIC_SITE_URL="${SITE_URL}"
  export PUBLIC_SITE_URL="${SITE_URL}"
fi

DB_DIR="$(dirname "$DB_PATH")"
echo "📁 Database path: $DB_PATH"
echo "🌿 Public snapshot path: $PUBLIC_SNAPSHOT_PATH"
echo "🌐 Gateway port: $PORT | internal Next: $INTERNAL_NEXT_PORT | Astro build dir: $SITE_DIST_DIR | Admin build dir: $ADMIN_DIST_DIR"
echo "🧩 Astro types dir: $ASTRO_TYPES_DIR"
echo "🪐 Astro cache dir: $ASTRO_CACHE_DIR"
echo "⚡ Vite cache dir: $VITE_CACHE_DIR"

mkdir -p "$DB_DIR" "$SITE_DIST_DIR" "$ADMIN_DIST_DIR" "$(dirname "$PUBLIC_SNAPSHOT_PATH")" "$ASTRO_TYPES_DIR" "$ASTRO_CACHE_DIR" "$VITE_CACHE_DIR"

requires_webdav() {
  local sources="${CONTENT_SOURCES:-}"
  if [ -z "$sources" ]; then
    return 0
  fi
  case ",$sources," in
    *,webdav,*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

validate_runtime_config() {
  if requires_webdav && [ -z "${WEBDAV_URL:-}" ]; then
    echo "❌ Config validation failed: WEBDAV_URL is required when WebDAV source is enabled"
    exit 1
  fi
  echo "✅ Runtime configuration validated"
}

validate_prebuilt_assets() {
  if [ ! -f "${ADMIN_DIST_DIR}/index.html" ]; then
    echo "❌ Missing prebuilt admin SPA asset: ${ADMIN_DIST_DIR}/index.html"
    echo "❌ Prebuilt runtime assets are incomplete. Aborting startup."
    exit 1
  fi

  echo "✅ Prebuilt admin SPA assets detected"
}

run_as_target_user() {
  if [ "$(id -u)" = "0" ]; then
    gosu "${RUN_UID}:${RUN_GID}" "$@"
  else
    "$@"
  fi
}

if [ "$(id -u)" = "0" ]; then
  echo "👤 Preparing runtime uid:gid ${RUN_UID}:${RUN_GID}"

  if [ ! -f "$DB_PATH" ]; then
    echo "🧩 Creating empty database file at $DB_PATH"
    : > "$DB_PATH" || true
  fi

  chmod 2775 "$DB_DIR" "$SITE_DIST_DIR" "$ADMIN_DIST_DIR" "$(dirname "$PUBLIC_SNAPSHOT_PATH")" "$ASTRO_TYPES_DIR" "$ASTRO_CACHE_DIR" "$VITE_CACHE_DIR" || true
  chmod 664 "$DB_PATH" 2>/dev/null || true

  if chown -R "${RUN_UID}:${RUN_GID}" "$DB_DIR" "$SITE_DIST_DIR" "$ADMIN_DIST_DIR" "$(dirname "$PUBLIC_SNAPSHOT_PATH")" "$ASTRO_TYPES_DIR" "$ASTRO_CACHE_DIR" "$VITE_CACHE_DIR" 2>/dev/null; then
    echo "✅ Owned runtime directories by ${RUN_UID}:${RUN_GID}"
  else
    echo "⚠️  Could not chown runtime directories (likely bind mount without perms); continuing"
  fi
else
  echo "👤 Already running as uid:gid=$(id -u):$(id -g)"
fi

validate_runtime_config
validate_prebuilt_assets

echo "🔄 Running database migrations..."
if run_as_target_user env \
  DB_PATH="$DB_PATH" \
  PORT="$PORT" \
  INTERNAL_NEXT_PORT="$INTERNAL_NEXT_PORT" \
  SITE_PORT="$SITE_PORT" \
  PUBLIC_SNAPSHOT_PATH="$PUBLIC_SNAPSHOT_PATH" \
  ASTRO_CACHE_DIR="$ASTRO_CACHE_DIR" \
  VITE_CACHE_DIR="$VITE_CACHE_DIR" \
  NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-}" \
  PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-}" \
  bun ./scripts/migrate.ts; then
  echo "✅ Database migrations completed"
else
  echo "❌ Database migrations failed. Aborting startup."
  exit 1
fi

echo "🌿 Building Astro public site from runtime content..."
if run_as_target_user env \
  DB_PATH="$DB_PATH" \
  PORT="$PORT" \
  INTERNAL_NEXT_PORT="$INTERNAL_NEXT_PORT" \
  SITE_PORT="$SITE_PORT" \
  SITE_DIST_DIR="$SITE_DIST_DIR" \
  PUBLIC_SNAPSHOT_PATH="$PUBLIC_SNAPSHOT_PATH" \
  ASTRO_CACHE_DIR="$ASTRO_CACHE_DIR" \
  VITE_CACHE_DIR="$VITE_CACHE_DIR" \
  NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-}" \
  PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-}" \
  bun run site:build; then
  echo "✅ Astro public site build completed"
else
  echo "❌ Astro public site build failed. Aborting startup."
  exit 1
fi

echo "🌟 Starting app: ${APP_CMD[*]}"
if [ "$(id -u)" = "0" ]; then
  exec gosu "${RUN_UID}:${RUN_GID}" env \
    DB_PATH="$DB_PATH" \
    PORT="$PORT" \
    INTERNAL_NEXT_PORT="$INTERNAL_NEXT_PORT" \
    SITE_PORT="$SITE_PORT" \
    SITE_DIST_DIR="$SITE_DIST_DIR" \
    ADMIN_DIST_DIR="$ADMIN_DIST_DIR" \
    PUBLIC_SNAPSHOT_PATH="$PUBLIC_SNAPSHOT_PATH" \
    ASTRO_CACHE_DIR="$ASTRO_CACHE_DIR" \
    VITE_CACHE_DIR="$VITE_CACHE_DIR" \
    NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-}" \
    PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-}" \
    "${APP_CMD[@]}"
else
  exec env \
    DB_PATH="$DB_PATH" \
    PORT="$PORT" \
    INTERNAL_NEXT_PORT="$INTERNAL_NEXT_PORT" \
    SITE_PORT="$SITE_PORT" \
    SITE_DIST_DIR="$SITE_DIST_DIR" \
    ADMIN_DIST_DIR="$ADMIN_DIST_DIR" \
    PUBLIC_SNAPSHOT_PATH="$PUBLIC_SNAPSHOT_PATH" \
    ASTRO_CACHE_DIR="$ASTRO_CACHE_DIR" \
    VITE_CACHE_DIR="$VITE_CACHE_DIR" \
    NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-}" \
    PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-}" \
    "${APP_CMD[@]}"
fi
