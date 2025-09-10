# syntax=docker/dockerfile:1.7

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./

# Speed up dependency install with BuildKit cache; keep it cacheable across builds
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen

# Optional Playwright installation (disabled by default for production builds)
ARG WITH_PLAYWRIGHT=false
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN mkdir -p /ms-playwright
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    if [ "$WITH_PLAYWRIGHT" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends \
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
        libgbm1 \
      && rm -rf /var/lib/apt/lists/*; \
    fi
RUN if [ "$WITH_PLAYWRIGHT" = "true" ]; then \
      timeout 1200 bunx playwright install chromium --force; \
    fi
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
ENV TSC_COMPILE_ON_ERROR=1
# Reuse Next.js build cache across runs
RUN --mount=type=cache,target=/app/.next/cache \
    bun run prebuild && \
    bun run build
FROM oven/bun:1-slim AS app-image-built
WORKDIR /app
ARG DRIZZLE_ORM_VERSION=0.44.2
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt-get update && \
    apt-get install -y --no-install-recommends \
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
COPY --from=builder /app/.next/BUILD_ID ./.next/BUILD_ID
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /ms-playwright /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN chmod +x ./docker-entrypoint.sh && \
    mkdir -p /app/data && \
    chmod -R a+rX /app && \
    chown -R 0:0 /app && \
    chmod 2775 /app/data && \
    bun add drizzle-orm@${DRIZZLE_ORM_VERSION}
EXPOSE 25090
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD sh -c "curl -fsSL http://127.0.0.1:${PORT:-25090}/api/health || exit 1"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "server.js"]

# Prebuilt target: use prebuilt Next.js output from build artifacts
FROM oven/bun:1-slim AS app-image-prebuilt
WORKDIR /app
ARG DRIZZLE_ORM_VERSION=0.44.2
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt-get update && \
    apt-get install -y --no-install-recommends \
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
# Copy from build artifacts already present in the build context
COPY public ./public
COPY .next/standalone ./
COPY .next/static ./.next/static
COPY .next/BUILD_ID ./.next/BUILD_ID
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && \
    mkdir -p /app/data && \
    chmod -R a+rX /app && \
    chown -R 0:0 /app && \
    chmod 2775 /app/data && \
    bun add drizzle-orm@${DRIZZLE_ORM_VERSION}
EXPOSE 25090
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD sh -c "curl -fsSL http://127.0.0.1:${PORT:-25090}/api/health || exit 1"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "server.js"]
