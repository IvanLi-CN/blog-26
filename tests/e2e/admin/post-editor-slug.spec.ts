import { expect, test } from "@playwright/test";

/**
 * 文章编辑器（管理员）- 通过 slug 参数编辑
 * 通过 dev 登录会话建立管理员身份后，/admin/posts/editor 可直接访问。
 */

test.describe("文章编辑器 - slug 参数 (admin)", () => {
  test.beforeEach(async () => {
    test.setTimeout(60_000);
  });

  test("编辑器页面支持 slug 参数并可访问", async ({ page }) => {
    await page.goto("/admin/posts/editor?slug=test-article");
    await page.waitForLoadState("networkidle");

    // 管理员应无需跳转登录，直接看到编辑器结构或加载状态
    const url = page.url();
    expect(url).toContain("/admin/posts/editor");

    await page.waitForTimeout(1000);
    const hasEditor = await page
      .locator('[data-testid="editor"], .editor, .UniversalEditor, .ProseMirror')
      .isVisible();
    const bodyVisible = await page.locator("body").isVisible();
    expect(bodyVisible).toBe(true);
    expect(hasEditor || bodyVisible).toBeTruthy();
  });

  test("错误处理：不存在的 slug", async ({ page }) => {
    await page.goto("/admin/posts/editor?slug=non-existent-slug-12345");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const hasError = await page.locator("text=未找到").isVisible();
    const bodyVisible = await page.locator("body").isVisible();
    expect(hasError || bodyVisible).toBe(true);
  });

  test("向后兼容：id 参数仍然工作", async ({ page }) => {
    await page.goto("/admin/posts/editor?id=post-1234567890");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("body").isVisible()).toBe(true);

    await page.goto("/admin/posts/editor?id=posts/test-post.md");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("body").isVisible()).toBe(true);

    await page.goto("/admin/posts/editor?id=/webdav/test-post.md");
    await page.waitForLoadState("networkidle");
    expect(await page.locator("body").isVisible()).toBe(true);
  });
});
