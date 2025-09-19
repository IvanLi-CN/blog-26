import { expect, test } from "@playwright/test";

/**
 * Memos - 普通用户权限测试（通过 Remote-Email 头注入普通用户邮箱）
 */

test.describe("Memos 普通用户权限", () => {
  test("普通用户不应该看到管理功能", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");

    // 验证用户不是管理员
    const authResponse = await page.request.get("/api/trpc/auth.me");
    const authData = await authResponse.json();
    expect(authData.result?.data?.isAdmin).toBe(false);

    await page.waitForTimeout(500);

    // 验证管理区域不可见
    const quickEditor = page.getByRole("region", { name: "快速发布区域" });
    await expect(quickEditor).not.toBeVisible();
    await expect(page.getByText("快速发布 Memo")).not.toBeVisible();

    // 验证公开内容可见
    const memosList = page.locator(".memos-list");
    await expect(memosList).toBeVisible();

    // 没有管理相关按钮
    await expect(page.getByRole("button", { name: /编辑|删除|管理/ })).not.toBeVisible();
  });

  test("普通用户界面截图", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "test-results/user-memos-view.png", fullPage: true });
  });
});
