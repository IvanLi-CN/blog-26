import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";
import { waitForMemoCardByText, waitForQuickMemoEditor } from "./memos/helpers";

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

    await page.goto("/memos", { timeout: 60_000, waitUntil: "commit" });
    await expect(page.locator("body")).toBeVisible();

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
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.status() === 200,
        { timeout: 30_000 }
      ),
      publish.click(),
    ]);

    const createdCard = await waitForMemoCardByText(page, title);
    const targetId = await createdCard.getAttribute("data-id");
    expect(targetId).toBeTruthy();

    const countAfterCreate = await memoCards.count();
    console.log(`📊 创建后 memo 数量: ${countAfterCreate}`);

    const editButton = createdCard.getByRole("button", { name: /^编辑 Memo/ });
    await createdCard.hover();
    await editButton.waitFor({ state: "visible" });
    await editButton.scrollIntoViewIfNeeded();
    await expect(editButton).toBeEnabled();
    await editButton.click();

    const modalHeader = page.getByTestId("quick-memo-edit-header");
    await expect(modalHeader).toBeVisible({ timeout: 60_000 });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 60_000 });

    const editor = dialog.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.press("Control+a");
    const newContent = `# 测试编辑 - ${Date.now()}`;
    await page.keyboard.type(newContent);

    const saveButton = dialog.getByRole("button", { name: /保存更改|保存|save/i });
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.update") && res.status() === 200,
        { timeout: 30_000 }
      ),
      saveButton.click(),
    ]);

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(2000);

    const finalCount = await memoCards.count();
    console.log(`📊 编辑后 memo 数量: ${finalCount}`);
    expect(finalCount).toBe(countAfterCreate);
    if (targetId) {
      const updatedCard = page.locator(`[data-testid="memo-card"][data-id="${targetId}"]`);
      await expect(updatedCard).toHaveCount(1);
    }

    await page.reload({ timeout: 60_000, waitUntil: "commit" });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForSelector(".memos-list", { timeout: 10_000 });

    const memoCardsAfterReload = page.locator('[data-testid="memo-card"][data-id]');
    await test.expect
      .poll(async () => await memoCardsAfterReload.count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
    const afterReloadCount = await memoCardsAfterReload.count();
    console.log(`📊 刷新后 memo 数量: ${afterReloadCount}`);
    expect(afterReloadCount).toBe(countAfterCreate);
    if (targetId) {
      const reloadedCard = page.locator(`[data-testid="memo-card"][data-id="${targetId}"]`);
      await expect(reloadedCard).toHaveCount(1);
    }
  });
});
