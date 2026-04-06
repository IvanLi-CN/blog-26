import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

// admin-chromium 项目通过 sso-header-routing 在 BASE_URL 上注入 Remote-Email（E2E 模拟，仅测试环境使用）

const EMAIL_HEADER_NAME = process.env.SSO_EMAIL_HEADER_NAME ?? "Remote-Email";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";

test.describe("Session & Header Auth (admin)", () => {
  test("header-only admin should be recognized as admin without dev login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const authRes = await page.request.get("/api/trpc/auth.me", {
      headers: {
        [EMAIL_HEADER_NAME]: ADMIN_EMAIL,
      },
    });
    expect(authRes.ok()).toBeTruthy();

    const data = await authRes.json();
    const email = data.result?.data?.email as string;
    expect(typeof email).toBe("string");
    expect(data.result?.data?.isAdmin).toBe(true);
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

    // 不应出现 401/403 提示
    await expect(page.getByText("401 未登录")).toHaveCount(0);
    await expect(page.getByText("403 权限不足")).toHaveCount(0);
  });
});
