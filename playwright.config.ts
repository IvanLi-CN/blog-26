import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E测试配置
 * 用于测试闪念列表页图片灯箱功能等交互特性
 */
export default defineConfig({
  // 测试目录
  testDir: "./e2e",

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
    ["html", { outputFolder: "test-results/html-report" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["line"],
  ],

  // 输出目录
  outputDir: "test-results/artifacts/",

  // 全局测试配置
  use: {
    // 基础URL
    baseURL: "http://localhost:3000",

    // 浏览器配置
    headless: process.env.HEADLESS !== "false",
    viewport: { width: 1280, height: 720 },

    // 截图和视频
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",

    // 网络配置
    ignoreHTTPSErrors: true,

    // 等待配置
    actionTimeout: 10 * 1000, // 10秒
    navigationTimeout: 30 * 1000, // 30秒
  },

  // 项目配置 - 不同浏览器
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // 开发服务器配置
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2分钟启动超时
    env: {
      NODE_ENV: "test",
      ADMIN_MODE: "true",
      // 确保 WebDAV 配置在测试环境中正确传递
      WEBDAV_URL: "http://localhost:8080",
    },
  },
});
