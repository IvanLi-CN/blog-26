import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { waitForMemoCardByText, waitForQuickMemoEditor } from "./helpers";

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
    await expect(page.locator("body")).toBeVisible();
    await page.waitForSelector(".memos-list", { timeout: 15_000 });
    await page.waitForTimeout(300);

    const { container, editor } = await waitForQuickMemoEditor(page);
    const TITLE = `测试标题 ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(`# ${TITLE}`);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("* 项目一");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("* 项目二");
    await page.waitForTimeout(200);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.status() === 200,
        { timeout: 30_000 }
      ),
      publish.click(),
    ]);

    await waitForMemoCardByText(page, TITLE);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForSelector(".memos-list", { timeout: 15_000 });
    const memoCardAfterReload = page
      .locator('[data-testid="memo-card"]')
      .filter({ hasText: TITLE })
      .first();
    await expect(memoCardAfterReload).toBeVisible({ timeout: 30_000 });

    const detailLink = memoCardAfterReload.locator('a[href^="/memos/"]').first();
    await expect(detailLink).toBeVisible();
    const href = await detailLink.getAttribute("href");
    if (href) {
      await page.goto(href, { waitUntil: "domcontentloaded" });
    } else {
      await detailLink.click();
      await page.waitForURL(/\/memos\/.+/);
    }

    await expect(page.locator("body")).toBeVisible();
    const article = page.locator(".memo-detail-page .nature-prose").first();
    await expect(article).toBeVisible({ timeout: 60_000 });
    await expect(article).toContainText(TITLE, { timeout: 60_000 });
    await expect
      .poll(async () => await article.locator("ul li").count(), {
        timeout: 60_000,
        message: "等待列表条目渲染为 2",
      })
      .toBe(2);
    await expect(article.getByText("项目一")).toBeVisible();
    await expect(article.getByText("项目二")).toBeVisible();
  });
});
