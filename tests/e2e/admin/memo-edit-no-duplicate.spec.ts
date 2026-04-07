import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";
import { openMemoEditDialog, waitForMemoCardByText, waitForQuickMemoEditor } from "./memos/helpers";

/**
 * Memo 编辑不重复测试
 * 验证编辑 memo 后不会在列表中创建重复项
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Memo 编辑不重复", () => {
  test("编辑 memo 后列表中不应出现重复项", async ({ page }) => {
    test.setTimeout(150_000);

    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded" });

    // 等待 memo 列表加载
    await page.waitForSelector(".memos-list", { timeout: 30_000 });
    const memoCards = page.locator('[data-testid="memo-card"][data-id]');

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

    const successToast = page.locator(".Toastify__toast .nature-alert-success");
    await expect(successToast).toContainText("Memo 已发布", { timeout: 30_000 });

    const createdCard = await waitForMemoCardByText(page, title);
    const targetId = await createdCard.getAttribute("data-id");
    expect(targetId).toBeTruthy();

    const editButton = createdCard.getByRole("button", { name: /^编辑 Memo/ });
    const dialog = await openMemoEditDialog(page, editButton);

    // 修改内容
    const editor = dialog.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press("Control+a");
    const newContent = `更新内容 ${Date.now()}`;
    await page.keyboard.insertText(newContent);

    // 保存编辑
    const saveButton = dialog.getByRole("button", { name: "保存更改" });
    await expect(saveButton).toBeEnabled({ timeout: 30_000 });
    await saveButton.click();

    // 等待保存完成（对话框关闭）
    await expect(dialog).not.toBeVisible({ timeout: 60_000 });

    // 验证编辑后列表中不存在重复的目标 memo
    const finalCount = await memoCards.count();
    console.log(`📊 编辑后 memo 数量: ${finalCount}`);
    if (targetId) {
      const updatedCard = page.locator(`[data-testid="memo-card"][data-id="${targetId}"]`);
      await expect(updatedCard).toHaveCount(1);
    }

    // 刷新页面验证持久性
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memos-list", { timeout: 30_000 });

    // 刷新后等待列表回稳
    const memoCardsAfterReload = page.locator('[data-testid="memo-card"][data-id]');
    await test.expect
      .poll(async () => await memoCardsAfterReload.count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    const afterReloadCount = await memoCardsAfterReload.count();
    console.log(`📊 刷新后 memo 数量: ${afterReloadCount}`);
    // 校验被编辑的卡片未重复
    expect(afterReloadCount).toBeGreaterThan(0);
    if (targetId) {
      const reloadedCard = page.locator(`[data-testid="memo-card"][data-id="${targetId}"]`);
      await expect(reloadedCard).toHaveCount(1);
    }
  });
});
