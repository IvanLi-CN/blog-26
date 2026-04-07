import { expect, type Page } from "@playwright/test";
import { userTest as test } from "./fixtures";

// user-chromium 项目会通过 sso-header-routing 在 BASE_URL 注入普通用户邮箱（E2E 专用，第三方域名会剥离）

test.describe("Admin access denied (user)", () => {
  async function openPage(page: Page, url: string) {
    const response = await page.goto(url, {
      timeout: 60_000,
      waitUntil: "commit",
    });
    await expect(page.locator("body")).toBeVisible();
    return response;
  }

  test("non-admin user sees 403 page on admin tags", async ({ page }) => {
    const response = await openPage(page, "/admin/tags");
    expect(response?.status()).toBe(403);

    await expect(page.getByText("403 权限不足")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("只有具备管理员权限的账户可以访问此区域。")).toBeVisible({
      timeout: 60_000,
    });
    await page.waitForFunction(() => window.location.pathname === "/admin/tags");
  });

  test("non-admin user sees 404 page on removed admin login route", async ({ page }) => {
    const response = await openPage(page, "/admin/login");
    expect(response?.status()).toBe(404);

    await expect(page.getByText("404 页面未找到")).toBeVisible({ timeout: 60_000 });
    await page.waitForFunction(() => window.location.pathname === "/admin/login");
  });
});
