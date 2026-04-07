import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { waitForQuickMemoEditor } from "./helpers";

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

    // 等待 create 接口成功返回，确保后端写入完成
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.status() === 200,
        { timeout: 30000 }
      ),
      publish.click(),
    ]);

    // 等待列表刷新并实际渲染新 Memo
    // 仅统计最外层 memo 卡片容器，避免内部嵌套的 data-testid 重复计数
    const cards = page.locator('[data-testid="memo-card"][data-id]');
    const cardsWithTitle = cards.filter({ hasText: TITLE });
    await expect(cardsWithTitle).toHaveCount(1, { timeout: 30000 });

    // 刷新页面后再次验证，防止同步过程产生重复记录
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    const cardsAfterReload = page
      .locator('[data-testid="memo-card"][data-id]')
      .filter({ hasText: TITLE });
    await expect(cardsAfterReload).toHaveCount(1, { timeout: 30000 });
  });
});
