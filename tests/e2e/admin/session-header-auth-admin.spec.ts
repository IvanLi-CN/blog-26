import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

// admin-chromium 项目通过 Remote-Email 头注入管理员邮箱（project extraHTTPHeaders + sso-header-routing，仅对
// BASE_URL 生效的 E2E 模拟，非手工登录方式）

test.describe("Session & Header Auth (admin)", () => {
  test("header-only admin should be recognized as admin without dev login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");

    const authRes = await page.request.get("/api/trpc/auth.me");
    expect(authRes.ok()).toBeTruthy();

    const data = await authRes.json();
    const email = data.result?.data?.email as string;
    expect(typeof email).toBe("string");
    expect(data.result?.data?.isAdmin).toBe(true);
  });

  test("header-only admin can access admin dashboard without 401/403 page", async ({ page }) => {
    await page.context().clearCookies();

    const response = await page.goto("/admin/dashboard");
    expect(response?.status()).toBe(200);

    // 应显示正常的管理后台导航
    await expect(page.getByRole("link", { name: "管理后台" })).toBeVisible();

    // 不应出现 401/403 提示
    await expect(page.getByText("401 未登录")).toHaveCount(0);
    await expect(page.getByText("403 权限不足")).toHaveCount(0);
  });
});
