#!/bin/bash
set -euo pipefail

echo "🚀 Starting Docker container..."

RUN_UID=${RUN_UID:-1000}
RUN_GID=${RUN_GID:-1000}
APP_CMD=("${@:-bun server.js}")

# 确保数据目录存在
mkdir -p /app/data

# 设置数据库路径（与 compose/.env.docker 保持一致）
export DB_PATH="/app/data/sqlite.db"
echo "📁 Database path: $DB_PATH"

if [ "$(id -u)" = "0" ]; then
  echo "👤 Preparing runtime uid:gid ${RUN_UID}:${RUN_GID}"
  # 数据目录归属交给目标 uid:gid（忽略失败以适配只读卷）
  if chown -R ${RUN_UID}:${RUN_GID} /app/data 2>/dev/null; then
    echo "✅ Owned /app/data by ${RUN_UID}:${RUN_GID}"
  else
    echo "⚠️  Could not chown /app/data (likely bind mount without perms); continuing"
  fi

  # 先验证配置（以目标身份）
  echo "🧪 Validating configuration as ${RUN_UID}:${RUN_GID}..."
  if gosu ${RUN_UID}:${RUN_GID} bun scripts/validate-config.ts; then
    echo "✅ Config validation passed"
  else
    echo "❌ Config validation failed"
    exit 1
  fi

  # 用目标身份执行迁移与应用
  echo "🔄 Running database migrations as ${RUN_UID}:${RUN_GID}..."
  if gosu ${RUN_UID}:${RUN_GID} bun run migrate; then
    echo "✅ Database migrations completed"
  else
    echo "❌ Database migrations failed, but continuing..."
  fi

  echo "🌟 Starting app as ${RUN_UID}:${RUN_GID}: ${APP_CMD[*]}"
  exec gosu ${RUN_UID}:${RUN_GID} "${APP_CMD[@]}"
else
  echo "👤 Already running as uid:gid=$(id -u):$(id -g)"
  echo "🧪 Validating configuration as current user..."
  if bun scripts/validate-config.ts; then
    echo "✅ Config validation passed"
  else
    echo "❌ Config validation failed"
    exit 1
  fi
  echo "🔄 Running database migrations as current user..."
  if bun run migrate; then
    echo "✅ Database migrations completed"
  else
    echo "❌ Database migrations failed, but continuing..."
  fi
  echo "🌟 Starting app: ${APP_CMD[*]}"
  exec "${APP_CMD[@]}"
fi
