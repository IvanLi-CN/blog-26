FROM oven/bun:1

WORKDIR /app

COPY ./package.json ./package.json
COPY ./bun.lockb ./bun.lockb

RUN bun install --frozen --no-cache && \
    bunx playwright install --with-deps

COPY ./entrypoint.sh ./entrypoint.sh
COPY ./drizzle ./drizzle
COPY ./scripts ./scripts
COPY ./dist/server ./dist/server
COPY ./dist/client ./dist/client

ENV HOST=${HOST:-0.0.0.0}

EXPOSE 4321

ENTRYPOINT ["./entrypoint.sh"]
