/**
 * 编辑器测试辅助工具
 *
 * 提供测试过程中需要的通用工具函数
 */

import { expect, type Page } from "@playwright/test";

/**
 * 开发环境登录
 */
export async function devLogin(page: Page, email = "admin@test.com"): Promise<void> {
  // 使用 page.request 进行登录
  const response = await page.request.post("/api/dev/login", {
    data: { email },
  });

  expect(response.status()).toBe(200);

  const loginResponse = await response.json();
  expect(loginResponse.success).toBe(true);
  expect(loginResponse.user.email).toBe(email);

  // 获取响应中的 Set-Cookie header
  const setCookieHeader = response.headers()["set-cookie"];
  if (setCookieHeader) {
    // 解析 session cookie
    const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
    if (sessionCookieMatch) {
      const sessionId = sessionCookieMatch[1];

      // 手动设置 cookie 到浏览器上下文
      await page.context().addCookies([
        {
          name: "session_id",
          value: sessionId,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);

      console.log(`✅ 设置 session cookie: ${sessionId.substring(0, 8)}...`);
    }
  }

  // 等待一下确保 cookie 设置生效
  await page.waitForTimeout(1000);
}

/**
 * 等待控制台日志出现
 */
export async function waitForConsoleLog(
  page: Page,
  expectedLog: string,
  timeout = 5000
): Promise<boolean> {
  return page
    .waitForFunction(
      (log) => {
        const logs = (window as any).testLogs || [];
        return logs.some((l: string) => l.includes(log));
      },
      expectedLog,
      { timeout }
    )
    .then(() => true)
    .catch(() => false);
}

/**
 * 捕获网络请求
 */
export async function captureNetworkRequests(page: Page): Promise<string[]> {
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(`${request.method()} ${request.url()}`);
  });
  return requests;
}

/**
 * 测量性能
 */
export async function measurePerformance(
  _page: Page,
  action: () => Promise<void>
): Promise<number> {
  const startTime = Date.now();
  await action();
  const endTime = Date.now();
  return endTime - startTime;
}

/**
 * 失败时截图
 */
export async function takeScreenshotOnFailure(page: Page, testName: string): Promise<Buffer> {
  const screenshot = await page.screenshot({
    path: `test-results/screenshots/${testName}-failure-${Date.now()}.png`,
    fullPage: true,
  });
  return screenshot;
}

/**
 * 设置控制台日志捕获
 */
export async function setupConsoleLogCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // 创建全局日志数组
    (window as any).testLogs = [];

    // 重写console.log来捕获日志
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args
        .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
        .join(" ");

      (window as any).testLogs.push(message);
      originalLog.apply(console, args);
    };
  });
}

/**
 * 清理控制台日志
 */
export async function clearConsoleLogs(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).testLogs = [];
  });
}

/**
 * 获取所有控制台日志
 */
export async function getConsoleLogs(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return (window as any).testLogs || [];
  });
}

/**
 * 等待元素在视口中
 */
export async function waitForElementInViewport(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (sel) => {
        const element = document.querySelector(sel);
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
      },
      selector,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 模拟网络延迟
 */
export async function simulateNetworkDelay(page: Page, delay: number): Promise<void> {
  await page.route("**/*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    route.continue();
  });
}

/**
 * 验证URL参数
 */
export async function verifyUrlParams(
  page: Page,
  expectedParams: Record<string, string>
): Promise<boolean> {
  const url = new URL(page.url());

  for (const [key, value] of Object.entries(expectedParams)) {
    const actualValue = url.searchParams.get(key);
    if (actualValue !== value) {
      console.log(`URL参数不匹配: ${key} 期望 ${value}, 实际 ${actualValue}`);
      return false;
    }
  }

  return true;
}

/**
 * 等待Jotai状态更新（调试器已移除，使用替代方法）
 */
export async function waitForJotaiStateUpdate(
  page: Page,
  stateCheck: (state: any) => boolean,
  timeout = 5000
): Promise<boolean> {
  console.log("ℹ️ Jotai调试器已移除，使用替代状态检查方法");
  try {
    await page.waitForFunction(
      (checker) => {
        // 使用替代方法检查状态，比如检查标签页数量
        const tabs = document.querySelectorAll('button:has-text("✕")');
        const state = {
          activeTabId: null, // 无法直接获取，设为null
          tabCount: tabs.length,
        };
        return checker(state);
      },
      stateCheck,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 创建测试数据验证器
 */
export function createTestDataValidator() {
  const requiredFiles = [
    "blog/01-react-hooks-deep-dive.md",
    "blog/03-graphql-api-best-practices.md",
    "blog/05-redis-caching-strategies.md",
    "projects/01-open-source-component-library.md",
    "memos/01-local-development-environment-setup.md",
  ];

  return {
    async verifyTestDataExists(_page: Page): Promise<boolean> {
      // 这里可以添加验证测试数据是否存在的逻辑
      // 例如检查API端点或文件系统
      return true;
    },

    requiredFiles,
  };
}

/**
 * 浏览器兼容性测试辅助
 */
export async function getBrowserInfo(page: Page): Promise<{
  name: string;
  version: string;
  userAgent: string;
}> {
  const userAgent = await page.evaluate(() => navigator.userAgent);

  let name = "unknown";
  let version = "unknown";

  if (userAgent.includes("Chrome")) {
    name = "chrome";
    version = userAgent.match(/Chrome\/([0-9.]+)/)?.[1] || "unknown";
  } else if (userAgent.includes("Firefox")) {
    name = "firefox";
    version = userAgent.match(/Firefox\/([0-9.]+)/)?.[1] || "unknown";
  } else if (userAgent.includes("Safari")) {
    name = "safari";
    version = userAgent.match(/Version\/([0-9.]+)/)?.[1] || "unknown";
  }

  return { name, version, userAgent };
}

/**
 * 错误恢复辅助
 */
export async function attemptRecovery(page: Page, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // 尝试刷新页面
      await page.reload({ waitUntil: "networkidle" });

      // 等待关键元素出现
      await page.waitForSelector(".directory-tree-container", { timeout: 10000 });

      console.log(`✅ 恢复成功 (尝试 ${attempt}/${maxAttempts})`);
      return true;
    } catch (error) {
      console.log(`⚠️ 恢复失败 (尝试 ${attempt}/${maxAttempts}):`, error);

      if (attempt < maxAttempts) {
        await page.waitForTimeout(1000 * attempt); // 递增延迟
      }
    }
  }

  return false;
}

// 创建EditorTestHelpers对象，包含所有辅助函数
export const EditorTestHelpers = {
  devLogin,
  waitForConsoleLog,
  captureNetworkRequests,
  measurePerformance,
  takeScreenshotOnFailure,
  setupConsoleLogCapture,
  clearConsoleLogs,
  getConsoleLogs,
  waitForElementInViewport,
  simulateNetworkDelay,
  verifyUrlParams,
  waitForJotaiStateUpdate,
  createTestDataValidator,
  getBrowserInfo,
  attemptRecovery,
};

// 导出所有测试辅助函数
// 所有函数已经单独导出，无需重复导出
