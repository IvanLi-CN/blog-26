import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

test.describe("Admin SPA phase 2", () => {
  test("dashboard is served from the SPA shell and only calls /api/admin", async ({ page }) => {
    const finishedRequests: string[] = [];
    page.on("requestfinished", (request) => {
      finishedRequests.push(request.url());
    });

    const response = await page.goto("/admin", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "管理员仪表盘" })).toBeVisible();
    await expect(page.getByRole("link", { name: /管理后台 内容工作台/ })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    await expect
      .poll(() => finishedRequests.some((url) => url.includes("/api/admin/session")))
      .toBe(true);
    await expect
      .poll(() => finishedRequests.some((url) => url.includes("/api/admin/dashboard/stats")))
      .toBe(true);
    await expect.poll(() => finishedRequests.some((url) => url.includes("/api/trpc"))).toBe(false);
  });

  test("editor de-duplicates the same article when opened from slug and file browser", async ({
    page,
  }) => {
    await page.goto("/admin/posts/editor?slug=redis-caching-strategies", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator('[data-testid="editor"]')).toBeVisible();
    const fileBrowser = page.getByTestId("editor-file-browser");
    const targetFile = fileBrowser.getByRole("button", {
      name: "05-redis-caching-strategies.md",
      exact: true,
    });
    await expect(fileBrowser).toBeVisible();
    if (!(await targetFile.isVisible())) {
      await fileBrowser.getByRole("button", { name: "blog" }).click();
    }
    await expect(targetFile).toBeVisible();
    await targetFile.click();

    await expect(
      page.getByTestId("editor-tab").filter({ hasText: "Redis 缓存策略与优化" })
    ).toHaveCount(1);
  });

  test("legacy aliases, posts list, and editor remain usable", async ({ page }) => {
    await page.goto("/admin/data-sync", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page).toHaveURL(/\/admin\/content-sync$/);
    await expect(page.getByRole("heading", { name: "内容同步" })).toBeVisible();

    await page.goto("/admin/posts", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();
    await expect(page.getByRole("link", { name: "新建草稿" })).toBeVisible();
    await expect(page.getByRole("link", { name: "编辑" }).first()).toBeVisible();

    await page.goto("/admin/posts/editor?slug=react-hooks-deep-dive", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await expect(page.locator('[data-testid="editor"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "文章编辑器" })).toBeVisible();
    await expect(page.getByText("React Hooks 深度解析").first()).toBeVisible();
    await expect(page.getByTestId("editor").getByText("react-hooks-deep-dive")).toBeVisible();
  });

  test("new empty article shows a friendly validation message instead of raw issues", async ({
    page,
  }) => {
    await page.goto("/admin/posts/editor", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.locator('[data-testid="editor"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "文章编辑器" })).toBeVisible();

    await page.getByTestId("editor-create-post").click();
    await page.getByTestId("editor-save").click();

    await expect(page.getByText("内容不能为空，请先输入正文后再保存。")).toBeVisible();
    await expect(page.getByText(/"minimum": 1|"path": \\["body"\\]/)).toHaveCount(0);
  });
});
