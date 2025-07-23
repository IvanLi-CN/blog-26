#!/bin/bash

# Blog Troubleshooting Script
set -e

echo "🔍 Blog Troubleshooting Tool"
echo "=========================="

# Check if Docker is running
echo "1. Checking Docker status..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi
echo "✅ Docker is running"

# Check if .env file exists
echo "2. Checking .env file..."
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi
echo "✅ .env file exists"

# Check environment variables
echo "3. Checking critical environment variables..."
source .env

critical_vars=(
    "LUOSIMAO_SECRET_KEY"
    "JWT_SECRET" 
    "OPENAI_API_KEY"
)

for var in "${critical_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ $var is not set or empty"
    else
        echo "✅ $var is set"
    fi
done

# Check if containers are running
echo "4. Checking container status..."
if docker-compose ps | grep -q "Up"; then
    echo "✅ Some containers are running"
    docker-compose ps
else
    echo "❌ No containers are running"
    echo "Try running: docker-compose up -d"
fi

# Check container logs for errors
echo "5. Checking recent container logs for errors..."
if docker-compose ps -q blog > /dev/null 2>&1; then
    echo "Blog container logs (last 20 lines):"
    docker-compose logs --tail=20 blog
else
    echo "❌ Blog container is not running"
fi

# Check if ports are available
echo "6. Checking port availability..."
if lsof -i :4321 > /dev/null 2>&1; then
    echo "⚠️  Port 4321 is in use:"
    lsof -i :4321
else
    echo "✅ Port 4321 is available"
fi

# Test application connectivity
echo "7. Testing application connectivity..."
if curl -f http://localhost:4321 > /dev/null 2>&1; then
    echo "✅ Application is responding"
else
    echo "❌ Application is not responding on http://localhost:4321"
fi

# Test health endpoint specifically
echo "8. Testing health endpoint..."
if curl -f http://localhost:4321/api/trpc/health > /dev/null 2>&1; then
    echo "✅ Health endpoint is responding"
    echo "Health response:"
    curl -s http://localhost:4321/api/trpc/health | head -3
else
    echo "❌ Health endpoint is not responding"
    echo "This might indicate the Astro backend (port 4322) is not running"
fi

# Check for proxy errors in logs
echo "9. Checking for proxy connection errors..."
if docker-compose logs blog 2>/dev/null | grep -q "ConnectionRefused"; then
    echo "⚠️  Found ConnectionRefused errors in logs"
    echo "This indicates the proxy server cannot connect to the Astro backend"
    echo "Recent ConnectionRefused errors:"
    docker-compose logs blog | grep "ConnectionRefused" | tail -3
    echo ""
    echo "💡 Suggested actions:"
    echo "   - Run './debug-health.sh' for detailed diagnosis"
    echo "   - Check if Astro app is running on port 4322"
    echo "   - Restart the container: docker-compose restart blog"
else
    echo "✅ No ConnectionRefused errors found in recent logs"
fi

echo ""
echo "🔧 Common solutions:"
echo "  - If LUOSIMAO_SECRET_KEY error: Check your .env file"
echo "  - If port in use: docker-compose down && docker-compose up -d"
echo "  - If build fails: docker-compose build --no-cache"
echo "  - If database issues: Check sqlite.db file permissions"
echo "  - View full logs: docker-compose logs -f blog"
