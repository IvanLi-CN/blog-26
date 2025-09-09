FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
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
    libgtk-3-0 \
    libgbm1 && \
    rm -rf /var/lib/apt/lists/*
RUN bun install --frozen --no-cache
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN timeout 1200 bunx playwright install chromium --force
FROM oven/bun:1 AS builder
WORKDIR /app
ARG BUILD_DATE
ARG COMMIT_HASH
ARG COMMIT_SHORT_HASH
ARG REPOSITORY_URL
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /ms-playwright /ms-playwright
COPY . .
ENV BUILD_DATE=${BUILD_DATE}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV COMMIT_SHORT_HASH=${COMMIT_SHORT_HASH}
ENV REPOSITORY_URL=${REPOSITORY_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run prebuild && \
    bun run build
FROM oven/bun:1-slim AS runner
WORKDIR /app
RUN apt-get update && \
    apt-get install -y \
    curl \
    ca-certificates \
    sqlite3 \
    gosu && \
    rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=25090
ENV NODE_OPTIONS=--dns-result-order=ipv4first
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /ms-playwright /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN chmod +x ./docker-entrypoint.sh && \
    mkdir -p /app/data && \
    chmod -R a+rX /app && \
    chown -R 0:0 /app && \
    chmod 2775 /app/data
EXPOSE 25090
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD sh -c "curl -fsSL http://127.0.0.1:${PORT:-25090}/api/health || exit 1"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "server.js"]
