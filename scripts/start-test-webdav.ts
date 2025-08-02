#!/usr/bin/env bun

/**
 * 测试环境 WebDAV 服务器启动脚本
 * 专门为测试环境设计，具有更好的错误处理和端口管理
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// WebDAV 服务器配置
const WEBDAV_CONFIG = {
  startPort: 8080,
  maxPortTries: 10,
  host: 'localhost',
  rootPath: join(process.cwd(), 'test-data', 'webdav'),
};

// 测试环境 WebDAV 服务器
class TestWebDAVServer {
  private port: number;
  private host: string;
  private rootPath: string;
  private server: any = null;

  constructor(config: typeof WEBDAV_CONFIG) {
    this.port = config.startPort;
    this.host = config.host;
    this.rootPath = config.rootPath;
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
      await new Promise((resolve) => setTimeout(resolve, 100)); // 等待端口释放
      return true;
    } catch {
      return false;
    }
  }

  // 找到可用端口
  private async findAvailablePort(): Promise<number> {
    for (let i = 0; i < WEBDAV_CONFIG.maxPortTries; i++) {
      const testPort = WEBDAV_CONFIG.startPort + i;
      if (await this.isPortAvailable(testPort)) {
        return testPort;
      }
    }
    throw new Error(
      `无法找到可用端口，已尝试 ${WEBDAV_CONFIG.startPort} 到 ${WEBDAV_CONFIG.startPort + WEBDAV_CONFIG.maxPortTries - 1}`
    );
  }

  // 处理请求的简化版本
  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    try {
      // 简单的健康检查
      if (pathname === '/' || pathname === '/health') {
        return new Response('WebDAV Server OK', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // 基本的 WebDAV 响应
      if (request.method === 'PROPFIND') {
        return new Response(
          `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>${pathname}</D:href>
    <D:propstat>
      <D:prop>
        <D:resourcetype><D:collection/></D:resourcetype>
        <D:getlastmodified>${new Date().toUTCString()}</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`,
          {
            status: 207,
            headers: { 'Content-Type': 'application/xml; charset=utf-8' },
          }
        );
      }

      // 其他方法返回基本响应
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('WebDAV 请求处理错误:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  // 启动服务器
  async start(): Promise<void> {
    try {
      // 检查测试数据目录，如果不存在则创建
      if (!existsSync(this.rootPath)) {
        console.log(`📁 创建测试数据目录: ${this.rootPath}`);
        const { mkdirSync } = await import('node:fs');
        mkdirSync(this.rootPath, { recursive: true });
      }

      // 找到可用端口
      this.port = await this.findAvailablePort();

      // 启动服务器
      this.server = Bun.serve({
        port: this.port,
        hostname: this.host,
        fetch: (request) => this.handleRequest(request),
      });

      console.log('🚀 测试环境 WebDAV 服务器已启动');
      console.log(`📍 地址: http://${this.host}:${this.port}`);
      console.log(`📁 根目录: ${this.rootPath}`);
      console.log(`🔧 测试模式: 简化的 WebDAV 实现`);

      // 设置环境变量
      process.env.WEBDAV_URL = `http://localhost:${this.port}`;
      console.log(`🌍 环境变量: WEBDAV_URL=http://localhost:${this.port}`);

      // 优雅关闭处理
      this.setupGracefulShutdown();

      // 验证服务器启动
      await this.verifyServer();
    } catch (error) {
      console.error('❌ WebDAV 服务器启动失败:', error);
      process.exit(1);
    }
  }

  // 验证服务器是否正常启动
  private async verifyServer(): Promise<void> {
    try {
      const response = await fetch(`http://${this.host}:${this.port}/health`);
      if (response.ok) {
        console.log('✅ WebDAV 服务器验证成功');
      } else {
        throw new Error(`服务器响应异常: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ WebDAV 服务器验证失败:', error);
      throw error;
    }
  }

  // 设置优雅关闭
  private setupGracefulShutdown(): void {
    const shutdown = () => {
      console.log('\n👋 正在关闭 WebDAV 服务器...');
      if (this.server) {
        this.server.stop();
      }
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('uncaughtException', (error) => {
      console.error('❌ 未捕获异常:', error);
      shutdown();
    });
  }
}

// 主函数
async function main() {
  const server = new TestWebDAVServer(WEBDAV_CONFIG);
  await server.start();
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  });
}
