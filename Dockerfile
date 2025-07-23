FROM oven/bun:1

WORKDIR /app

COPY ./package.json ./package.json
COPY ./bun.lockb ./bun.lockb

# Install system dependencies for Chromium (minimal set)
RUN apt-get update && \
  apt-get install -y \
  curl \
  ca-certificates \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxss1 \
  libgconf-2-4 \
  libxcomposite1 \
  libxrandr2 \
  libasound2 \
  libpangocairo-1.0-0 \
  libgtk-3-0 && \
  rm -rf /var/lib/apt/lists/*

# Install Node.js dependencies (including playwright for runtime Mermaid rendering)
RUN bun install --frozen --no-cache

# Install Playwright with non-interactive settings
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Skip Playwright installation for now to focus on ConnectionRefused issue
# RUN timeout 600 bunx playwright install chromium --force

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Set default environment variables
ENV HOST=${HOST:-0.0.0.0}
ENV NODE_ENV=production

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Make entrypoint executable
RUN chmod +x ./entrypoint.sh

EXPOSE 4321

# Health check using tRPC health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:4321/api/trpc/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
