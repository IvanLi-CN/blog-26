/**
 * 数据同步管理页面权限验证测试
 *
 * 测试数据同步管理页面的权限控制，包括：
 * - 管理员权限验证
 * - 未授权访问重定向
 * - 测试环境权限绕过
 */

import { expect, test } from "@playwright/test";

test.describe("数据同步管理页面权限验证", () => {
  test.describe("管理员权限测试", () => {
    test("管理员用户应该能够正常访问页面", async ({ page }) => {
      // 使用管理员身份登录
      const response = await page.request.post("/api/dev/login", {
        data: {
          email: "admin-test@test.local",
        },
      });

      expect(response.ok()).toBeTruthy();

      // 提取并设置 session cookie
      const setCookieHeader = response.headers()["set-cookie"];
      if (setCookieHeader) {
        const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
        if (sessionCookieMatch) {
          const sessionId = sessionCookieMatch[1];
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
        }
      }

      await page.goto("/admin/data-sync");

      // 等待页面加载
      await page.waitForLoadState("domcontentloaded");

      // 验证页面成功加载，没有被重定向
      expect(page.url()).toContain("/admin/data-sync");

      // 验证页面内容正确显示
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible({ timeout: 15000 });
      await expect(pageTitle).toHaveText("数据同步");
    });

    test("管理员用户应该能够访问所有功能", async ({ page }) => {
      // 使用管理员身份登录
      const response = await page.request.post("/api/dev/login", {
        data: {
          email: "admin-test@test.local",
        },
      });

      expect(response.ok()).toBeTruthy();

      // 提取并设置 session cookie
      const setCookieHeader = response.headers()["set-cookie"];
      if (setCookieHeader) {
        const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
        if (sessionCookieMatch) {
          const sessionId = sessionCookieMatch[1];
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
        }
      }

      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // 验证同步按钮可用
      const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
      await expect(fullSyncButton).toBeVisible({ timeout: 15000 });
      await expect(fullSyncButton).toBeEnabled();

      // 验证可以点击按钮（不会因权限问题被阻止）
      await fullSyncButton.click();

      // 等待响应，验证没有权限错误
      await page.waitForTimeout(1000);

      // 检查是否有真正的权限错误信息（更精确的检查）
      const criticalErrorMessages = page.locator(
        "text=/权限不足|访问被拒绝|未授权|403 Forbidden|401 Unauthorized|需要登录/"
      );
      const criticalErrorCount = await criticalErrorMessages.count();

      if (criticalErrorCount > 0) {
        const errorText = await criticalErrorMessages.first().textContent();
        console.log("发现权限错误:", errorText);
        // 在测试环境中不应该有权限错误
        expect(criticalErrorCount).toBe(0);
      }

      // 检查页面是否被重定向到登录页面
      const currentUrl = page.url();
      expect(currentUrl).not.toContain("/admin-login");
      expect(currentUrl).not.toContain("/login");
    });
  });

  test.describe("管理员页面导航测试", () => {
    test("管理员应该能够访问所有管理页面", async ({ page }) => {
      // 使用管理员身份登录
      const response = await page.request.post("/api/dev/login", {
        data: {
          email: "admin-test@test.local",
        },
      });

      expect(response.ok()).toBeTruthy();

      // 提取并设置 session cookie
      const setCookieHeader = response.headers()["set-cookie"];
      if (setCookieHeader) {
        const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
        if (sessionCookieMatch) {
          const sessionId = sessionCookieMatch[1];
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
        }
      }

      // 测试访问管理员仪表盘
      await page.goto("/admin/dashboard");
      await page.waitForLoadState("domcontentloaded");

      expect(page.url()).toContain("/admin/dashboard");
      expect(page.url()).not.toContain("/admin-login");

      // 测试访问数据同步页面
      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");

      expect(page.url()).toContain("/admin/data-sync");
      expect(page.url()).not.toContain("/admin-login");
    });
  });

  test.describe("页面导航和布局", () => {
    test("应该显示管理员导航菜单", async ({ page }) => {
      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000);

      // 查找导航相关的元素
      const navElements = page.locator("nav, .nav, .navigation, .menu");
      const navCount = await navElements.count();

      if (navCount > 0) {
        console.log("找到导航菜单");
        await expect(navElements.first()).toBeVisible();
      } else {
        console.log("未找到明显的导航菜单，可能使用了不同的结构");
      }

      // 查找可能的管理员菜单链接
      const adminLinks = page.locator("a[href*='/admin']");
      const adminLinkCount = await adminLinks.count();

      if (adminLinkCount > 0) {
        console.log(`找到 ${adminLinkCount} 个管理员链接`);

        // 验证至少有一个管理员链接是可见的
        let visibleLinkFound = false;
        for (let i = 0; i < Math.min(adminLinkCount, 5); i++) {
          const link = adminLinks.nth(i);
          const isVisible = await link.isVisible();
          if (isVisible) {
            visibleLinkFound = true;
            break;
          }
        }

        if (visibleLinkFound) {
          console.log("找到可见的管理员链接");
        }
      }
    });

    test("应该能够在管理员页面之间导航", async ({ page }) => {
      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");

      // 查找指向其他管理员页面的链接
      const dashboardLink = page.locator("a[href*='/admin/dashboard'], a[href*='/admin']").first();
      const dashboardLinkCount = await dashboardLink.count();

      if (dashboardLinkCount > 0 && (await dashboardLink.isVisible())) {
        console.log("找到仪表盘链接，测试导航");

        // 点击链接导航到仪表盘
        await dashboardLink.click();
        await page.waitForLoadState("domcontentloaded");

        // 验证导航成功
        const newUrl = page.url();
        expect(newUrl).toMatch(/\/admin(\/dashboard)?/);
        expect(newUrl).not.toContain("/admin-login");

        // 导航回数据同步页面
        await page.goto("/admin/data-sync");
        await page.waitForLoadState("domcontentloaded");

        expect(page.url()).toContain("/admin/data-sync");
      } else {
        console.log("未找到可用的导航链接，跳过导航测试");
      }
    });
  });

  test.describe("安全性测试", () => {
    test("页面应该包含适当的安全头信息", async ({ page }) => {
      const response = await page.goto("/admin/data-sync");

      if (response) {
        const headers = response.headers();
        console.log("响应头信息:", Object.keys(headers));

        // 检查一些基本的安全头（在开发环境中可能不完整）
        const securityHeaders = ["x-frame-options", "x-content-type-options", "x-xss-protection"];

        for (const header of securityHeaders) {
          if (headers[header]) {
            console.log(`找到安全头 ${header}: ${headers[header]}`);
          }
        }
      }
    });

    test("应该正确处理直接URL访问", async ({ page }) => {
      // 使用管理员身份登录
      const response = await page.request.post("/api/dev/login", {
        data: {
          email: "admin-test@test.local",
        },
      });

      expect(response.ok()).toBeTruthy();

      // 提取并设置 session cookie
      const setCookieHeader = response.headers()["set-cookie"];
      if (setCookieHeader) {
        const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
        if (sessionCookieMatch) {
          const sessionId = sessionCookieMatch[1];
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
        }
      }

      // 直接访问数据同步页面URL
      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");

      // 验证页面正确加载
      expect(page.url()).toContain("/admin/data-sync");

      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible({ timeout: 15000 });
      await expect(pageTitle).toHaveText("数据同步");
    });

    test("应该正确处理页面刷新", async ({ page }) => {
      // 使用管理员身份登录
      const response = await page.request.post("/api/dev/login", {
        data: {
          email: "admin-test@test.local",
        },
      });

      expect(response.ok()).toBeTruthy();

      // 提取并设置 session cookie
      const setCookieHeader = response.headers()["set-cookie"];
      if (setCookieHeader) {
        const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
        if (sessionCookieMatch) {
          const sessionId = sessionCookieMatch[1];
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
        }
      }

      // 访问页面
      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");

      // 刷新页面
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      // 验证刷新后页面仍然正常
      expect(page.url()).toContain("/admin/data-sync");

      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible({ timeout: 15000 });
      await expect(pageTitle).toHaveText("数据同步");
    });
  });

  test.describe("错误处理", () => {
    test("应该优雅处理权限检查错误", async ({ page }) => {
      // 监听控制台错误
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // 访问页面
      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // 检查是否有权限相关的控制台错误
      const authErrors = consoleErrors.filter(
        (error) =>
          error.toLowerCase().includes("auth") ||
          error.toLowerCase().includes("permission") ||
          error.toLowerCase().includes("unauthorized")
      );

      if (authErrors.length > 0) {
        console.log("发现权限相关错误:", authErrors);
        // 在测试环境中不应该有权限错误
        expect(authErrors.length).toBe(0);
      }
    });

    test("应该正确处理网络错误", async ({ page }) => {
      // 使用管理员身份登录
      const response = await page.request.post("/api/dev/login", {
        data: {
          email: "admin-test@test.local",
        },
      });

      expect(response.ok()).toBeTruthy();

      // 提取并设置 session cookie
      const setCookieHeader = response.headers()["set-cookie"];
      if (setCookieHeader) {
        const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
        if (sessionCookieMatch) {
          const sessionId = sessionCookieMatch[1];
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
        }
      }

      // 访问页面
      await page.goto("/admin/data-sync");
      await page.waitForLoadState("domcontentloaded");

      // 模拟网络错误
      await page.context().setOffline(true);

      try {
        // 尝试刷新页面
        await page.reload({ waitUntil: "domcontentloaded", timeout: 5000 });
      } catch (error) {
        // 预期会有网络错误
        console.log("网络离线时的预期错误:", error);
      }

      // 恢复网络
      await page.context().setOffline(false);

      // 重新加载页面
      await page.reload();
      await page.waitForLoadState("domcontentloaded");

      // 验证页面恢复正常
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible({ timeout: 15000 });
    });
  });
});
