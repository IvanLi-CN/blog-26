import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E测试配置
 * 用于测试闪念列表页图片灯箱功能等交互特性
 */
// Keep server and test-runner using the same emails
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const USER_EMAIL = process.env.USER_EMAIL || "user@test.local";
const EMAIL_HEADER_NAME = process.env.SSO_EMAIL_HEADER_NAME || "Remote-Email";

// Use absolute paths to avoid CI cwd differences
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ABS_TEST_DB = resolvePath(__dirname, "test-data/sqlite.db");
const ABS_LOCAL_CONTENT = resolvePath(__dirname, "test-data/local");

export default defineConfig({
  // 测试目录
  testDir: "./tests/e2e",

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
    ["html", { outputFolder: "test-results/html-report", open: "never" }],
    ["json", { outputFile: "test-results/results.json" }],
    ["line"],
  ],

  // 输出目录
  outputDir: "test-results/artifacts/",

  // 全局测试配置
  use: {
    // 基础URL - 使用环境变量或默认端口
    baseURL: process.env.BASE_URL || "http://localhost:25090",

    // 浏览器配置
    headless: process.env.HEADLESS !== "false",
    viewport: { width: 1280, height: 720 },

    // 截图和视频
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",

    // 网络配置
    ignoreHTTPSErrors: true,

    // 注意：不在全局层面注入认证头，分别在项目维度注入（guest/admin/user 分组）

    // 等待配置
    actionTimeout: 10 * 1000, // 10秒
    navigationTimeout: 30 * 1000, // 30秒
  },

  // 项目配置 - 三组身份 + 浏览器
  projects: [
    // 游客访问（不注入 Remote-Email 头）
    {
      name: "guest-chromium",
      testMatch: ["**/guest/**/*.spec.ts"],
      use: { ...devices["Desktop Chrome"], extraHTTPHeaders: {} },
    },
    // 普通用户访问（注入非管理员邮箱）
    {
      name: "user-chromium",
      testMatch: ["**/user/**/*.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: { [EMAIL_HEADER_NAME]: USER_EMAIL },
      },
    },
    // 管理员访问（注入管理员邮箱）
    {
      name: "admin-chromium",
      testMatch: ["**/admin/**/*.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: { [EMAIL_HEADER_NAME]: ADMIN_EMAIL },
      },
    },
  ],

  // E2E 测试服务器配置
  webServer: [
    // 1) dufs WebDAV 服务器
    {
      command: "dufs test-data/webdav --port 25091 --allow-all --enable-cors",
      url: "http://localhost:25091",
      reuseExistingServer: true,
      timeout: 30 * 1000, // 30秒启动超时
    },
    // 2) Next.js 应用：先 reset 测试数据，再启动 dev 服务器
    {
      command: `WEBDAV_URL=http://localhost:25091 DB_PATH=${ABS_TEST_DB} bun run test-env:reset && ADMIN_EMAIL=${ADMIN_EMAIL} SSO_EMAIL_HEADER_NAME=${EMAIL_HEADER_NAME} DB_PATH=${ABS_TEST_DB} NODE_ENV=test E2E_MODE=1 LOCAL_CONTENT_BASE_PATH=${ABS_LOCAL_CONTENT} PORT=25090 bun --bun next dev --turbopack --port 25090`,
      url: process.env.BASE_URL || "http://localhost:25090",
      reuseExistingServer: true, // CI环境不重用，本地开发重用
      timeout: 180 * 1000, // 3分钟启动超时，包含 reset 阶段
      env: {
        NODE_ENV: "test",
        ADMIN_EMAIL,
        DB_PATH: ABS_TEST_DB,
        PORT: "25090",
        LOCAL_CONTENT_BASE_PATH: ABS_LOCAL_CONTENT,
        WEBDAV_URL: "http://localhost:25091",
        E2E_MODE: "1", // 启用测试环境下的 Files API 本地回退
      },
    },
  ],
});
