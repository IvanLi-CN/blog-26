import { expect, test } from "@playwright/test";

test.describe("Admin access denied (guest)", () => {
  test("guest sees 401 page when accessing admin dashboard without SSO header", async ({
    page,
  }) => {
    const response = await page.goto("/admin/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(401);

    await expect(page.locator("html#__next_error__")).toHaveCount(1);

    // URL 应恢复为原始访问地址，刷新时仍然访问 /admin/dashboard
    await page.waitForFunction(() => window.location.pathname === "/admin/dashboard");
  });

  test("guest sees 404 page on removed admin login route", async ({ page }) => {
    const response = await page.goto("/admin/login", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(404);

    await expect(page.getByRole("heading", { name: "404 页面未找到" })).toBeVisible();
    await page.waitForFunction(() => window.location.pathname === "/admin/login");
  });
});
