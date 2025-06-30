#!/bin/bash

# Blog Deployment Script
set -e

echo "🚀 Starting blog deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and configure your environment variables."
    echo "cp .env.example .env"
    exit 1
fi

# Check if required environment variables are set
echo "🔍 Checking environment variables..."

required_vars=(
    "LUOSIMAO_SECRET_KEY"
    "JWT_SECRET"
    "OPENAI_API_KEY"
    "ADMIN_EMAIL"
)

missing_vars=()

for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env || grep -q "^${var}=$" .env || grep -q "^${var}=\"\"$" .env; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ Error: The following required environment variables are missing or empty:"
    for var in "${missing_vars[@]}"; do
        echo "  - $var"
    done
    echo "Please configure these variables in your .env file."
    exit 1
fi

echo "✅ Environment variables check passed!"

# Build the application
echo "🔨 Building the application..."
bun run build

# Build and start Docker containers
echo "🐳 Building and starting Docker containers..."
docker-compose down --remove-orphans
docker-compose build --no-cache
docker-compose up -d

echo "⏳ Waiting for services to start..."
sleep 10

# Check if the application is running
echo "🔍 Checking application health..."
if curl -f http://localhost:4321 > /dev/null 2>&1; then
    echo "✅ Application is running successfully!"
    echo "🌐 Your blog is available at: http://localhost:4321"
else
    echo "❌ Application health check failed!"
    echo "📋 Checking container logs..."
    docker-compose logs blog
    exit 1
fi

echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Useful commands:"
echo "  View logs:           docker-compose logs -f blog"
echo "  Stop services:       docker-compose down"
echo "  Restart services:    docker-compose restart"
echo "  View all containers: docker-compose ps"
