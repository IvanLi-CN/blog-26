import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import {
  openAdminMemoDetail,
  waitForAdminLiveMemoCard,
  waitForAdminPreviewMemoBody,
  waitForQuickMemoEditor,
} from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Memo 预览详情壳", () => {
  test("详情预览保持单标题、无 hero、无 excerpt、无作者操作条", async ({ page }) => {
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

    await expect(page.getByText("Memo 已创建：")).toBeVisible({ timeout: 30_000 });

    const createdCard = await waitForAdminLiveMemoCard(page, TITLE);

    const targetId = await createdCard.getAttribute("data-id");
    const targetSlug = await createdCard.getAttribute("data-slug");
    expect(targetId).toBeTruthy();
    expect(targetSlug).toBeTruthy();

    await expect(createdCard.locator('[data-testid="public-indicator"]')).toBeVisible();
    await expect(createdCard.locator('[data-testid="private-indicator"]')).toHaveCount(0);

    // 2) 打开详情预览页，验证当前 memo 详情壳不再注入作者操作条
    if (!targetSlug) {
      throw new Error("Expected created memo to expose a slug");
    }
    await openAdminMemoDetail(page, targetSlug);
    const article = await waitForAdminPreviewMemoBody(page);
    await expect(page.getByRole("heading", { name: TITLE, exact: true })).toHaveCount(1);
    await expect(article).not.toContainText(TITLE, { timeout: 60_000 });
    await expect(page.getByTestId("admin-preview-hero")).toHaveCount(0);
    await expect(page.getByTestId("admin-preview-description")).toHaveCount(0);
    await expect(page.getByTestId("public-memo-detail-controls")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "编辑 Memo" })).toHaveCount(0);
    await expect(page.getByTestId("admin-live-memo-delete")).toHaveCount(0);
  });
});
