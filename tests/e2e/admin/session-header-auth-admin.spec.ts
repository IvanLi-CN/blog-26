import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

// admin 项目通过 sso-header-routing 在 BASE_URL 上注入 Remote-Email（E2E 模拟，仅测试环境使用）

test.describe("Session & Header Auth (admin)", () => {
  test("header-only admin should be recognized as admin without dev login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const data = await page.evaluate(async () => {
      const response = await fetch("/api/test/auth", {
        headers: {
          accept: "application/json",
        },
      });
      return {
        ok: response.ok,
        status: response.status,
        payload: await response.json(),
      };
    });

    expect(data.ok).toBe(true);
    const email = data.payload.user?.email as string;
    expect(typeof email).toBe("string");
    expect(data.payload.isAdmin).toBe(true);
  });

  test("header-only admin can access admin dashboard without 401/403 page", async ({ page }) => {
    await page.context().clearCookies();

    const response = await page.goto("/admin/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.status()).toBe(200);

    // 应显示正常的管理后台导航
    await expect(page.getByRole("link", { name: "管理后台" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "管理员仪表盘" })).toBeVisible();

    // 不应出现 401/403 提示
    await expect(page.getByText("Authentication required")).toHaveCount(0);
    await expect(page.getByText("Admin access denied")).toHaveCount(0);
  });
});
