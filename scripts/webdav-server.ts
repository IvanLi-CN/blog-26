#!/usr/bin/env bun

/**
 * WebDAV 测试服务器
 * 用于开发环境测试 WebDAV 功能
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// WebDAV 服务器配置
const WEBDAV_CONFIG = {
  port: 8080,
  host: '127.0.0.1',
  rootPath: join(process.cwd(), 'test-data', 'webdav'),
};

// 简单的 WebDAV 服务器实现
class SimpleWebDAVServer {
  private port: number;
  private host: string;
  private rootPath: string;

  constructor(config: typeof WEBDAV_CONFIG) {
    this.port = config.port;
    this.host = config.host;
    this.rootPath = config.rootPath;
  }

  // 处理 PROPFIND 请求
  private async handlePropfind(request: Request, pathname: string): Promise<Response> {
    const depth = request.headers.get('Depth') || '1';
    const fullPath = join(this.rootPath, pathname.replace(/^\//, ''));

    if (!existsSync(fullPath)) {
      return new Response('Not Found', { status: 404 });
    }

    const { readdirSync, statSync } = await import('node:fs');
    const responses: string[] = [];

    // 添加当前目录的响应
    const currentStat = statSync(fullPath);
    const isDirectory = currentStat.isDirectory();

    responses.push(`
  <D:response>
    <D:href>${pathname === '/' ? '/' : pathname}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>${isDirectory ? '<D:collection/>' : ''}</D:resourcetype>
        <D:getlastmodified>${currentStat.mtime.toUTCString()}</D:getlastmodified>
        ${!isDirectory ? `<D:getcontentlength>${currentStat.size}</D:getcontentlength>` : ''}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`);

    // 如果是目录且深度大于0，列出子项
    if (isDirectory && depth !== '0') {
      try {
        const items = readdirSync(fullPath);

        for (const item of items) {
          const itemPath = join(fullPath, item);
          const itemStat = statSync(itemPath);
          const itemHref = pathname === '/' ? `/${item}` : `${pathname}/${item}`;

          responses.push(`
  <D:response>
    <D:href>${itemHref}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype>${itemStat.isDirectory() ? '<D:collection/>' : ''}</D:resourcetype>
        <D:getlastmodified>${itemStat.mtime.toUTCString()}</D:getlastmodified>
        ${!itemStat.isDirectory() ? `<D:getcontentlength>${itemStat.size}</D:getcontentlength>` : ''}
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`);
        }
      } catch (error) {
        console.error('Error reading directory:', error);
      }
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">${responses.join('')}
</D:multistatus>`;

    return new Response(xml, {
      status: 207,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        DAV: '1, 2',
      },
    });
  }

  // 处理 GET 请求
  private async handleGet(pathname: string): Promise<Response> {
    const fullPath = join(this.rootPath, pathname);

    if (!existsSync(fullPath)) {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const file = Bun.file(fullPath);
      const content = await file.text();

      return new Response(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Length': content.length.toString(),
        },
      });
    } catch (_error) {
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  // 处理 PUT 请求
  private async handlePut(request: Request, pathname: string): Promise<Response> {
    const fullPath = join(this.rootPath, pathname);

    try {
      const content = await request.text();
      await Bun.write(fullPath, content);

      return new Response('Created', { status: 201 });
    } catch (_error) {
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  // 处理 DELETE 请求
  private async handleDelete(pathname: string): Promise<Response> {
    const fullPath = join(this.rootPath, pathname);

    if (!existsSync(fullPath)) {
      return new Response('Not Found', { status: 404 });
    }

    try {
      await Bun.write(fullPath, ''); // 简化删除操作
      return new Response('No Content', { status: 204 });
    } catch (_error) {
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  // 处理 OPTIONS 请求
  private handleOptions(): Response {
    return new Response('', {
      status: 200,
      headers: {
        DAV: '1, 2',
        Allow: 'OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, COPY, MOVE, MKCOL, PROPFIND, PROPPATCH, LOCK, UNLOCK',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PROPFIND',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth',
      },
    });
  }

  // 主请求处理器
  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const method = request.method;

    console.log(`${method} ${pathname}`);

    // 处理 CORS 预检请求
    if (method === 'OPTIONS') {
      return this.handleOptions();
    }

    // 路由处理
    switch (method) {
      case 'PROPFIND':
        return this.handlePropfind(request, pathname);
      case 'GET':
        return this.handleGet(pathname);
      case 'PUT':
        return this.handlePut(request, pathname);
      case 'DELETE':
        return this.handleDelete(pathname);
      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  }

  // 启动服务器
  async start(): Promise<void> {
    // 检查测试数据目录
    if (!existsSync(this.rootPath)) {
      console.error(`❌ 测试数据目录不存在: ${this.rootPath}`);
      console.log('请先运行 "bun run test-data:generate" 生成测试数据');
      process.exit(1);
    }

    const server = Bun.serve({
      port: this.port,
      hostname: this.host,
      fetch: (request) => this.handleRequest(request),
    });

    console.log('🚀 WebDAV 测试服务器已启动');
    console.log(`📍 地址: http://${this.host}:${this.port}`);
    console.log(`📁 根目录: ${this.rootPath}`);
    console.log('\n📋 环境变量配置:');
    console.log(`WEBDAV_URL=http://localhost:${this.port}`);
    console.log('\n按 Ctrl+C 停止服务器');

    // 优雅关闭
    process.on('SIGINT', () => {
      console.log('\n👋 正在关闭 WebDAV 服务器...');
      server.stop();
      process.exit(0);
    });
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
WebDAV 测试服务器

用法:
  bun run webdav:start              启动 WebDAV 服务器
  bun run webdav:start --help       显示帮助信息

配置:
  端口: ${WEBDAV_CONFIG.port}
  主机: ${WEBDAV_CONFIG.host}
  根目录: ${WEBDAV_CONFIG.rootPath}

注意:
  请确保已运行 "bun run test-data:generate" 生成测试数据
`);
    return;
  }

  const server = new SimpleWebDAVServer(WEBDAV_CONFIG);
  await server.start();
}

if (import.meta.main) {
  main().catch(console.error);
}
