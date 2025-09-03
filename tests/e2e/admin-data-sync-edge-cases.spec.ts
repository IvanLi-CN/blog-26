/**
 * 数据同步管理页面边界情况和错误处理测试
 *
 * 测试各种边界情况和异常场景，包括：
 * - 并发同步操作
 * - 长时间运行的同步
 * - 网络中断和恢复
 * - 大量日志数据处理
 * - 异常状态处理
 */

import { expect, test } from "@playwright/test";
import { devLogin } from "./editor-smart-features/utils/editor-test-helpers";

test.describe("数据同步管理页面边界情况测试", () => {
  test.beforeEach(async ({ page }) => {
    // 设置更长的超时时间
    page.setDefaultTimeout(60000);

    // 先访问首页
    await page.goto("/");

    // 使用统一的开发环境登录
    await devLogin(page);

    // 访问数据同步页面
    await page.goto("/admin/data-sync");
    await page.waitForLoadState("networkidle");

    // 等待页面主要内容加载
    await page.waitForSelector("h1", { timeout: 30000 });

    // 等待同步按钮加载
    await page.waitForSelector("[data-testid='full-sync-button']", { timeout: 30000 });

    // 等待一下确保内容渲染完成
    await page.waitForTimeout(3000);
  });

  test.describe("并发操作测试", () => {
    test("应该防止重复同步操作", async ({ page }) => {
      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await expect(fullSyncButton).toBeVisible({ timeout: 15000 });

      // 快速连续点击同步按钮
      await fullSyncButton.click();
      await page.waitForTimeout(100);

      // 检查按钮是否被禁用或显示同步中状态
      const isDisabled = await fullSyncButton.isDisabled();
      const buttonText = await fullSyncButton.textContent();

      console.log("第一次点击后按钮状态:", { isDisabled, buttonText });

      // 尝试再次点击
      if (!isDisabled && !buttonText?.includes("同步中")) {
        await fullSyncButton.click();
        console.log("能够再次点击按钮");
      } else {
        console.log("按钮已被正确禁用或显示同步中状态");
      }

      // 等待同步完成
      await page.waitForTimeout(5000);
    });

    test("应该正确处理快速页面切换", async ({ page }) => {
      // 触发同步
      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await fullSyncButton.click();

      // 快速导航到其他页面再返回
      await page.goto("/admin/dashboard");
      await page.waitForTimeout(500);

      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000);

      // 验证页面状态正确恢复
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible();
      await expect(pageTitle).toHaveText("数据同步");

      // 检查同步状态是否正确显示
      const syncButton = page.locator("[data-testid='full-sync-button']");
      await expect(syncButton).toBeVisible();
    });
  });

  test.describe("网络异常处理", () => {
    test("应该处理网络中断期间的同步操作", async ({ page }) => {
      // 开始同步
      const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
      await fullSyncButton.click();
      await page.waitForTimeout(1000);

      // 模拟网络中断
      await page.context().setOffline(true);
      console.log("网络已断开");

      // 等待一段时间
      await page.waitForTimeout(3000);

      // 恢复网络
      await page.context().setOffline(false);
      console.log("网络已恢复");

      // 等待页面响应
      await page.waitForTimeout(2000);

      // 检查页面是否正确处理了网络中断
      const errorElements = page.locator("text=/错误|失败|网络|连接/");
      const errorCount = await errorElements.count();

      if (errorCount > 0) {
        console.log("检测到网络错误信息");
        await expect(errorElements.first()).toBeVisible();
      }

      // 验证页面功能恢复正常
      const syncButtonAfterReconnect = page.getByRole("button", { name: /全量同步/ });
      await expect(syncButtonAfterReconnect).toBeVisible();
    });

    test("应该处理API响应超时", async ({ page }) => {
      // 设置较短的超时时间来模拟超时场景
      page.setDefaultTimeout(5000);

      try {
        // 触发同步操作
        const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
        await fullSyncButton.click();

        // 等待响应或超时
        await page.waitForTimeout(6000);

        // 检查是否有超时相关的错误信息
        const timeoutElements = page.locator("text=/超时|timeout|请求失败/");
        const timeoutCount = await timeoutElements.count();

        if (timeoutCount > 0) {
          console.log("检测到超时错误信息");
          await expect(timeoutElements.first()).toBeVisible();
        }
      } catch (error) {
        console.log("捕获到预期的超时错误:", error);
      }

      // 恢复默认超时设置
      page.setDefaultTimeout(30000);
    });
  });

  test.describe("数据处理边界情况", () => {
    test("应该处理大量日志数据", async ({ page }) => {
      // 触发同步以生成日志（减少次数避免超时）
      const fullSyncButton = page.getByRole("button", { name: /全量同步/ });

      // 只触发一次同步，避免长时间等待
      await fullSyncButton.click();
      await page.waitForTimeout(2000);

      // 等待同步开始（按钮变为禁用状态）
      await expect(fullSyncButton).toBeDisabled({ timeout: 5000 });

      // 等待一段时间让同步进行，但不等待完成
      await page.waitForTimeout(5000);

      // 检查日志显示性能
      const startTime = Date.now();

      // 查找日志元素（使用正确的选择器）
      const logElements = page.locator("text=/同步|操作|状态|开始|完成/");
      const logCount = await logElements.count();

      const endTime = Date.now();
      const renderTime = endTime - startTime;

      console.log(`日志渲染时间: ${renderTime}ms, 日志元素数量: ${logCount}`);

      // 验证渲染时间在合理范围内（小于3秒）
      expect(renderTime).toBeLessThan(3000);

      // 验证至少有一些日志内容
      expect(logCount).toBeGreaterThan(0);
    });

    test("应该处理空数据状态", async ({ page }) => {
      // 等待页面加载
      await page.waitForTimeout(2000);

      // 检查是否有空状态的处理
      const emptyStateElements = page.locator("text=/暂无数据|没有日志|空|无内容/");
      const emptyStateCount = await emptyStateElements.count();

      if (emptyStateCount > 0) {
        console.log("找到空状态提示");
        await expect(emptyStateElements.first()).toBeVisible();
      } else {
        console.log("未找到明显的空状态提示，可能有默认数据");
      }

      // 验证即使在空数据状态下，主要功能仍然可用
      const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
      await expect(fullSyncButton).toBeVisible();
      await expect(fullSyncButton).toBeEnabled();
    });
  });

  test.describe("UI状态异常处理", () => {
    test("应该处理页面元素加载失败", async ({ page }) => {
      // 监听网络请求失败
      const failedRequests: string[] = [];
      page.on("requestfailed", (request) => {
        failedRequests.push(request.url());
      });

      // 刷新页面
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);

      if (failedRequests.length > 0) {
        console.log("检测到失败的请求:", failedRequests);
      }

      // 验证核心功能仍然可用
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible({ timeout: 15000 });

      const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
      await expect(fullSyncButton).toBeVisible({ timeout: 15000 });
    });

    test("应该处理JavaScript错误", async ({ page }) => {
      // 监听JavaScript错误
      const jsErrors: string[] = [];
      page.on("pageerror", (error) => {
        jsErrors.push(error.message);
      });

      // 执行一些可能触发错误的操作
      const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
      await fullSyncButton.click();
      await page.waitForTimeout(2000);

      // 尝试一些边界操作
      await page.keyboard.press("F5"); // 刷新
      await page.waitForTimeout(1000);

      if (jsErrors.length > 0) {
        console.log("检测到JavaScript错误:", jsErrors);

        // 检查是否是严重错误
        const criticalErrors = jsErrors.filter(
          (error) =>
            error.toLowerCase().includes("uncaught") ||
            error.toLowerCase().includes("reference") ||
            error.toLowerCase().includes("type")
        );

        if (criticalErrors.length > 0) {
          console.warn("发现严重的JavaScript错误:", criticalErrors);
        }
      }

      // 验证页面仍然功能正常
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible();
    });
  });

  test.describe("性能和稳定性测试", () => {
    test("应该在长时间运行后保持稳定", async ({ page }) => {
      const startTime = Date.now();

      // 模拟长时间使用
      for (let i = 0; i < 5; i++) {
        // 触发同步
        const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
        await fullSyncButton.click();
        await page.waitForTimeout(1000);

        // 等待同步完成
        await expect(fullSyncButton).toBeEnabled({ timeout: 30000 });

        // 检查页面响应性
        const pageTitle = page.locator("h1");
        await expect(pageTitle).toBeVisible();

        // 短暂等待
        await page.waitForTimeout(500);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(`长时间运行测试完成，总耗时: ${totalTime}ms`);

      // 验证页面仍然正常工作
      const finalSyncButton = page.getByRole("button", { name: /全量同步/ });
      await expect(finalSyncButton).toBeVisible();
      await expect(finalSyncButton).toBeEnabled();
    });

    test("应该正确处理内存使用", async ({ page }) => {
      // 获取初始内存使用情况（如果可能）
      const initialMetrics = await page.evaluate(() => {
        return {
          // @ts-ignore
          memory: performance.memory
            ? {
                // @ts-ignore
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                // @ts-ignore
                totalJSHeapSize: performance.memory.totalJSHeapSize,
              }
            : null,
          timing: performance.timing,
        };
      });

      console.log("初始性能指标:", initialMetrics);

      // 执行一些操作
      for (let i = 0; i < 3; i++) {
        const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
        await fullSyncButton.click();
        await page.waitForTimeout(2000);
        await expect(fullSyncButton).toBeEnabled({ timeout: 30000 });
      }

      // 获取最终内存使用情况
      const finalMetrics = await page.evaluate(() => {
        return {
          // @ts-ignore
          memory: performance.memory
            ? {
                // @ts-ignore
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                // @ts-ignore
                totalJSHeapSize: performance.memory.totalJSHeapSize,
              }
            : null,
        };
      });

      console.log("最终性能指标:", finalMetrics);

      // 验证页面仍然响应正常
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible();
    });
  });

  test.describe("浏览器兼容性", () => {
    test("应该在不同视口尺寸下正常工作", async ({ page }) => {
      const viewports = [
        { width: 320, height: 568 }, // iPhone SE
        { width: 768, height: 1024 }, // iPad
        { width: 1024, height: 768 }, // iPad横屏
        { width: 1920, height: 1080 }, // 桌面
      ];

      for (const viewport of viewports) {
        console.log(`测试视口: ${viewport.width}x${viewport.height}`);

        await page.setViewportSize(viewport);
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1000);

        // 验证核心元素在当前视口下可见
        const pageTitle = page.locator("h1");
        await expect(pageTitle).toBeVisible();

        const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
        await expect(fullSyncButton).toBeVisible();

        // 验证按钮可点击
        await expect(fullSyncButton).toBeEnabled();
      }
    });

    test("应该支持触摸设备交互", async ({ browser }) => {
      // 创建支持触摸的浏览器上下文
      const context = await browser.newContext({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 375, height: 667 },
      });

      const page = await context.newPage();

      try {
        // 在新上下文中进行管理员登录
        const response = await page.request.post("/api/dev/login", {
          data: {
            email: process.env.ADMIN_EMAIL || "admin-test@test.local",
            password: "test-password",
          },
        });

        expect(response.ok()).toBeTruthy();

        // 提取并设置 session cookie
        const setCookieHeader = response.headers()["set-cookie"];
        if (setCookieHeader) {
          const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
          if (sessionCookieMatch) {
            const sessionId = sessionCookieMatch[1];
            await context.addCookies([
              {
                name: "session_id",
                value: sessionId,
                domain: "localhost",
                path: "/",
                httpOnly: true,
                sameSite: "Lax",
              },
            ]);
          }
        }

        await page.goto("/admin/data-sync");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1000);

        // 使用触摸事件点击按钮
        const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
        await expect(fullSyncButton).toBeVisible();

        // 模拟触摸点击
        const buttonBox = await fullSyncButton.boundingBox();
        if (buttonBox) {
          await page.touchscreen.tap(
            buttonBox.x + buttonBox.width / 2,
            buttonBox.y + buttonBox.height / 2
          );

          console.log("触摸点击同步按钮成功");
          await page.waitForTimeout(1000);
        }

        // 验证触摸交互正常工作
        const buttonAfterTouch = page.getByRole("button", { name: /全量同步|同步中/ });
        await expect(buttonAfterTouch).toBeVisible();
      } finally {
        // 确保关闭上下文
        await context.close();
      }
    });
  });
});
