import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E测试配置
 *
 * 注意：此配置与Mermaid图表渲染的Playwright使用分离
 * Mermaid渲染使用rehype-mermaid插件的内置Playwright配置
 */
export default defineConfig({
  // 测试目录
  testDir: './tests/e2e/specs',

  // 全局设置文件
  globalSetup: './tests/e2e/setup/global-setup.ts',
  globalTeardown: './tests/e2e/setup/global-teardown.ts',

  // 测试超时设置
  timeout: 30 * 1000, // 30秒
  expect: {
    timeout: 5 * 1000, // 5秒
  },

  // 测试配置
  fullyParallel: true, // 并行运行测试
  forbidOnly: !!process.env.CI, // CI环境禁止only
  retries: process.env.CI ? 2 : 0, // CI环境重试2次
  workers: process.env.CI ? 1 : undefined, // CI环境使用1个worker

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
    headless: !!process.env.CI,
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

  // 项目配置 - 不同浏览器
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // 可选：其他浏览器测试
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // 开发服务器配置
  webServer: {
    command: 'bun run dev:test',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2分钟启动超时
    env: {
      // 测试环境变量
      NODE_ENV: 'test',
      ADMIN_MODE: 'true',
      DB_PATH: ':memory:',
      WEBDAV_URL: 'http://localhost:8080',
      WEBDAV_USERNAME: '',
      WEBDAV_PASSWORD: '',
      WEBDAV_MEMOS_PATH: '/Memos',
      WEBDAV_ASSETS_PATH: '/assets',
      JWT_SECRET: 'test-jwt-secret-key-for-testing-only-32-chars',
      ADMIN_EMAIL: 'admin@test.com',
    },
  },
});
