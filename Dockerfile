# syntax=docker/dockerfile:1.7
# This file only packages a verified native runtime bundle. Use image:prepare first.
ARG BUN_DONOR_IMAGE=oven/bun:1.4.2
ARG RUNTIME_IMAGE=ubuntu:24.04
FROM ${BUN_DONOR_IMAGE} AS bun-donor
FROM ${RUNTIME_IMAGE} AS runtime
WORKDIR /app
ARG WITH_PLAYWRIGHT=false
ARG PUBLIC_ASSISTANT_LAUNCHER_DEFAULT=true
RUN test "$WITH_PLAYWRIGHT" = false || { echo 'Container browser/build mode is unsupported; provide a native runtime bundle' >&2; exit 2; }
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates sqlite3 gosu libstdc++6 libgcc-s1 libatomic1 && \
    rm -rf /var/lib/apt/lists/*
COPY --from=bun-donor /usr/local/bin/bun /usr/local/bin/bun
ENV NODE_ENV=production
ENV BIND_HOST=0.0.0.0
ENV PORT=25090
ENV NODE_OPTIONS=--dns-result-order=ipv4first
ENV SERVE_PUBLIC_SITE=false
ENV PUBLIC_CORS_ALLOWED_ORIGINS=https://ivanli.cc
ENV PUBLIC_ASSISTANT_LAUNCHER_DEFAULT=${PUBLIC_ASSISTANT_LAUNCHER_DEFAULT}
# Dependency bytes stay in their own layer across application/identity changes.
COPY --chown=0:0 deps/node_modules ./node_modules
COPY --chown=0:0 app/ ./
RUN mkdir -p /app/data && chmod 2775 /app/data && test -x ./docker-entrypoint.sh
EXPOSE 25090
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD sh -c "curl -fsSL http://127.0.0.1:${PORT:-25090}/api/health || exit 1"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["bun", "run", "console:start"]

# Historical target names are packaging-only aliases, without build fallbacks.
FROM runtime AS app-image-built
FROM runtime AS app-image-prebuilt
