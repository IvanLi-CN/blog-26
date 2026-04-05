import { expect, type Page, test } from "@playwright/test";

async function gotoWithTheme(page: Page, route: string, theme: "light" | "dark" | "system") {
  await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
  await page.goto(route, { waitUntil: "domcontentloaded" });
}

test.describe("Nature frontend public coverage", () => {
  test("core public routes render under the Nature shell", async ({ page }) => {
    const routes = [
      { path: "/", heading: /Ivan's Blog/ },
      { path: "/posts", heading: "文章" },
      { path: "/memos", heading: "Memos" },
      { path: "/tags", heading: "浏览所有标签" },
      { path: "/search", heading: "搜索" },
      { path: "/about", heading: /你好，我是 Ivan/ },
      { path: "/projects", heading: "项目总览" },
      { path: "/theme-test", heading: "Nature 视觉基线" },
    ] as const;

    for (const route of routes) {
      await gotoWithTheme(page, route.path, "light");
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "light");
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    }
  });

  test("detail routes and tag drill-down remain navigable", async ({ page }) => {
    await gotoWithTheme(page, "/posts/web-security-protection-guide", "light");
    await expect(page.locator("main h1").first()).toHaveText("Web 安全防护指南");

    await gotoWithTheme(page, "/memos/e2e-shan1-chu2-ce4-shi4-webdav", "light");
    await expect(page.locator("main h1").first()).toHaveText("E2E 删除测试-WEBDAV");

    await gotoWithTheme(page, "/tags", "light");
    const firstTag = page.locator('a[href^="/tags/"]').first();
    await expect(firstTag).toBeVisible();
    await firstTag.click();
    await expect(page).toHaveURL(/\/tags\//);
    await expect(page.locator("main h1").first()).toBeVisible();
  });

  test("mobile menu search still redirects correctly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithTheme(page, "/", "light");

    const toggleMenu = page.getByRole("button", { name: "Toggle Menu" });
    const closeMenu = page.getByRole("button", { name: "Close menu" });
    await expect(toggleMenu).toBeVisible();
    let opened = false;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await toggleMenu.click();
      if (await closeMenu.isVisible().catch(() => false)) {
        opened = true;
        break;
      }
      await page.waitForTimeout(1000);
    }

    expect(opened).toBe(true);

    const searchInput = page.locator('div.fixed.inset-0 input[placeholder="搜索文章..."]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Vue");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=Vue/);
    await expect(page.getByRole("heading", { name: "搜索" })).toBeVisible();
  });

  test.describe("system theme and reduced motion", () => {
    test("theme-test renders with resolved dark theme when motion is reduced", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await gotoWithTheme(page, "/theme-test", "system");

      await expect(page.locator("html")).toHaveAttribute("data-ui-preference", "system");
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");

      const media = await page.evaluate(() => ({
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
        prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      }));

      expect(media.prefersDark).toBe(true);
      expect(media.prefersReducedMotion).toBe(true);
      await expect(page.getByRole("heading", { name: "Nature 视觉基线" })).toBeVisible();
    });
  });
});
