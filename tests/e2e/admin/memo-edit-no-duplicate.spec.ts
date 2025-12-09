import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

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

    // 记录初始 memo 数量（在 CI 上可能需要等待数据同步完成）
    // 使用 expect.poll 等待到出现至少 1 条记录，避免瞬时为 0 的误判
    await test.expect
      .poll(async () => await memoCards.count(), { timeout: 15000 })
      .toBeGreaterThan(0);
    const initialCount = await memoCards.count();
    console.log(`📊 初始 memo 数量: ${initialCount}`);

    // 使用稳定的 data-id（编辑后 slug 可能会变化）
    const targetId = await memoCards.first().getAttribute("data-id");

    // 获取第一个 memo 并点击编辑
    const firstMemo = memoCards.first();
    // 使用可访问名称定位编辑按钮，确保滚动到视图后再点击
    const editButton = firstMemo.getByRole("button", { name: /^编辑 Memo/ });
    await firstMemo.hover();
    await editButton.waitFor({ state: "visible" });
    await editButton.scrollIntoViewIfNeeded();
    await expect(editButton).toBeEnabled();
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

    // 验证 memo 数量没有增加（核心验证点）
    const finalCount = await memoCards.count();
    console.log(`📊 编辑后 memo 数量: ${finalCount}`);
    expect(finalCount).toBe(initialCount);
    if (targetId) {
      await expect(page.locator(`[data-id="${targetId}"]`)).toHaveCount(1);
    }

    // 刷新页面验证持久性
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".memos-list", { timeout: 10000 });

    // 刷新后等待列表回稳
    await test.expect
      .poll(async () => await page.locator('[data-testid="memo-card"]').count(), {
        timeout: 20000,
      })
      .toBeGreaterThan(0);
    const afterReloadCount = await page.locator('[data-testid="memo-card"]').count();
    console.log(`📊 刷新后 memo 数量: ${afterReloadCount}`);
    // 保守断言：数量不应增加；并校验被编辑的卡片未重复
    expect(afterReloadCount).toBeGreaterThan(0);
    expect(afterReloadCount).toBeLessThanOrEqual(initialCount);
    if (targetId) {
      await expect(page.locator(`[data-id="${targetId}"]`)).toHaveCount(1);
    }
  });
});
