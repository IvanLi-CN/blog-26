import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";
import {
  openAdminMemoDetail,
  waitForAdminLiveMemoCard,
  waitForAdminPreviewMemoBody,
  waitForQuickMemoEditor,
} from "./memos/helpers";

/**
 * Memo 详情不重复标题测试
 * 验证详情壳只保留外层标题，不重复渲染正文首个同名 H1。
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Memo 详情不重复标题", () => {
  test("详情壳不应重复渲染正文中的同名标题", async ({ page }) => {
    test.setTimeout(150_000);

    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    await page.goto("/memos", { timeout: 60_000, waitUntil: "domcontentloaded" });
    await waitForQuickMemoEditor(page);

    const memoCards = page.locator('[data-testid="admin-live-memo-card"]');

    await test.expect
      .poll(async () => await memoCards.count(), { timeout: 30_000 })
      .toBeGreaterThan(0);
    const initialCount = await memoCards.count();
    console.log(`📊 初始 memo 数量: ${initialCount}`);

    const { container: quickEditor, editor: quickEditorInput } = await waitForQuickMemoEditor(page);
    const title = `编辑去重测试 ${Date.now()}`;
    const initialContent = `初始内容 ${Date.now()}`;
    await quickEditorInput.click();
    await page.keyboard.insertText(`# ${title}`);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText(initialContent);
    await page.waitForTimeout(150);

    const publish = quickEditor.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();
    await publish.click();

    const createdCard = await waitForAdminLiveMemoCard(page, title);
    const targetId = await createdCard.getAttribute("data-id");
    const targetSlug = await createdCard.getAttribute("data-slug");
    expect(targetId).toBeTruthy();
    expect(targetSlug).toBeTruthy();

    const countAfterCreate = await memoCards.count();
    console.log(`📊 创建后 memo 数量: ${countAfterCreate}`);
    if (!targetSlug) {
      throw new Error("Expected created memo to expose a slug");
    }

    await openAdminMemoDetail(page, targetSlug);
    const article = await waitForAdminPreviewMemoBody(page);
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
    await expect(article).not.toContainText(title, { timeout: 60_000 });
    await page.goto("/memos", { timeout: 60_000, waitUntil: "domcontentloaded" });
    await waitForQuickMemoEditor(page);

    const finalCount = await memoCards.count();
    console.log(`📊 返回列表后 memo 数量: ${finalCount}`);
    expect(finalCount).toBe(countAfterCreate);
    if (targetId) {
      const updatedCard = page.locator(
        `[data-testid="admin-live-memo-card"][data-id="${targetId}"]`
      );
      await expect(updatedCard).toHaveCount(1);
    }

    await page.reload({ timeout: 60_000, waitUntil: "domcontentloaded" });
    await waitForQuickMemoEditor(page);

    const memoCardsAfterReload = page.locator('[data-testid="admin-live-memo-card"]');
    await test.expect
      .poll(async () => await memoCardsAfterReload.count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    const afterReloadCount = await memoCardsAfterReload.count();
    console.log(`📊 刷新后 memo 数量: ${afterReloadCount}`);
    expect(afterReloadCount).toBe(countAfterCreate);
    if (targetId) {
      const reloadedCard = page.locator(
        `[data-testid="admin-live-memo-card"][data-id="${targetId}"]`
      );
      await expect(reloadedCard).toHaveCount(1);
    }
  });
});
