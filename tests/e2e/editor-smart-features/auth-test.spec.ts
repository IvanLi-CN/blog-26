/**
 * 认证测试
 *
 * 验证登录功能是否正常工作
 */

import { expect, test } from "@playwright/test";
import { EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("认证测试", () => {
  test("测试用例: 开发环境登录", async ({ page }) => {
    // 1. 先进行开发环境登录
    const response = await page.request.post("/api/dev/login", {
      data: { email: "test@example.com" },
    });

    console.log("登录响应状态:", response.status());
    const responseData = await response.json();
    console.log("登录响应数据:", responseData);

    // 2. 验证登录成功
    expect(response.status()).toBe(200);
    expect(responseData.success).toBe(true);

    // 3. 访问编辑器页面
    await page.goto("/admin/posts/editor");
    await page.waitForLoadState("networkidle");

    // 4. 检查页面标题
    const title = await page.title();
    console.log("页面标题:", title);

    // 5. 截图查看页面状态
    await page.screenshot({ path: "test-results/auth-test.png", fullPage: true });

    console.log("✅ 认证测试完成");
  });

  test("测试用例: 使用辅助函数登录", async ({ page }) => {
    // 1. 使用辅助函数登录
    await EditorTestHelpers.devLogin(page);

    // 2. 访问编辑器页面
    await page.goto("/admin/posts/editor");
    await page.waitForLoadState("networkidle");

    // 3. 检查页面标题
    const title = await page.title();
    console.log("页面标题:", title);

    // 4. 检查是否有登录相关的cookie
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((cookie) => cookie.name === "session_id");
    console.log("Session Cookie:", sessionCookie ? "存在" : "不存在");

    // 5. 截图查看页面状态
    await page.screenshot({ path: "test-results/auth-helper-test.png", fullPage: true });

    console.log("✅ 辅助函数认证测试完成");
  });
});
