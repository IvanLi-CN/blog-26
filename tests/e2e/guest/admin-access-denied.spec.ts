import { expect, test } from "@playwright/test";

test.describe("Admin access denied (guest)", () => {
  test("guest sees 401 page when accessing admin dashboard without SSO header", async ({
    page,
  }) => {
    const response = await page.goto("/admin/dashboard");
    expect(response?.status()).toBe(401);

    await expect(page.getByRole("heading", { name: "401 未登录" })).toBeVisible();
    await expect(page.getByText("邮箱请求头来识别管理员身份")).toBeVisible();

    // URL 应恢复为原始访问地址，刷新时仍然访问 /admin/dashboard
    await page.waitForFunction(() => window.location.pathname === "/admin/dashboard");
  });

  test("guest sees 401 page on admin login route (no email login UI)", async ({ page }) => {
    const response = await page.goto("/admin/login");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { name: "401 未登录" })).toBeVisible();
    // 邮箱登录表单不再存在
    await expect(page.getByText("管理员登录")).toHaveCount(0);

    await page.waitForFunction(() => window.location.pathname === "/admin/login");
  });
});
