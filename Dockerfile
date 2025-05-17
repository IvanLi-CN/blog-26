FROM oven/bun:1

WORKDIR /app

COPY ./package.json ./package.json
COPY ./bun.lockb ./bun.lockb

RUN bun install --frozen --no-cache

COPY ./entrypoint.sh ./entrypoint.sh
COPY ./drizzle ./drizzle
COPY ./scripts ./scripts
COPY ./dist/server ./dist/server
COPY ./dist/client ./dist/client

EXPOSE 4321

ENTRYPOINT ["./entrypoint.sh"]
