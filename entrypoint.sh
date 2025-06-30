#!/bin/bash
set -e

echo "🔍 Validating configuration..."
bun test-config.ts

echo "🗄️ Running database migrations..."
bun run migrate

echo "🚀 Starting application..."
bun ./dist/server/entry.mjs
