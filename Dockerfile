FROM oven/bun:1

WORKDIR /app

COPY ./package.json ./package.json
COPY ./bun.lockb ./bun.lockb

RUN bun install --frozen --no-cache && \
  apt-get update && \
  apt-get install -y curl && \
  rm -rf /var/lib/apt/lists/*

COPY ./entrypoint.sh ./entrypoint.sh
COPY ./test-config.ts ./test-config.ts
COPY ./drizzle ./drizzle
COPY ./scripts ./scripts
COPY ./src/lib/config.ts ./src/lib/config.ts
COPY ./dist/server ./dist/server
COPY ./dist/client ./dist/client

# Set default environment variables
ENV HOST=${HOST:-0.0.0.0}
ENV NODE_ENV=production

# Make entrypoint executable
RUN chmod +x ./entrypoint.sh

EXPOSE 4321

# Health check using tRPC health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:4321/api/trpc/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
