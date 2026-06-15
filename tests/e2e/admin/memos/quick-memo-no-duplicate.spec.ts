import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { waitForAdminLiveMemoCard, waitForQuickMemoEditor } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Quick Memo publish no duplicate (admin)", () => {
  test("publishing a memo should create exactly one card", async ({ page }) => {
    test.setTimeout(150_000);

    // 建立管理员会话（与其他 admin 用例保持一致）
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const { container, editor } = await waitForQuickMemoEditor(page);

    const TITLE = `测试发布去重 ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(TITLE);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();

    await publish.click();

    const cards = page.locator('[data-testid="admin-live-memo-card"]');
    const cardsWithTitle = cards.filter({ hasText: TITLE });
    await expect(cardsWithTitle).toHaveCount(1, { timeout: 30_000 });

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await waitForQuickMemoEditor(page);
    await waitForAdminLiveMemoCard(page, TITLE);
    const cardsAfterReload = page
      .locator('[data-testid="admin-live-memo-card"]')
      .filter({ hasText: TITLE });
    await expect(cardsAfterReload).toHaveCount(1, { timeout: 30_000 });
  });
});
