import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { openMemoDetailFromCard, waitForMemoCardByText, waitForQuickMemoEditor } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Quick publish renders heading + list and persists multiline body", () => {
  test("publish with H1 and list, verify top-of-list and detail structure persists across refresh", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memos-list", { timeout: 15000 });
    await page.waitForTimeout(300);

    // Scope to quick editor region for stable queries
    const { container, editor } = await waitForQuickMemoEditor(page);
    const TITLE = `测试标题 ${Date.now()}`;
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
    await waitForMemoCardByText(page, TITLE);

    // 2) 刷新后仍应置顶
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".memos-list", { timeout: 15000 });
    const memoCardAfterReload = await waitForMemoCardByText(page, TITLE);

    // 3) 进入详情页验证结构
    await openMemoDetailFromCard(page, memoCardAfterReload);
    const article = page.locator(".memo-detail-page .nature-prose").first();
    await expect(article).toBeVisible({ timeout: 60_000 });
    await expect(article).toContainText(TITLE, { timeout: 60_000 });
    // 使用更长的轮询等待列表渲染为 2 项，适配 CI 慢环境
    await expect
      .poll(async () => await article.locator("ul li").count(), {
        timeout: 60_000,
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
