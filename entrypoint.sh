#!/bin/bash
set -e

echo "🔍 Validating configuration..."
bun test-config.ts

# Playwright browsers are pre-installed during Docker build

echo "🗄️ Running database migrations..."
bun run migrate

echo "🚀 Starting application..."

# Astro应用直接在4321端口启动（默认端口）
echo "🌟 Starting Astro application on port 4321..."
exec bun --bun ./dist/server/entry.mjs


