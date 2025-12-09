import { expect } from "@playwright/test";
import { adminTest as test } from "./fixtures";

test.describe("Post editor icons & Iconify CORS (admin)", () => {
  test.beforeEach(() => {
    test.setTimeout(60_000);
  });

  test("admin can open post editor and see base layout", async ({ page }) => {
    await page.context().clearCookies();

    const response = await page.goto("/admin/posts/editor");
    expect(response?.status()).toBe(200);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    expect(page.url()).toContain("/admin/posts/editor");

    await expect(page.getByRole("link", { name: "管理后台" }).first()).toBeVisible();
    await expect(page.getByText("选择一个文件开始编辑")).toBeVisible();

    await expect(page.getByText("401 未登录")).toHaveCount(0);
    await expect(page.getByText("403 权限不足")).toHaveCount(0);
    await expect(page.getByText("404 页面未找到")).toHaveCount(0);
  });

  test("iconify requests do not fail with CORS errors on post editor", async ({ page }) => {
    const messages: { type: string; text: string }[] = [];
    page.on("console", (msg) => {
      messages.push({ type: msg.type(), text: msg.text() });
    });

    const response = await page.goto("/admin/posts/editor");
    expect(response?.status()).toBe(200);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const errorMessages = messages.filter((m) => m.type === "error").map((m) => m.text);

    const forbiddenDomains = ["api.iconify.design", "api.simplesvg.com", "api.unisvg.com"];
    const corsKeywords = ["Request header field", "not allowed by Access-Control-Allow-Headers"];

    for (const msg of errorMessages) {
      const hasDomain = forbiddenDomains.some((d) => msg.includes(d));
      const hasCors = corsKeywords.some((k) => msg.includes(k));
      if (hasDomain && hasCors) {
        throw new Error(`Unexpected Iconify-related CORS error in console: ${msg}`);
      }
    }
  });

  test("lucide icons are rendered in post editor UI", async ({ page }) => {
    const response = await page.goto("/admin/posts/editor");
    expect(response?.status()).toBe(200);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const lucideIcons = page.locator('[class*="iconify--lucide"]');
    expect(await lucideIcons.count()).toBeGreaterThan(0);
    await expect(lucideIcons.first()).toBeVisible();
  });
});
