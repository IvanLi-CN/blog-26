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
    await gotoWithTheme(page, "/posts/react-hooks-deep-dive", "light");
    await expect(page.locator("main h1").first()).toHaveText("React Hooks 深度解析");

    await gotoWithTheme(page, "/memos/e2e-local", "light");
    await expect(page.locator("main h1").first()).toHaveText("E2E 删除测试-LOCAL");

    await gotoWithTheme(page, "/tags", "light");
    const firstTag = page.locator('a[href^="/tags/"]').first();
    await expect(firstTag).toBeVisible();
    await firstTag.click();
    await expect(page).toHaveURL(/\/tags\//);
    await expect(page.locator("main h1").first()).toBeVisible();
  });

  test("mobile search entry still redirects correctly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithTheme(page, "/", "light");

    const searchEntry = page.getByRole("link", { name: "搜索" });
    await expect(searchEntry).toBeVisible();
    await searchEntry.click();
    await expect(page).toHaveURL(/\/search$/);

    const searchInput = page.getByRole("textbox").first();
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
