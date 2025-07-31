#!/usr/bin/env bun

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';

/**
 * E2E测试运行脚本
 * 自动设置环境并运行端到端测试
 */

interface RunOptions {
  ui?: boolean;
  debug?: boolean;
  headed?: boolean;
  spec?: string;
  setup?: boolean;
  cleanup?: boolean;
  report?: boolean;
}

class E2ETestRunner {
  private processes: any[] = [];

  async run(options: RunOptions = {}) {
    console.log('🚀 启动E2E测试运行器...\n');

    try {
      if (options.setup !== false) {
        await this.setup();
      }

      await this.runTests(options);

      if (options.report) {
        await this.showReport();
      }

      if (options.cleanup !== false) {
        await this.cleanup();
      }

      console.log('\n✅ E2E测试完成');
    } catch (error) {
      console.error('\n❌ E2E测试失败:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async setup() {
    console.log('🔧 设置测试环境...');

    // 1. 检查必要的目录
    await this.ensureDirectories();

    // 2. 生成测试图片
    console.log('🖼️ 生成测试图片...');
    await this.runCommand('bun', ['tests/e2e/utils/generate-test-images.ts']);

    // 3. 生成测试数据
    console.log('📝 生成测试数据...');
    await this.runCommand('bun', ['run', 'test-data:generate']);

    // 4. 启动WebDAV服务器
    console.log('🌐 启动WebDAV服务器...');
    const webdavProcess = spawn('bun', ['run', 'webdav:start'], {
      stdio: 'pipe',
      env: { ...process.env },
    });

    this.processes.push(webdavProcess);

    // 5. 等待WebDAV服务器启动
    await this.waitForWebDAV();

    console.log('✅ 测试环境设置完成\n');
  }

  private async ensureDirectories() {
    const dirs = ['test-results', 'test-results/screenshots', 'tests/e2e/test-data/images', 'tests/e2e/setup'];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
  }

  private async waitForWebDAV() {
    console.log('⏳ 等待WebDAV服务器启动...');

    const maxRetries = 30;
    const retryInterval = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch('http://localhost:8080');
        if (response.status === 200 || response.status === 401) {
          console.log('✅ WebDAV服务器已启动');
          return;
        }
      } catch (_error) {
        // 继续重试
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
    }

    throw new Error('WebDAV服务器启动超时');
  }

  private async runTests(options: RunOptions) {
    console.log('🧪 运行E2E测试...');

    const args = ['playwright', 'test'];

    // 添加选项
    if (options.ui) {
      args.push('--ui');
    }

    if (options.debug) {
      args.push('--debug');
    }

    if (options.headed) {
      args.push('--headed');
    }

    if (options.spec) {
      args.push(options.spec);
    }

    // 设置环境变量
    const testEnv = {
      ...process.env,
      NODE_ENV: 'test',
      ADMIN_MODE: 'true',
      JWT_SECRET: 'test-jwt-secret-key-for-testing-only-32-chars',
      ADMIN_EMAIL: 'admin@test.com',
      DB_PATH: ':memory:',
      WEBDAV_URL: 'http://localhost:8080',
      WEBDAV_USERNAME: '',
      WEBDAV_PASSWORD: '',
      WEBDAV_MEMOS_PATH: '/Memos',
      WEBDAV_ASSETS_PATH: '/assets',
    };

    await this.runCommand('bunx', args, testEnv);
  }

  private async showReport() {
    console.log('📊 显示测试报告...');
    await this.runCommand('bunx', ['playwright', 'show-report', 'test-results/html-report']);
  }

  private async cleanup() {
    console.log('🧹 清理测试环境...');

    // 终止所有子进程
    for (const process of this.processes) {
      if (process && !process.killed) {
        process.kill('SIGTERM');
      }
    }

    // 清理测试数据
    try {
      await this.runCommand('bun', ['run', 'test-data:clean']);
    } catch (error) {
      console.warn('清理测试数据时出错:', error);
    }

    console.log('✅ 清理完成');
  }

  private async runCommand(command: string, args: string[], env?: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args, {
        stdio: 'inherit',
        env: env || process.env,
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`命令失败，退出码: ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }
}

// 解析命令行参数
function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const options: RunOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--ui':
        options.ui = true;
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--headed':
        options.headed = true;
        break;
      case '--no-setup':
        options.setup = false;
        break;
      case '--no-cleanup':
        options.cleanup = false;
        break;
      case '--report':
        options.report = true;
        break;
      case '--spec':
        options.spec = args[++i];
        break;
      case '--help':
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
E2E测试运行器

用法: bun scripts/run-e2e-tests.ts [选项]

选项:
  --ui              以UI模式运行测试
  --debug           以调试模式运行测试
  --headed          以有头模式运行测试
  --spec <文件>     运行特定测试文件
  --no-setup        跳过环境设置
  --no-cleanup      跳过清理步骤
  --report          运行后显示报告
  --help            显示此帮助信息

示例:
  bun scripts/run-e2e-tests.ts                    # 运行所有测试
  bun scripts/run-e2e-tests.ts --ui               # UI模式运行
  bun scripts/run-e2e-tests.ts --spec memo-publish.spec.ts  # 运行特定测试
  bun scripts/run-e2e-tests.ts --debug --headed   # 调试模式
  bun scripts/run-e2e-tests.ts --report           # 运行后显示报告
`);
}

// 主函数
async function main() {
  const options = parseArgs();
  const runner = new E2ETestRunner();

  // 处理进程退出信号
  process.on('SIGINT', async () => {
    console.log('\n🛑 收到中断信号，正在清理...');
    await runner.cleanup();
    process.exit(0);
  });

  await runner.run(options);
}

// 如果直接运行此脚本
if (import.meta.main) {
  main().catch(console.error);
}

export { E2ETestRunner };
