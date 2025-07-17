#!/bin/bash
set -e

echo "🔍 Validating configuration..."
bun test-config.ts

echo "🗄️ Running database migrations..."
bun run migrate

echo "🚀 Starting application..."

# 启动Astro应用在后台
bun --bun ./dist/server/entry.mjs &
ASTRO_PID=$!

# 等待Astro应用启动
sleep 3

# 创建代理服务器来处理静态文件
cat > proxy-server.js << 'EOF'
import { serve } from "bun";
import { existsSync } from "fs";
import path from "path";

serve({
  port: 4321,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // 处理静态资源
    if (url.pathname.startsWith('/_astro/')) {
      const filePath = path.join(process.cwd(), 'dist/client', url.pathname);

      if (existsSync(filePath)) {
        const file = Bun.file(filePath);
        const ext = path.extname(filePath).toLowerCase();

        let contentType = 'application/octet-stream';
        if (ext === '.css') contentType = 'text/css';
        else if (ext === '.js') contentType = 'application/javascript';
        else if (ext === '.json') contentType = 'application/json';
        else if (ext === '.svg') contentType = 'image/svg+xml';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.woff') contentType = 'font/woff';
        else if (ext === '.woff2') contentType = 'font/woff2';
        else if (ext === '.ttf') contentType = 'font/ttf';
        else if (ext === '.ico') contentType = 'image/x-icon';

        return new Response(file, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          }
        });
      }

      return new Response('Not found', { status: 404 });
    }

    // 转发其他请求到Astro应用
    try {
      const astroUrl = new URL(req.url);
      astroUrl.hostname = '127.0.0.1';
      astroUrl.port = '4322';

      const response = await fetch(astroUrl.toString(), {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });

      return response;
    } catch (error) {
      console.error('Error proxying request:', error);
      return new Response('Server error', { status: 500 });
    }
  },
});

console.log("Proxy server listening on http://0.0.0.0:4321/");
EOF

# 停止后台的Astro应用
kill $ASTRO_PID 2>/dev/null || true

# 修改Astro应用监听端口并重新启动
sed -i 's/4321/4322/g' ./dist/server/entry.mjs
bun --bun ./dist/server/entry.mjs &

# 启动代理服务器
exec bun proxy-server.js
