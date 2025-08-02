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
  host: 'localhost',
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

      // 检查文件扩展名来确定内容类型
      const ext = pathname.toLowerCase().split('.').pop();
      let contentType = 'application/octet-stream';

      if (ext === 'jpg' || ext === 'jpeg') {
        contentType = 'image/jpeg';
      } else if (ext === 'png') {
        contentType = 'image/png';
      } else if (ext === 'gif') {
        contentType = 'image/gif';
      } else if (ext === 'webp') {
        contentType = 'image/webp';
      } else if (ext === 'svg') {
        contentType = 'image/svg+xml';
      } else if (ext === 'md' || ext === 'txt') {
        contentType = 'text/plain; charset=utf-8';
      }

      // 对于图片文件，使用 arrayBuffer() 来保持二进制数据
      if (contentType.startsWith('image/')) {
        const buffer = await file.arrayBuffer();
        return new Response(buffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': buffer.byteLength.toString(),
          },
        });
      } else {
        // 对于文本文件，使用 text()
        const content = await file.text();
        return new Response(content, {
          headers: {
            'Content-Type': contentType,
            'Content-Length': content.length.toString(),
          },
        });
      }
    } catch (_error) {
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  // 处理 PUT 请求
  private async handlePut(request: Request, pathname: string): Response {
    const fullPath = join(this.rootPath, pathname);
    console.log(`📝 PUT 请求: ${pathname} -> ${fullPath}`);

    try {
      // 确保目录存在
      const { mkdirSync } = await import('node:fs');
      const { dirname } = await import('node:path');
      const dir = dirname(fullPath);

      if (!existsSync(dir)) {
        console.log(`📁 创建目录: ${dir}`);
        mkdirSync(dir, { recursive: true });
      }

      // 检查Content-Type来决定如何处理内容
      const contentType = request.headers.get('Content-Type') || '';
      console.log(`📋 Content-Type: ${contentType}`);

      let content: string | Uint8Array;
      let contentLength: number;

      if (contentType.startsWith('image/') || contentType.startsWith('application/')) {
        // 处理二进制内容（图片、文件等）
        const arrayBuffer = await request.arrayBuffer();
        content = new Uint8Array(arrayBuffer);
        contentLength = arrayBuffer.byteLength;
        console.log(`💾 写入二进制文件，大小: ${contentLength} 字节`);
      } else {
        // 处理文本内容
        content = await request.text();
        contentLength = content.length;
        console.log(`💾 写入文本文件，大小: ${contentLength} 字符`);
        console.log(`📄 文件内容预览: ${content.substring(0, 200)}...`);
      }

      await Bun.write(fullPath, content);
      console.log(`✅ 文件写入成功: ${fullPath}`);

      return new Response('Created', { status: 201 });
    } catch (error) {
      console.error(`❌ PUT 请求失败: ${pathname}`, error);
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

  // 处理 MKCOL 请求（创建目录）
  private async handleMkcol(pathname: string): Promise<Response> {
    const fullPath = join(this.rootPath, pathname);
    console.log(`📁 MKCOL 请求: ${pathname} -> ${fullPath}`);

    try {
      // 检查父目录是否存在
      const { dirname } = await import('node:path');
      const parentDir = dirname(fullPath);

      if (!existsSync(parentDir)) {
        console.log(`❌ 父目录不存在: ${parentDir}`);
        return new Response('Conflict', { status: 409 });
      }

      // 检查目录是否已存在
      if (existsSync(fullPath)) {
        console.log(`❌ 目录已存在: ${fullPath}`);
        return new Response('Method Not Allowed', { status: 405 });
      }

      // 创建目录
      const { mkdirSync } = await import('node:fs');
      mkdirSync(fullPath, { recursive: false });
      console.log(`✅ 目录创建成功: ${fullPath}`);

      return new Response('Created', { status: 201 });
    } catch (error) {
      console.error(`❌ MKCOL 请求失败: ${pathname}`, error);
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
      case 'MKCOL':
        return this.handleMkcol(pathname);
      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  }

  // 检查端口是否可用
  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      const testServer = Bun.serve({
        port,
        hostname: this.host,
        fetch: () => new Response('test'),
      });
      testServer.stop();
      return true;
    } catch {
      return false;
    }
  }

  // 等待端口可用
  private async waitForPortAvailable(maxRetries = 10): Promise<number> {
    let currentPort = this.port;

    for (let i = 0; i < maxRetries; i++) {
      if (await this.isPortAvailable(currentPort)) {
        return currentPort;
      }

      console.log(`⚠️ 端口 ${currentPort} 被占用，尝试端口 ${currentPort + 1}`);
      currentPort++;
    }

    throw new Error(`无法找到可用端口，已尝试 ${this.port} 到 ${currentPort - 1}`);
  }

  // 启动服务器
  async start(): Promise<void> {
    try {
      // 检查测试数据目录
      if (!existsSync(this.rootPath)) {
        console.error(`❌ 测试数据目录不存在: ${this.rootPath}`);
        console.log('请先运行 "bun run test-data:generate" 生成测试数据');
        process.exit(1);
      }

      // 等待端口可用
      const availablePort = await this.waitForPortAvailable();
      this.port = availablePort;

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

      // 处理未捕获的异常
      process.on('uncaughtException', (error) => {
        console.error('❌ WebDAV 服务器发生未捕获异常:', error);
        server.stop();
        process.exit(1);
      });
    } catch (error) {
      console.error('❌ WebDAV 服务器启动失败:', error);
      process.exit(1);
    }
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
