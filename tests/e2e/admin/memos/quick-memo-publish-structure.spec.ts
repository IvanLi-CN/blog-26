import { expect, test } from "@playwright/test";

test.describe("Quick publish renders heading + list and persists multiline body", () => {
  test("publish with H1 and list, verify top-of-list and detail structure persists across refresh", async ({
    page,
  }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");

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
    const [createResp] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.status() === 200,
        { timeout: 30000 }
      ),
      publish.click(),
    ]);

    // 等待发布状态变化（最佳努力，不强依赖）
    await expect(publish)
      .toBeDisabled({ timeout: 5000 })
      .catch(() => {});
    await expect(publish)
      .toBeEnabled({ timeout: 30000 })
      .catch(() => {});

    // 解析 slug 用于后续详情页校验；但首先在列表断言置顶
    const createJson = await createResp.json();
    const findSlug = (obj: any): string | null => {
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.slug === "string") return obj.slug;
      for (const val of Object.values(obj)) {
        const found = findSlug(val as any);
        if (found) return found;
      }
      return null;
    };
    const slug = findSlug(createJson);
    if (!slug) throw new Error("memos.create 响应未返回 slug");

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
    await page.goto(`/memos/${slug}`);
    const article = page.locator(".memo-detail-page .prose").first();
    await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible({
      timeout: 30000,
    });
    await expect(article.locator("ul li").first()).toBeVisible({ timeout: 30000 });
    // 列表应包含两条独立的 <li>（我们输入了两项）
    await expect(article.locator("ul li")).toHaveCount(2, { timeout: 30000 });
    // 进一步校验每一项的文本内容
    await expect(article.getByText("项目一")).toBeVisible();
    await expect(article.getByText("项目二")).toBeVisible();

    // WebDAV 文件校验在部分测试环境可能不可用，
    // 此用例以 UI 渲染为准（文件写入由内容同步相关用例覆盖）。
  });
});
