import { expect } from "@playwright/test";
import { userTest as test } from "./fixtures";

/**
 * Memos - 普通用户权限测试（通过 sso-header-routing 在 BASE_URL 注入 Remote-Email 普通用户邮箱，E2E 专用）
 */

const EMAIL_HEADER_NAME = process.env.SSO_EMAIL_HEADER_NAME ?? "Remote-Email";
const USER_EMAIL = process.env.USER_EMAIL ?? "user@test.local";

test.describe("Memos 普通用户权限", () => {
  test("普通用户不应该看到管理功能", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");

    // 验证用户不是管理员
    const authResponse = await page.request.get("/api/trpc/auth.me", {
      headers: {
        [EMAIL_HEADER_NAME]: USER_EMAIL,
      },
    });
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

  test("memos 引用块的上下间距应大致对称", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const blockquotes = page.locator(".memos-list .prose blockquote");

    // Seed data may not put a blockquote memo on the first page; load more to find one.
    const loadMore = page.getByRole("button", { name: "加载更多 Memo" }).first();
    for (let i = 0; i < 6; i++) {
      const count = await blockquotes.count();
      if (count > 0) break;

      const hasLoadMore = (await loadMore.count().catch(() => 0)) > 0;
      if (!hasLoadMore) break;
      const visible = await loadMore.isVisible({ timeout: 1000 }).catch(() => false);
      if (!visible) break;
      const disabled = await loadMore.isDisabled().catch(() => true);
      if (disabled) break;

      // CI occasionally has overlays that intercept pointer events.
      await loadMore.click({ force: true, timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(200);
    }

    const count = await blockquotes.count();
    test.skip(count === 0, "No blockquote memo found in the current dataset.");

    const blockquote = blockquotes.first();
    await expect(blockquote).toBeVisible();

    const spacing = await blockquote.evaluate((el) => {
      const block = el as HTMLElement;
      const cs = getComputedStyle(block);
      const rect = block.getBoundingClientRect();

      const first = block.firstElementChild as HTMLElement | null;
      const last = block.lastElementChild as HTMLElement | null;

      const firstRect = first?.getBoundingClientRect();
      const lastRect = last?.getBoundingClientRect();
      const lastStyles = last ? getComputedStyle(last) : null;

      return {
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        lastChildMarginBottom: lastStyles?.marginBottom ?? null,
        topGap: firstRect ? firstRect.top - rect.top : null,
        bottomGap: lastRect ? rect.bottom - lastRect.bottom : null,
      };
    });

    expect(spacing.paddingTop).toBe(spacing.paddingBottom);
    expect(spacing.lastChildMarginBottom).toBe("0px");

    const diff =
      spacing.topGap !== null && spacing.bottomGap !== null
        ? Math.abs(spacing.topGap - spacing.bottomGap)
        : null;

    expect(diff).not.toBeNull();
    expect(diff).toBeLessThanOrEqual(4);
  });
});
