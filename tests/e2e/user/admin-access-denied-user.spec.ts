import { expect, test } from "@playwright/test";

// user-chromium 项目会通过 Remote-Email 头注入普通用户邮箱

test.describe("Admin access denied (user)", () => {
  test("non-admin user sees 403 page on admin tags", async ({ page }) => {
    const response = await page.goto("/admin/tags");
    expect(response?.status()).toBe(403);

    await expect(page.getByRole("heading", { name: "403 权限不足" })).toBeVisible();
    await expect(page.getByText("只有具备管理员权限的账户可以访问此区域。")).toBeVisible();
    await page.waitForFunction(() => window.location.pathname === "/admin/tags");
  });

  test("non-admin user sees 404 page on removed admin login route", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response?.status()).toBe(404);

    await expect(page.getByRole("heading", { name: "404 页面未找到" })).toBeVisible();
    await page.waitForFunction(() => window.location.pathname === "/admin/login");
  });
});
