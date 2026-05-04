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
      { path: "/search", heading: "搜索内容" },
      { path: "/about", heading: /你好，我是 Ivan/ },
      { path: "/projects", heading: "项目总览" },
    ] as const;

    for (const route of routes) {
      await gotoWithTheme(page, route.path, "light");
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "light");
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
    }
  });

  test("public shell persists across client-side navigation without losing theme", async ({
    page,
  }) => {
    await gotoWithTheme(page, "/", "dark");

    const publicShell = page.getByTestId("public-site-shell");
    await expect(publicShell).toBeVisible();
    const shellInstanceId = await page.locator("html").getAttribute("data-public-session-id");

    expect(shellInstanceId).toBeTruthy();
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );

    const mainNavigation = page.getByRole("navigation", { name: "Main navigation" });

    await mainNavigation.getByRole("link", { name: "文章", exact: true }).click();
    await expect(page).toHaveURL(/\/posts$/);
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );

    await mainNavigation.getByRole("link", { name: "标签", exact: true }).click();
    await expect(page).toHaveURL(/\/tags$/);
    await expect(page.getByRole("heading", { name: "浏览所有标签" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );

    const firstTag = page.locator('a[href^="/tags/"]').first();
    await firstTag.click();
    await expect(page).toHaveURL(/\/tags\//);
    await expect(page.locator("main h1").first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );
    await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
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

    const shellInstanceId = await page.locator("html").getAttribute("data-public-session-id");
    const searchEntry = page.getByRole("link", { name: "搜索" });
    await expect(searchEntry).toBeVisible();
    await searchEntry.click();
    await expect(page).toHaveURL(/\/search$/);

    const searchInput = page.getByRole("textbox").first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Vue");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\?q=Vue/);
    await expect(page.getByRole("heading", { name: "搜索内容" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );
  });

  test("home and memos timelines keep visible nodes and rails across breakpoints", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });

    await gotoWithTheme(page, "/", "light");
    const homeTimeline = page.getByTestId("home-timeline");
    await expect(homeTimeline).toBeVisible();
    await expect(homeTimeline.getByTestId("timeline-item").first()).toBeVisible();
    await expect(homeTimeline.getByTestId("timeline-node").first()).toBeVisible();
    await expect(homeTimeline.getByTestId("timeline-connector").first()).toBeVisible();
    expect(await homeTimeline.getByTestId("timeline-item").count()).toBeGreaterThan(1);

    await gotoWithTheme(page, "/memos", "light");
    const memosTimeline = page.getByTestId("memos-timeline");
    await expect(memosTimeline).toBeVisible();
    await expect(memosTimeline.getByTestId("memo-card").first()).toBeVisible();
    await expect(memosTimeline.getByTestId("timeline-node").first()).toBeVisible();
    await expect(memosTimeline.getByTestId("timeline-connector").first()).toBeVisible();
    expect(await memosTimeline.getByTestId("memo-card").count()).toBeGreaterThan(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithTheme(page, "/memos", "light");
    const mobileTimeline = page.getByTestId("memos-timeline");
    const mobileNode = mobileTimeline.getByTestId("timeline-node").first();
    const mobileConnector = mobileTimeline.getByTestId("timeline-connector").first();
    await expect(mobileNode).toBeVisible();
    await expect(mobileConnector).toBeVisible();

    const nodeBox = await mobileNode.boundingBox();
    const connectorBox = await mobileConnector.boundingBox();

    expect(nodeBox).not.toBeNull();
    expect(connectorBox).not.toBeNull();

    if (!nodeBox || !connectorBox) {
      throw new Error("timeline node or connector is not measurable on mobile");
    }

    expect(nodeBox.width).toBeGreaterThan(8);
    expect(connectorBox.height).toBeGreaterThan(24);
  });

  test.describe("system theme and reduced motion", () => {
    test("public shell resolves dark theme when motion is reduced", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await gotoWithTheme(page, "/", "system");

      await expect(page.locator("html")).toHaveAttribute("data-ui-preference", "system");
      await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");

      const media = await page.evaluate(() => ({
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
        prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      }));

      expect(media.prefersDark).toBe(true);
      expect(media.prefersReducedMotion).toBe(true);
      await expect(page.getByRole("heading", { name: /Ivan's Blog/ })).toBeVisible();
    });
  });

  test("non-production tooling routes return 404 in production gateway", async ({ request }) => {
    for (const route of ["/theme-test", "/test-editor", "/demo-integration", "/demo-memo-card"]) {
      const response = await request.get(route);
      expect(response.status(), route).toBe(404);
    }
  });
});
