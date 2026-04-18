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
ARG BRANCH_NAME
ARG BRANCH_URL
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /ms-playwright /ms-playwright
COPY . .
ENV BUILD_DATE=${BUILD_DATE}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV COMMIT_SHORT_HASH=${COMMIT_SHORT_HASH}
ENV REPOSITORY_URL=${REPOSITORY_URL}
ENV BRANCH_NAME=${BRANCH_NAME}
ENV BRANCH_URL=${BRANCH_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TSC_COMPILE_ON_ERROR=1
# Build only the admin SPA in-image. The public Astro site is regenerated at
# runtime from the mounted content/database so production does not serve
# fixture-baked HTML.
RUN bun run admin:build
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
ENV INTERNAL_NEXT_PORT=25092
ENV SITE_PORT=25093
ENV NODE_OPTIONS=--dns-result-order=ipv4first
COPY --from=builder /app/public ./public
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/astro.config.mjs ./astro.config.mjs
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/tailwind.config.ts ./tailwind.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/bunfig.toml ./bunfig.toml
COPY --from=builder /app/site ./site
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/admin-dist ./admin-dist
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder /ms-playwright /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN chmod +x ./docker-entrypoint.sh && \
    mkdir -p /app/data /app/site/generated /app/site-dist /app/admin-dist && \
    chmod -R a+rX /app && \
    chown -R 0:0 /app && \
    chmod 2775 /app/data
EXPOSE 25090
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD sh -c "curl -fsSL http://127.0.0.1:${PORT:-25090}/api/health || exit 1"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "run", "gateway:start"]

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
ENV INTERNAL_NEXT_PORT=25092
ENV SITE_PORT=25093
ENV NODE_OPTIONS=--dns-result-order=ipv4first
COPY public ./public
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./package.json
COPY bun.lock ./bun.lock
COPY astro.config.mjs ./astro.config.mjs
COPY postcss.config.mjs ./postcss.config.mjs
COPY tailwind.config.ts ./tailwind.config.ts
COPY tsconfig.json ./tsconfig.json
COPY bunfig.toml ./bunfig.toml
COPY site ./site
COPY src ./src
COPY scripts ./scripts
COPY drizzle ./drizzle
COPY site-dist ./site-dist
COPY admin-dist ./admin-dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && \
    mkdir -p /app/data /app/site/generated /app/site-dist /app/admin-dist && \
    chmod -R a+rX /app && \
    chown -R 0:0 /app && \
    chmod 2775 /app/data
EXPOSE 25090
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD sh -c "curl -fsSL http://127.0.0.1:${PORT:-25090}/api/health || exit 1"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "run", "gateway:start"]
