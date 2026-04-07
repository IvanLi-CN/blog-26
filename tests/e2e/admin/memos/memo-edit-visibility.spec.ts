import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { openMemoEditDialog, waitForMemoCardByText, waitForQuickMemoEditor } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Memo 编辑可见性", () => {
  test("编辑后可从公开切换为私有并持久化", async ({ page }) => {
    test.setTimeout(150_000);

    // 使用开发登录接口建立管理员会话（测试环境允许）
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memos-list", { timeout: 30_000 });

    // 1) 先发布一条公开 memo，作为稳定的编辑目标
    const { container: quickEditor, editor } = await waitForQuickMemoEditor(page);
    const TITLE = `可见性测试 ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(`# ${TITLE}`);
    await page.waitForTimeout(100);

    const publish = quickEditor.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();
    await publish.click();

    const successToast = page.locator(".Toastify__toast .nature-alert-success");
    await expect(successToast).toContainText("Memo 已发布", { timeout: 30_000 });

    const createdCard = await waitForMemoCardByText(page, TITLE);

    const targetId = await createdCard.getAttribute("data-id");
    expect(targetId).toBeTruthy();

    await expect(createdCard.locator('[data-testid="public-indicator"]')).toBeVisible();
    await expect(createdCard.locator('[data-testid="private-indicator"]')).toHaveCount(0);

    // 2) 打开编辑对话框，切换为“私有保存”
    const editButton = createdCard.getByRole("button", { name: /^编辑 Memo/ });
    const dialog = await openMemoEditDialog(page, editButton);

    const visibilityToggle = dialog.locator('input[type="checkbox"]').first();
    const save = dialog.getByRole("button", { name: "保存更改" });

    await expect(visibilityToggle).toBeEnabled({ timeout: 30_000 });
    await expect(save).toBeEnabled({ timeout: 30_000 });
    await expect(visibilityToggle).toBeChecked();
    await visibilityToggle.click();
    await expect(visibilityToggle).not.toBeChecked();
    await expect(dialog.getByText("私有保存")).toBeVisible();

    await expect(save).toBeEnabled({ timeout: 30_000 });
    await save.click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });

    // 3) 重新进入列表后验证该 memo 已持久化为私有
    await page.goto("/memos", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector(".memos-list", { timeout: 30_000 });
    const updatedCardAfterReload = page.locator(`[data-testid="memo-card"][data-id="${targetId}"]`);
    await expect(updatedCardAfterReload).toBeVisible({ timeout: 60_000 });
    await expect(updatedCardAfterReload.locator('[data-testid="private-indicator"]')).toBeVisible();
    await expect(updatedCardAfterReload.locator('[data-testid="public-indicator"]')).toHaveCount(0);
  });
});
