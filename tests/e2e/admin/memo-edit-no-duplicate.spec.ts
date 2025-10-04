import { expect, test } from "@playwright/test";

/**
 * Memo 编辑不重复测试
 * 验证编辑 memo 后不会在列表中创建重复项
 */

test.describe("Memo 编辑不重复", () => {
  test("编辑 memo 后列表中不应出现重复项", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");

    // 等待 memo 列表加载
    await page.waitForSelector(".memos-list", { timeout: 10000 });
    const memoCards = page.locator('[data-testid="memo-card"]');

    // 记录初始 memo 数量
    const initialCount = await memoCards.count();
    expect(initialCount).toBeGreaterThan(0);
    console.log(`📊 初始 memo 数量: ${initialCount}`);

    // 获取第一个 memo 并点击编辑
    const firstMemo = memoCards.first();
    const editButton = firstMemo.locator("button").filter({ hasText: /编辑|edit/i });
    await editButton.click();

    // 等待编辑对话框出现
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // 修改内容
    const editor = dialog.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press("Control+a");
    const newContent = `测试编辑 - ${Date.now()}`;
    await page.keyboard.type(newContent);

    // 保存编辑
    const saveButton = dialog.locator("button").filter({ hasText: /保存|save/i });
    await saveButton.click();

    // 等待保存完成（对话框关闭）
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // 等待一段时间让同步完成
    await page.waitForTimeout(2000);

    // 验证 memo 数量没有增加
    const finalCount = await memoCards.count();
    console.log(`📊 编辑后 memo 数量: ${finalCount}`);
    expect(finalCount).toBe(initialCount);

    // 刷新页面验证持久性
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".memos-list", { timeout: 10000 });

    const afterReloadCount = await page.locator('[data-testid="memo-card"]').count();
    console.log(`📊 刷新后 memo 数量: ${afterReloadCount}`);
    expect(afterReloadCount).toBe(initialCount);

    // 验证修改的内容存在
    const updatedMemo = page.locator('[data-testid="memo-card"]').filter({ hasText: newContent });
    await expect(updatedMemo).toBeVisible();
  });
});
