#!/bin/bash
set -e

echo "🚀 Starting Docker container..."

# 确保数据目录存在
mkdir -p /app/data

# 设置数据库路径
export DB_PATH="/app/data/sqlite.db"

echo "📁 Database path: $DB_PATH"

# 运行数据库迁移
echo "🔄 Running database migrations..."
if bun run migrate; then
    echo "✅ Database migrations completed successfully"
else
    echo "❌ Database migrations failed, but continuing..."
    # 不要因为迁移失败而停止容器启动
fi

# 启动应用
echo "🌟 Starting Next.js application..."
exec bun server.js
