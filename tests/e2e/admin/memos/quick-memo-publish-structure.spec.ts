import { expect, test } from "@playwright/test";

test.describe("Quick publish renders heading + list and persists multiline body", () => {
  test("publish with H1 and list, verify top-of-list and detail structure persists across refresh", async ({
    page,
  }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    // Scope to quick editor region for stable queries
    const container = page.getByRole("region", { name: "快速发布区域" });
    await container.waitFor({ state: "visible" });
    const TITLE = `测试标题 ${Date.now()}`;
    const editor = container.locator(".ProseMirror");
    await editor.click();
    // Use insertText to avoid IME/formatting quirks and ensure exact markdown
    // 按行输入以确保换行由编辑器正确处理
    await page.keyboard.insertText(`# ${TITLE}`);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("* 项目一");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("* 项目二");
    await page.waitForTimeout(200);

    // Publish
    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();
    // 发布并等待 tRPC create 响应（用于获取 slug）
    const [_createResp] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.status() === 200,
        { timeout: 30000 }
      ),
      publish.click(),
    ]);

    // 不再等待按钮禁用/启用，直接以服务端响应与列表文本驱动，减少无效等待

    // 等待 UI 列表实际呈现新发布（更稳健：直接以第一张卡片文本作为锚点）

    // 1) 列表页：新发布必须置顶
    const firstCard = page.locator('[data-testid="memo-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 30000 });
    await expect(firstCard).toContainText(TITLE, { timeout: 30000 });

    // 2) 刷新后仍应置顶
    await page.reload();
    await page.waitForLoadState("networkidle");
    const firstCardAfterReload = page.locator('[data-testid="memo-card"]').first();
    await expect(firstCardAfterReload).toBeVisible({ timeout: 30000 });
    await expect(firstCardAfterReload).toContainText(TITLE, { timeout: 30000 });

    // 3) 进入详情页验证结构
    // 进入详情页：直接点击新卡片的详情链接，避免因 slug 结构变化引起的导航失配
    const detailLink = firstCard.locator('a[href^="/memos/"]').first();
    await expect(detailLink).toBeVisible();
    await detailLink.click();
    const article = page.locator(".memo-detail-page .prose").first();
    // 快速判定一次，避免长时间等待
    if (await article.count()) {
      await expect(article).toContainText(TITLE, { timeout: 8000 });
    } else {
      await page.waitForLoadState("networkidle");
      await expect(article).toBeVisible({ timeout: 8000 });
      await expect(article).toContainText(TITLE, { timeout: 8000 });
    }
    // 使用轮询确保结构渲染完成，但将总等待限制在 8s 内，避免浪费时间
    await expect
      .poll(async () => await article.locator("ul li").count(), {
        timeout: 8000,
        message: "等待列表条目渲染为 2",
      })
      .toBe(2);
    // 进一步校验每一项的文本内容
    await expect(article.getByText("项目一")).toBeVisible();
    await expect(article.getByText("项目二")).toBeVisible();

    // WebDAV 文件校验在部分测试环境可能不可用，
    // 此用例以 UI 渲染为准（文件写入由内容同步相关用例覆盖）。
  });
});
