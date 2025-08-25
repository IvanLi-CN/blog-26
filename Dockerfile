# 多阶段构建优化的 Next.js Dockerfile
# 基于旧项目配置，针对 Next.js 进行优化

# ===== 依赖安装阶段 =====
FROM oven/bun:1 AS deps
WORKDIR /app

# 复制依赖文件（优化 Docker 层缓存）
COPY package.json bun.lock ./

# 安装系统依赖（Playwright 需要）
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

# 安装依赖（包括 Playwright）
RUN bun install --frozen --no-cache

# 安装 Playwright 浏览器
ENV DEBIAN_FRONTEND=noninteractive
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN timeout 1200 bunx playwright install chromium --force

# ===== 构建阶段 =====
FROM oven/bun:1 AS builder
WORKDIR /app

# 构建参数（从 CI 传入）
ARG BUILD_DATE
ARG COMMIT_HASH
ARG COMMIT_SHORT_HASH
ARG REPOSITORY_URL

# 从依赖阶段复制 node_modules
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /ms-playwright /ms-playwright

# 复制源代码
COPY . .

# 设置构建时环境变量
ENV BUILD_DATE=${BUILD_DATE}
ENV COMMIT_HASH=${COMMIT_HASH}
ENV COMMIT_SHORT_HASH=${COMMIT_SHORT_HASH}
ENV REPOSITORY_URL=${REPOSITORY_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 生成版本信息并构建应用
RUN bun run prebuild && \
    bun run build

# ===== 运行时阶段 =====
FROM oven/bun:1-slim AS runner
WORKDIR /app

# 创建非 root 用户
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

# 安装运行时必需的系统依赖
RUN apt-get update && \
    apt-get install -y \
    curl \
    ca-certificates \
    sqlite3 && \
    rm -rf /var/lib/apt/lists/*

# 设置生产环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOST=0.0.0.0
ENV PORT=3000

# 从构建阶段复制必要文件
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 复制 Playwright 浏览器（用于 Mermaid 渲染）
COPY --from=builder /ms-playwright /ms-playwright
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 创建数据目录
RUN mkdir -p /app/data && \
    chown -R nextjs:nodejs /app/data

# 创建上传目录
RUN mkdir -p /app/public/uploads && \
    chown -R nextjs:nodejs /app/public/uploads

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

# 健康检查（使用 tRPC health 端点）
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/trpc/health || exit 1

# 启动应用
CMD ["bun", "server.js"]
