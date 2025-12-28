import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Memo 编辑可见性", () => {
  test("编辑后可从公开切换为私有并持久化", async ({ page }) => {
    // 使用开发登录接口建立管理员会话（测试环境允许）
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".memos-list", { timeout: 10000 });

    // 1) 先发布一条公开 memo，作为稳定的编辑目标
    const quickEditor = page.getByRole("region", { name: "快速发布区域" });
    await quickEditor.waitFor({ state: "visible" });
    const TITLE = `可见性测试 ${Date.now()}`;
    const editor = quickEditor.locator(".ProseMirror");
    await editor.click();
    await page.keyboard.insertText(`# ${TITLE}`);
    await page.waitForTimeout(100);

    const publish = quickEditor.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.status() === 200,
        { timeout: 30000 }
      ),
      publish.click(),
    ]);

    const memoCards = page.locator('[data-testid="memo-card"][data-id]');
    const createdCard = memoCards.filter({ hasText: TITLE }).first();
    await expect(createdCard).toBeVisible({ timeout: 30000 });

    const targetId = await createdCard.getAttribute("data-id");
    expect(targetId).toBeTruthy();

    await expect(createdCard.locator('[data-testid="public-indicator"]')).toBeVisible();
    await expect(createdCard.locator('[data-testid="private-indicator"]')).toHaveCount(0);

    // 2) 打开编辑对话框，切换为“私有保存”
    const editButton = createdCard.getByRole("button", { name: /^编辑 Memo/ });
    await editButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const visibilityToggle = dialog.locator('input[type="checkbox"]').first();
    await expect(visibilityToggle).toBeChecked();
    await visibilityToggle.click();
    await expect(visibilityToggle).not.toBeChecked();
    await expect(dialog.getByText("私有保存")).toBeVisible();

    const save = dialog.getByRole("button", { name: "保存更改" });
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.update") && res.status() === 200,
        { timeout: 30000 }
      ),
      save.click(),
    ]);
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // 3) 验证列表中该 memo 已变为私有
    const updatedCard = page.locator(`[data-testid="memo-card"][data-id="${targetId}"]`);
    await expect(updatedCard).toBeVisible({ timeout: 30000 });
    await expect(updatedCard.locator('[data-testid="private-indicator"]')).toBeVisible();
    await expect(updatedCard.locator('[data-testid="public-indicator"]')).toHaveCount(0);

    // 4) 刷新后仍应保持私有
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".memos-list", { timeout: 10000 });
    const updatedCardAfterReload = page.locator(`[data-testid="memo-card"][data-id="${targetId}"]`);
    await expect(updatedCardAfterReload).toBeVisible({ timeout: 30000 });
    await expect(updatedCardAfterReload.locator('[data-testid="private-indicator"]')).toBeVisible();
    await expect(updatedCardAfterReload.locator('[data-testid="public-indicator"]')).toHaveCount(0);
  });
});
