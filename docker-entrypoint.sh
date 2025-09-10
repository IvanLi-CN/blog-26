#!/bin/bash
set -euo pipefail

echo "🚀 Starting Docker container..."

# Note: we rely on Docker build-time to produce artifacts; runtime does not validate again.

# 允许使用 RUN_UID/GID 或 APP_UID/GID（后者与 compose/.env.docker 注释一致）
RUN_UID=${RUN_UID:-${APP_UID:-1000}}
RUN_GID=${RUN_GID:-${APP_GID:-1000}}
APP_CMD=("${@:-bun server.js}")

# 设置数据库路径（与 compose/.env.docker 保持一致）
export DB_PATH="${DB_PATH:-/app/data/sqlite.db}"
DB_DIR="$(dirname "$DB_PATH")"
echo "📁 Database path: $DB_PATH"

# 确保数据目录存在
mkdir -p "$DB_DIR"

# 在 root 下预修复目录与文件权限，然后再降权
if [ "$(id -u)" = "0" ]; then
  echo "👤 Preparing runtime uid:gid ${RUN_UID}:${RUN_GID}"

  # 创建数据库文件（若不存在），避免 SQLite 初始创建时因权限导致失败
  if [ ! -f "$DB_PATH" ]; then
    echo "🧩 Creating empty database file at $DB_PATH"
    : > "$DB_PATH" || true
  fi

  # 目录权限：rwxrwsr-x (2775)，便于同组用户写入；文件权限：rw-rw-r-- (664)
  chmod 2775 "$DB_DIR" || true
  chmod 664 "$DB_PATH" 2>/dev/null || true

  # 目录/文件归属权交给目标 uid:gid（忽略失败以适配某些 bind mount 限制）
  if chown -R ${RUN_UID}:${RUN_GID} "$DB_DIR" 2>/dev/null; then
    echo "✅ Owned $DB_DIR by ${RUN_UID}:${RUN_GID}"
  else
    echo "⚠️  Could not chown $DB_DIR (likely bind mount without perms); continuing"
  fi

  # 校验关键配置（以便尽早失败）
  echo "🧪 Validating configuration as ${RUN_UID}:${RUN_GID}..."
  if [ -z "${WEBDAV_URL:-}" ]; then
    echo "❌ Config validation failed: WEBDAV_URL is not set"
    exit 1
  fi
  echo "✅ Config validation passed (WEBDAV_URL present)"

  # 以目标身份执行迁移（可容忍失败，避免影响服务启动）
  echo "🔄 Running database migrations as ${RUN_UID}:${RUN_GID}..."
  if gosu ${RUN_UID}:${RUN_GID} env DB_PATH="$DB_PATH" bun ./scripts/migrate.ts; then
    echo "✅ Database migrations completed"
  else
    echo "❌ Database migrations failed, but continuing..."
  fi

  echo "🌟 Starting app as ${RUN_UID}:${RUN_GID}: ${APP_CMD[*]}"
  exec gosu ${RUN_UID}:${RUN_GID} env DB_PATH="$DB_PATH" "${APP_CMD[@]}"
else
  echo "👤 Already running as uid:gid=$(id -u):$(id -g)"
  echo "🧪 Validating configuration as current user..."
  if [ -z "${WEBDAV_URL:-}" ]; then
    echo "❌ Config validation failed: WEBDAV_URL is not set"
    exit 1
  fi
  echo "✅ Config validation passed (WEBDAV_URL present)"
  echo "🔄 Running database migrations as current user..."
  if DB_PATH="$DB_PATH" bun ./scripts/migrate.ts; then
    echo "✅ Database migrations completed"
  else
    echo "❌ Database migrations failed, but continuing..."
  fi
  echo "🌟 Starting app: ${APP_CMD[*]}"
  exec DB_PATH="$DB_PATH" "${APP_CMD[@]}"
fi
