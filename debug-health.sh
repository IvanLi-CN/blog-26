#!/bin/bash

# 健康检查调试脚本
set -e

echo "🔍 Blog Health Check Debug Tool"
echo "==============================="

# 检查容器是否运行
echo "1. 检查容器状态..."
if ! docker-compose ps | grep -q "blog.*Up"; then
    echo "❌ Blog 容器没有运行"
    echo "尝试启动容器: docker-compose up -d"
    exit 1
fi
echo "✅ Blog 容器正在运行"

# 获取容器名称
CONTAINER_NAME=$(docker-compose ps -q blog)
if [ -z "$CONTAINER_NAME" ]; then
    echo "❌ 无法获取容器名称"
    exit 1
fi

echo "📦 容器名称: $CONTAINER_NAME"

# 检查端口监听情况
echo ""
echo "2. 检查端口监听情况..."
echo "端口 4321 (Astro 应用):"
docker exec $CONTAINER_NAME netstat -tlnp | grep :4321 || echo "❌ 端口 4321 未监听"

# 检查进程
echo ""
echo "3. 检查应用进程..."
echo "Bun 进程:"
docker exec $CONTAINER_NAME ps aux | grep bun | grep -v grep || echo "❌ 没有找到 bun 进程"

echo "Entry.mjs 进程:"
docker exec $CONTAINER_NAME ps aux | grep entry.mjs | grep -v grep || echo "❌ 没有找到 entry.mjs 进程"

# 测试内部连接
echo ""
echo "4. 测试内部连接..."
echo "测试 Astro 应用 (端口 4321):"
if docker exec $CONTAINER_NAME curl -f -s http://127.0.0.1:4321/api/trpc/health > /dev/null 2>&1; then
    echo "✅ Astro 应用响应正常"
    docker exec $CONTAINER_NAME curl -s http://127.0.0.1:4321/api/trpc/health
else
    echo "❌ Astro 应用无响应"
    echo "尝试详细请求:"
    docker exec $CONTAINER_NAME curl -v http://127.0.0.1:4321/api/trpc/health || true
fi

# 检查最近的日志
echo ""
echo "5. 检查最近的容器日志..."
echo "最近 20 行日志:"
docker-compose logs --tail=20 blog

echo ""
echo "6. 检查错误日志..."
echo "包含 'error' 的日志:"
docker-compose logs blog | grep -i error | tail -10 || echo "没有找到错误日志"

echo ""
echo "包含 'ConnectionRefused' 的日志:"
docker-compose logs blog | grep -i "ConnectionRefused" | tail -5 || echo "没有找到连接拒绝日志"

# 外部连接测试
echo ""
echo "7. 测试外部连接..."
if curl -f -s http://localhost:4321/api/trpc/health > /dev/null 2>&1; then
    echo "✅ 外部访问正常"
    curl -s http://localhost:4321/api/trpc/health
else
    echo "❌ 外部访问失败"
    echo "尝试详细请求:"
    curl -v http://localhost:4321/api/trpc/health || true
fi

echo ""
echo "🔍 调试完成！"
echo ""
echo "💡 常见解决方案:"
echo "1. 如果 Astro 应用无响应，尝试重启容器: docker-compose restart blog"
echo "2. 如果端口未监听，检查应用启动日志中的错误"
echo "3. 如果进程不存在，可能是启动脚本失败，检查配置文件"
echo "4. 如果数据库连接失败，检查 DB_PATH 和权限"
echo "5. 现在 Astro 应用直接运行在 4321 端口，不再使用代理服务器"
