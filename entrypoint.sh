#!/bin/bash
set -e

echo "Running database migrations..."
bun run migrate

echo "Starting application..."
bun ./dist/server/entry.mjs
