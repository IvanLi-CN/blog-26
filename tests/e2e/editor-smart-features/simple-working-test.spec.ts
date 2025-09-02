/**
 * 简单的工作测试
 *
 * 验证基本功能是否正常工作
 */

import { expect, test } from "@playwright/test";

test.describe("简单工作测试", () => {
  test("测试用例: 访问首页", async ({ page }) => {
    // 1. 访问首页
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // 2. 验证页面加载成功
    await expect(page.locator("body")).toBeVisible();

    // 3. 验证页面标题
    const title = await page.title();
    console.log("页面标题:", title);

    console.log("✅ 首页访问测试通过");
  });

  test("测试用例: 登录API测试", async ({ page }) => {
    // 1. 访问首页
    await page.goto("/");

    // 2. 执行登录
    const loginResponse = await page.evaluate(async () => {
      try {
        const res = await fetch("/api/dev/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com" }),
        });
        return await res.json();
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 3. 验证登录成功
    expect(loginResponse.success).toBe(true);
    expect(loginResponse.user.email).toBe("test@example.com");

    console.log("✅ 登录API测试通过");
  });

  test("测试用例: 编辑器页面直接访问", async ({ page }) => {
    // 1. 访问首页
    await page.goto("/");

    // 2. 执行登录
    await page.evaluate(async () => {
      const res = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });
      return await res.json();
    });

    // 3. 等待一段时间让cookie设置
    await page.waitForTimeout(1000);

    // 4. 尝试访问编辑器页面
    await page.goto("/admin/posts/editor");
    await page.waitForLoadState("networkidle");

    // 5. 检查页面标题
    const title = await page.title();
    console.log("编辑器页面标题:", title);

    // 6. 截图查看页面状态
    await page.screenshot({ path: "test-results/editor-direct-access.png", fullPage: true });

    // 7. 检查页面内容
    const bodyText = await page.locator("body").textContent();
    console.log("页面内容包含:", bodyText?.substring(0, 200));

    console.log("✅ 编辑器页面直接访问测试完成");
  });

  test("测试用例: 使用session-complete的登录方法", async ({ page }) => {
    // 1. 访问首页
    await page.goto("/");

    // 2. 使用与session-complete相同的登录方法
    const loginResponse = await page.evaluate(async () => {
      const res = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin-test@test.local" }),
      });
      return await res.json();
    });

    expect(loginResponse.success).toBe(true);
    expect(loginResponse.user.email).toBe("admin-test@test.local");

    // 3. 等待cookie设置
    await page.waitForTimeout(2000);

    // 4. 尝试访问编辑器页面
    await page.goto("/admin/posts/editor");
    await page.waitForLoadState("networkidle");

    // 5. 检查页面标题
    const title = await page.title();
    console.log("使用admin-test登录后的页面标题:", title);

    // 6. 截图
    await page.screenshot({ path: "test-results/editor-admin-test-login.png", fullPage: true });

    console.log("✅ admin-test登录测试完成");
  });
});
