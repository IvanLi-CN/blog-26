import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright CI环境配置
 * 专门用于CI环境，不启动webServer，假设服务器已经手动启动
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e/specs',

  // 全局设置文件
  globalSetup: './tests/e2e/setup/global-setup.ts',
  globalTeardown: './tests/e2e/setup/global-teardown.ts',

  // 测试超时设置
  timeout: 60 * 1000, // 60秒
  expect: {
    timeout: 10 * 1000, // 10秒
  },

  // 测试配置
  fullyParallel: false, // 禁用并行运行，避免测试干扰
  forbidOnly: !!process.env.CI, // CI环境禁止only
  retries: process.env.CI ? 2 : 0, // CI环境重试2次
  workers: 1, // 使用单个worker确保测试隔离

  // 报告配置
  reporter: [
    ['html', { outputFolder: 'test-results/html-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['line'],
  ],

  // 输出目录
  outputDir: 'test-results/artifacts/',

  // 全局测试配置
  use: {
    // 基础URL
    baseURL: 'http://localhost:4321',

    // 浏览器配置
    headless: true, // CI环境强制无头模式
    viewport: { width: 1280, height: 720 },

    // 截图和视频
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',

    // 网络配置
    ignoreHTTPSErrors: true,

    // 等待配置
    actionTimeout: 10 * 1000, // 10秒
    navigationTimeout: 30 * 1000, // 30秒
  },

  // 项目配置 - 只使用chromium
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // CI环境不启动webServer，假设服务器已经手动启动
});
