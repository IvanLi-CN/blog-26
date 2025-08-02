#!/usr/bin/env bun

/**
 * 测试环境服务器启动脚本
 * 同时启动 WebDAV 和 Astro 服务器，确保两者都正常运行
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// 配置
const CONFIG = {
  webdav: {
    startPort: 8080,
    maxPortTries: 5,
    host: 'localhost',
    rootPath: join(process.cwd(), 'test-data', 'webdav'),
  },
  astro: {
    port: 4321,
    host: 'localhost',
  },
  timeout: 120000, // 2分钟超时
};

// 服务器管理器
class TestServerManager {
  private webdavServer: any = null;
  private astroProcess: any = null;
  private webdavPort: number = CONFIG.webdav.startPort;

  // 检查端口是否可用
  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      const testServer = Bun.serve({
        port,
        hostname: CONFIG.webdav.host,
        fetch: () => new Response('test'),
      });
      testServer.stop();
      await new Promise((resolve) => setTimeout(resolve, 100));
      return true;
    } catch {
      return false;
    }
  }

  // 找到可用的 WebDAV 端口
  private async findWebDAVPort(): Promise<number> {
    for (let i = 0; i < CONFIG.webdav.maxPortTries; i++) {
      const testPort = CONFIG.webdav.startPort + i;
      if (await this.isPortAvailable(testPort)) {
        return testPort;
      }
    }
    throw new Error(`无法找到可用的 WebDAV 端口`);
  }

  // 启动 WebDAV 服务器
  private async startWebDAV(): Promise<void> {
    console.log('🚀 启动 WebDAV 服务器...');

    // 确保测试数据目录存在
    if (!existsSync(CONFIG.webdav.rootPath)) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(CONFIG.webdav.rootPath, { recursive: true });
      console.log(`📁 创建测试数据目录: ${CONFIG.webdav.rootPath}`);
    }

    // 找到可用端口
    this.webdavPort = await this.findWebDAVPort();

    // 启动 WebDAV 服务器
    this.webdavServer = Bun.serve({
      port: this.webdavPort,
      hostname: CONFIG.webdav.host,
      fetch: (request) => this.handleWebDAVRequest(request),
    });

    // 设置环境变量
    process.env.WEBDAV_URL = `http://localhost:${this.webdavPort}`;

    console.log(`✅ WebDAV 服务器已启动: http://localhost:${this.webdavPort}`);
  }

  // 处理 WebDAV 请求
  private async handleWebDAVRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);

    try {
      // 健康检查
      if (pathname === '/' || pathname === '/health') {
        return new Response('WebDAV Server OK', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // PROPFIND 请求
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

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('WebDAV 请求处理错误:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  // 启动 Astro 服务器
  private async startAstro(): Promise<void> {
    console.log('🚀 启动 Astro 服务器...');

    return new Promise((resolve, reject) => {
      this.astroProcess = spawn('bunx', ['--bun', 'astro', 'dev', '--host'], {
        env: {
          ...process.env,
          ADMIN_MODE: 'true',
          NODE_ENV: 'test',
          WEBDAV_URL: `http://localhost:${this.webdavPort}`,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let astroReady = false;
      const timeout = setTimeout(() => {
        if (!astroReady) {
          reject(new Error('Astro 服务器启动超时'));
        }
      }, CONFIG.timeout);

      this.astroProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log(`[Astro] ${output.trim()}`);

        // 检查 Astro 是否已启动 - 更宽松的检测条件
        if (
          (output.includes('Local') || output.includes('ready in')) &&
          (output.includes('4321') || output.includes('4322') || output.includes('4323'))
        ) {
          astroReady = true;
          clearTimeout(timeout);
          console.log('✅ Astro 服务器已启动');
          resolve();
        }
      });

      this.astroProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        console.error(`[Astro Error] ${output.trim()}`);
      });

      this.astroProcess.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.astroProcess.on('exit', (code: number) => {
        if (code !== 0 && !astroReady) {
          clearTimeout(timeout);
          reject(new Error(`Astro 进程退出，代码: ${code}`));
        }
      });
    });
  }

  // 验证服务器
  private async verifyServers(): Promise<void> {
    console.log('🔍 验证服务器状态...');

    // 验证 WebDAV
    try {
      const webdavResponse = await fetch(`http://localhost:${this.webdavPort}/health`);
      if (!webdavResponse.ok) {
        throw new Error(`WebDAV 响应异常: ${webdavResponse.status}`);
      }
      console.log('✅ WebDAV 服务器验证成功');
    } catch (error) {
      throw new Error(`WebDAV 验证失败: ${error}`);
    }

    // 验证 Astro - 尝试多个可能的端口
    const astroPorts = [4321, 4322, 4323, 4324];
    let astroVerified = false;

    for (const port of astroPorts) {
      try {
        const astroResponse = await fetch(`http://localhost:${port}`);
        if (astroResponse.ok) {
          console.log(`✅ Astro 服务器验证成功 (端口 ${port})`);
          astroVerified = true;
          break;
        }
      } catch {
        // 继续尝试下一个端口
      }
    }

    if (!astroVerified) {
      throw new Error('Astro 验证失败: 无法连接到任何端口');
    }
  }

  // 启动所有服务器
  async start(): Promise<void> {
    try {
      // 启动 WebDAV 服务器
      await this.startWebDAV();

      // 启动 Astro 服务器
      await this.startAstro();

      // 验证服务器
      await this.verifyServers();

      console.log('🎉 所有测试服务器已启动并验证成功');
      console.log(`📍 WebDAV: http://localhost:${this.webdavPort}`);
      console.log(`📍 Astro: http://localhost:${CONFIG.astro.port}`);

      // 设置优雅关闭
      this.setupGracefulShutdown();
    } catch (error) {
      console.error('❌ 服务器启动失败:', error);
      await this.stop();
      process.exit(1);
    }
  }

  // 停止所有服务器
  async stop(): Promise<void> {
    console.log('👋 正在关闭测试服务器...');

    if (this.webdavServer) {
      this.webdavServer.stop();
      console.log('✅ WebDAV 服务器已关闭');
    }

    if (this.astroProcess) {
      this.astroProcess.kill('SIGTERM');
      console.log('✅ Astro 服务器已关闭');
    }
  }

  // 设置优雅关闭
  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      await this.stop();
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
  const manager = new TestServerManager();
  await manager.start();
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  });
}
