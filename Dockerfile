FROM oven/bun:1 as builder

WORKDIR /app

COPY package.json bun.lockb ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM oven/bun:1 as runner

WORKDIR /app

COPY --from=builder /app/dist/server ./dist/server
COPY --from=builder /app/dist/client ./dist/client
COPY ./scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lockb ./bun.lockb

EXPOSE 4321

COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
