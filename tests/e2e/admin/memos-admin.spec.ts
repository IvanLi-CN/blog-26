import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

/**
 * Memos - 管理员权限测试（通过 dev 登录会话建立管理员身份）
 */

test.describe("Memos 管理员权限", () => {
  test.beforeEach(async ({ page }) => {
    // 使用开发登录接口建立管理员会话（测试环境允许）
    await page.request.post("/api/dev/login", {
      data: { email: process.env.ADMIN_EMAIL || "admin@example.com" },
    });
  });
  test("管理员应该看到完整的管理功能", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");

    const quickEditor = page.getByRole("region", { name: "快速发布区域" });
    await expect(quickEditor).toBeVisible();
    await expect(page.getByText("快速发布 Memo")).toBeVisible();

    await page.waitForSelector(".memos-list", { timeout: 10000 });
    const memoCards = page.locator(".memo-card");
    const cardCount = await memoCards.count();
    if (cardCount > 0) {
      const firstCard = memoCards.first();
      const editButton = firstCard
        .locator("button")
        .filter({ hasText: /编辑|edit/i })
        .or(firstCard.locator('button[title*="编辑"]'))
        .or(
          firstCard
            .locator("button")
            .filter({ has: page.locator("svg") })
            .first()
        );
      const deleteButton = firstCard
        .locator("button")
        .filter({ hasText: /删除|delete/i })
        .or(firstCard.locator('button[title*="删除"]'))
        .or(
          firstCard
            .locator("button")
            .filter({ has: page.locator("svg") })
            .last()
        );
      const hasManageButtons = (await editButton.count()) > 0 || (await deleteButton.count()) > 0;
      expect(hasManageButtons).toBeTruthy();
    }
  });

  test("管理员应该能够使用 memo 编辑器", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");

    const quickEditor = page.getByRole("region", { name: "快速发布区域" });
    await expect(quickEditor).toBeVisible();

    const testContent = `测试 memo - ${Date.now()}`;
    await page.waitForTimeout(1000);

    // 使用无歧义的区域角色定位编辑器容器，避免 data-testid 严格模式冲突
    const editorContainer = quickEditor;
    await expect(editorContainer).toBeVisible();

    let editableArea = editorContainer.locator('[contenteditable="true"]').first();
    if ((await editableArea.count()) === 0) {
      editableArea = editorContainer
        .locator(".milkdown-editor, .crepe-editor, .ProseMirror")
        .first();
    }
    if ((await editableArea.count()) === 0) {
      editableArea = editorContainer;
    }
    await editableArea.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(testContent);

    await page.waitForTimeout(500);
    const publishButton = quickEditor.getByRole("button", { name: /发布.*Memo/i });
    await expect(publishButton).toBeVisible();

    const publicToggle = quickEditor.locator('input[type="checkbox"]');
    await expect(publicToggle).toBeVisible();
    await expect(publicToggle).toBeChecked();
    await expect(quickEditor.getByText("公开发布")).toBeVisible();
    await publicToggle.click();
    await expect(publicToggle).not.toBeChecked();
    await expect(quickEditor.getByText("私有保存")).toBeVisible();
  });

  test("管理员界面截图", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: "test-results/admin-memos-view.png", fullPage: true });
  });
});
