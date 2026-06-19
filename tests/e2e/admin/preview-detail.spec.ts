import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";
import {
  openAdminMemoDetail,
  waitForAdminPreviewMemoBody,
  waitForQuickMemoEditor,
} from "./memos/helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Admin preview detail", () => {
  test("post preview renders detail rhythm and only shows hero when source image exists", async ({
    page,
  }) => {
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    const slug = "hello-world";
    const previewResponse = await page.request.get(`/api/admin/preview/posts/${slug}`);
    expect(previewResponse.ok()).toBe(true);
    const payload = (await previewResponse.json()) as {
      title?: string;
      excerpt?: string | null;
      image?: string | null;
      category?: string | null;
    };
    expect(payload.image).toBeTruthy();

    await page.goto(`/admin/preview/posts/${slug}`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    const article = page.locator("article").first();
    const articleHeader = article.locator("header").first();
    await expect(page.getByRole("heading", { name: "文章预览" })).toBeVisible({ timeout: 60_000 });
    await expect(articleHeader.getByRole("heading", { name: payload.title ?? /.+/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("admin-preview-post-body")).toBeVisible({ timeout: 60_000 });

    if (payload.excerpt) {
      await expect(page.getByTestId("admin-preview-description")).toHaveText(payload.excerpt, {
        timeout: 60_000,
      });
    }

    const hero = page.getByTestId("admin-preview-hero");
    await expect(hero).toBeVisible({ timeout: 60_000 });
    await expect(hero.locator("img")).toHaveAttribute("src", payload.image ?? "");
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const heroNode = document.querySelector('[data-testid="admin-preview-hero"]');
            const bodyNode = document.querySelector('[data-testid="admin-preview-post-body"]');
            if (!(heroNode instanceof HTMLElement) || !(bodyNode instanceof HTMLElement)) {
              return false;
            }
            return Boolean(
              heroNode.compareDocumentPosition(bodyNode) & Node.DOCUMENT_POSITION_FOLLOWING
            );
          }),
        { timeout: 10_000 }
      )
      .toBe(true);

    await expect(article.getByText("Feedback", { exact: true })).toHaveCount(0);
    await expect(article.getByRole("heading", { name: "相关文章" })).toHaveCount(0);
    await expect(article.locator('[data-testid="comment-section"]')).toHaveCount(0);
  });

  test("memo preview keeps detail shell without hero and suppresses excerpt area", async ({
    page,
  }) => {
    test.setTimeout(150_000);

    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const { container, editor } = await waitForQuickMemoEditor(page);
    const title = `Preview hero memo ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(`# ${title}`);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("正文段落");
    await page.waitForTimeout(300);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByText("Memo 已创建：")).toBeVisible({ timeout: 30_000 });

    const memoCards = page.locator('[data-testid="admin-live-memo-card"]');
    const createdCard = memoCards.filter({ hasText: title }).first();
    await expect(createdCard).toBeVisible({ timeout: 60_000 });
    const slug = await createdCard.getAttribute("data-slug");
    expect(slug).toBeTruthy();
    if (!slug) {
      throw new Error("Expected created memo to expose slug");
    }

    await openAdminMemoDetail(page, slug);
    await waitForAdminPreviewMemoBody(page);

    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(1);
    await expect(page.getByTestId("admin-preview-hero")).toHaveCount(0);
    await expect(page.getByTestId("admin-preview-description")).toHaveCount(0);
    await expect(page.getByTestId("public-memo-detail-controls")).toBeVisible();
    await expect(page.getByRole("button", { name: "编辑 Memo" })).toBeVisible();
    await expect(page.getByTestId("admin-live-memo-delete")).toBeVisible();
    await expect(
      page.locator("article").first().getByText("Feedback", { exact: true })
    ).toHaveCount(0);
    await expect(
      page.locator("article").first().getByRole("heading", { name: "相关文章" })
    ).toHaveCount(0);
    await expect(
      page.locator("article").first().locator('[data-testid="comment-section"]')
    ).toHaveCount(0);
  });
});
