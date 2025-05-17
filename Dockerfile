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
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lockb ./bun.lockb

# 暴露 Astro 默认的预览端口
EXPOSE 4321

# 运行 Astro 预览服务器
CMD ["bun", "./dist/server/entry.mjs"]
