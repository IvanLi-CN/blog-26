import { expect, test } from "@playwright/test";

/**
 * Memos - 游客访问测试（无 Remote-Email 头）
 */

test.describe("Memos 游客访问", () => {
  test("未登录用户访问应仅看到公开内容", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Memos" })).toBeVisible();
    await expect(page.getByRole("region", { name: "快速发布区域" })).not.toBeVisible();
  });

  test("权限检查加载状态", async ({ page }) => {
    await page.route("/api/trpc/auth.me*", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await page.goto("/memos");
    const loading = page.locator(".animate-pulse");
    await expect(loading.first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Memos" })).toBeVisible();
  });
});
