FROM oven/bun:1

WORKDIR /app

COPY ./package.json ./package.json
COPY ./bun.lockb ./bun.lockb

RUN bun install --frozen --no-cache && \
    bunx playwright install --with-deps

COPY ./entrypoint.sh ./entrypoint.sh
COPY ./test-config.ts ./test-config.ts
COPY ./drizzle ./drizzle
COPY ./scripts ./scripts
COPY ./dist/server ./dist/server
COPY ./dist/client ./dist/client

# Set default environment variables
ENV HOST=${HOST:-0.0.0.0}
ENV NODE_ENV=production

# Make entrypoint executable
RUN chmod +x ./entrypoint.sh

EXPOSE 4321

ENTRYPOINT ["./entrypoint.sh"]
