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
      { path: "/projects", heading: "项目展墙" },
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
    await expect(page).toHaveURL(/\/posts\/$/);
    await expect(page.getByRole("heading", { name: "文章" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );

    await mainNavigation.getByRole("link", { name: "标签", exact: true }).click();
    await expect(page).toHaveURL(/\/tags\/$/);
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
    await gotoWithTheme(page, "/posts/hello-world", "light");
    await expect(page.locator("main h1").first()).toHaveText("Hello World");

    await gotoWithTheme(page, "/memos/local-memo", "light");
    await expect(page.locator("main h1").first()).toHaveText("Local Memo");
    await expect(page.getByRole("heading", { name: "Local Memo", exact: true })).toHaveCount(1);

    await gotoWithTheme(page, "/tags", "light");
    const firstTag = page.locator('a[href^="/tags/"]').first();
    await expect(firstTag).toBeVisible();
    await firstTag.click();
    await expect(page).toHaveURL(/\/tags\//);
    await expect(page.locator("main h1").first()).toBeVisible();

    await gotoWithTheme(page, "/projects/kaisoumail", "light");
    await expect(page.locator("main h1").first()).toHaveText("KaisouMail");
    await expect(page.getByRole("heading", { name: "公开入口" })).toBeVisible();

    await gotoWithTheme(page, "/projects/loadlynx", "light");
    await expect(page.locator("main h1").first()).toHaveText("LoadLynx");
    const poster = page.locator(".project-poster");
    const posterImage = poster.locator("img");
    const socialPreviewImage = page.locator(".project-social-preview img");
    await expect(posterImage).toHaveCount(1);
    await expect(posterImage).toHaveAttribute("src", /loadlynx-light\.png$/);
    await expect(poster).toHaveCSS("aspect-ratio", "4 / 5");
    await expect(socialPreviewImage).toHaveAttribute("src", /loadlynx-light\.png$/);
    await expect(socialPreviewImage).toHaveAttribute("width", "1280");
    await expect(socialPreviewImage).toHaveAttribute("height", "640");
    await expect
      .poll(() =>
        socialPreviewImage.evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0
        )
      )
      .toBe(true);
    await page.evaluate(() => {
      document.documentElement.dataset.uiTheme = "dark";
    });
    await expect(posterImage).toHaveAttribute("src", /loadlynx-dark\.png$/);
    await expect(socialPreviewImage).toHaveAttribute("src", /loadlynx-dark\.png$/);
    await expect(page.getByRole("heading", { name: "关键能力或设计亮点" })).toBeVisible();

    await gotoWithTheme(page, "/projects/codex-vibe-monitor", "light");
    await expect(page.locator(".project-poster img")).toHaveCount(0);
    await expect(page.locator(".project-poster-copy")).toBeVisible();
    await expect(page.locator(".project-social-preview")).toHaveCount(0);
  });

  test("mobile detail reading measure does not apply a second horizontal gutter", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithTheme(page, "/posts/hello-world", "light");

    const detailContainer = page.locator(".nature-detail-container");
    const readingMeasure = detailContainer.locator(":scope > .nature-reading-measure");
    const [containerBounds, readingBounds, horizontalPadding] = await Promise.all([
      detailContainer.boundingBox(),
      readingMeasure.boundingBox(),
      detailContainer.evaluate((element) => {
        const style = getComputedStyle(element);
        return Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      }),
    ]);

    expect(containerBounds).not.toBeNull();
    expect(readingBounds).not.toBeNull();
    expect(
      Math.abs((readingBounds?.width ?? 0) - ((containerBounds?.width ?? 0) - horizontalPadding))
    ).toBeLessThanOrEqual(1);
  });

  test("mobile search entry still redirects correctly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithTheme(page, "/", "light");

    const shellInstanceId = await page.locator("html").getAttribute("data-public-session-id");
    const searchEntry = page.getByRole("link", { name: "搜索" });
    await expect(searchEntry).toBeVisible();
    await searchEntry.click();
    await expect(page).toHaveURL(/\/search\/$/);

    const searchInput = page.getByRole("textbox").first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Vue");
    await searchInput.press("Enter");

    await expect(page).toHaveURL(/\/search\/\?q=Vue/);
    await expect(page.getByRole("heading", { name: "搜索内容" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute(
      "data-public-session-id",
      shellInstanceId ?? ""
    );
  });

  test("mobile search keeps visible header navigation on a second aligned row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const headerSurface = page.locator(".nature-site-header .nature-surface");
    const mainContainer = page.locator("main .nature-container:visible").first();
    const mobileNavigation = page.getByRole("navigation", { name: "Main navigation" });
    const brand = page.getByRole("link", { name: "Ivan's Blog" });

    await expect(headerSurface).toBeVisible();
    await expect(mainContainer).toBeVisible();
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation.getByRole("link", { name: "文章", exact: true })).toBeVisible();
    await expect(page.locator('summary[aria-label="打开导航"]')).toHaveCount(0);

    const [headerBounds, mainBounds, navigationBounds, brandBounds] = await Promise.all([
      headerSurface.boundingBox(),
      mainContainer.boundingBox(),
      mobileNavigation.boundingBox(),
      brand.boundingBox(),
    ]);

    expect(headerBounds).not.toBeNull();
    expect(mainBounds).not.toBeNull();
    expect(navigationBounds).not.toBeNull();
    expect(brandBounds).not.toBeNull();
    expect(Math.abs((headerBounds?.x ?? 0) - (mainBounds?.x ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((headerBounds?.width ?? 0) - (mainBounds?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(navigationBounds?.y ?? 0).toBeGreaterThanOrEqual(
      brandBounds?.y ?? 0 + (brandBounds?.height ?? 0)
    );

    await expect(page.getByRole("button", { name: "Auto" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "RSS Feed" })).toBeVisible();
  });

  test("mobile header keeps the RSS control touch-sized", async ({ page }) => {
    await page.setViewportSize({ width: 438, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const rssLink = page.getByRole("link", { name: "RSS Feed" });
    await expect(rssLink).toBeVisible();
    await expect(rssLink).toHaveCSS("width", "44px");
    await expect(rssLink).toHaveCSS("height", "44px");
  });

  test("mobile search exposes its results region in the first viewport", async ({ page }) => {
    await page.setViewportSize({ width: 438, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const resultsRegion = page.locator("[data-search-island] [data-search-results-region]");
    const firstResult = resultsRegion.locator(":scope > *").first();
    await expect(resultsRegion).toBeVisible();
    await expect(firstResult).toBeVisible();

    const bounds = await firstResult.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.y ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(426);
  });

  test("mobile search avoids repeating its page purpose", async ({ page }) => {
    await page.setViewportSize({ width: 438, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const redundantKicker = page.locator(
      "[data-search-island] [data-search-query-panel] .nature-kicker"
    );
    await expect(redundantKicker).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "搜索内容" })).toBeVisible();
  });

  test("mobile search removes the redundant no-results summary", async ({ page }) => {
    await page.setViewportSize({ width: 438, height: 852 });
    await gotoWithTheme(page, "/search/?q=SSH", "light");

    const queryPanel = page.locator("[data-search-island] [data-search-query-panel]");
    const redundantSummary = queryPanel.getByText("还没有找到「SSH」", { exact: true });
    await expect(redundantSummary).toHaveCount(1);
    await expect(redundantSummary).toBeHidden();
    await expect(page.getByRole("heading", { name: "没有找到相关内容" })).toBeVisible();
  });

  test("query stays visible while the search island is waiting to hydrate", async ({ page }) => {
    let releaseSearchIsland: (() => void) | undefined;
    let markSearchIslandRequested: (() => void) | undefined;
    const searchIslandGate = new Promise<void>((resolve) => {
      releaseSearchIsland = resolve;
    });
    const searchIslandRequested = new Promise<void>((resolve) => {
      markSearchIslandRequested = resolve;
    });

    await page.route(/\/_astro\/SearchPageIsland\.[^/]+\.js$/, async (route) => {
      markSearchIslandRequested?.();
      await searchIslandGate;
      await route.continue();
    });

    try {
      await gotoWithTheme(page, "/search/?q=SSH%20%E6%8E%92%E9%9A%9C", "light");
      await searchIslandRequested;

      const bootstrap = page.locator("[data-search-bootstrap]");
      const islandHost = page.locator("[data-search-island]");
      await expect(bootstrap).toBeVisible();
      await expect(islandHost).toHaveAttribute("hidden", "");
      await expect(islandHost).toHaveAttribute("inert", "");
      await expect(islandHost).toHaveAttribute("aria-hidden", "true");
      await expect(page.getByRole("textbox", { name: "搜索关键词" })).toHaveCount(1);
      await expect(page.getByRole("textbox", { name: "搜索关键词" })).toHaveValue("SSH 排障");
      await expect(page.getByLabel("搜索结果加载中")).toBeVisible();
      await expect(page.getByText("正在检索「SSH 排障」")).toBeVisible();
      await expect(page.getByText("等待输入关键词")).toBeHidden();
      await expect(page.getByText("输入关键词开始搜索")).toBeHidden();

      await islandHost.locator("astro-island").dispatchEvent("public-search:error");
      await expect(page.getByRole("alert")).toContainText("搜索组件暂时没有加载完成");
      await expect(page.getByRole("alert")).toContainText("SSH 排障");
      await expect(page.getByRole("button", { name: "刷新重试" })).toBeVisible();
      await expect(page.getByLabel("搜索结果加载中")).toBeHidden();

      releaseSearchIsland?.();
      await expect(islandHost.locator("astro-island")).toHaveAttribute("data-search-ready", "true");
      await expect(bootstrap).toBeHidden();
      await expect(islandHost).not.toHaveAttribute("hidden", "");
      await expect(page.getByRole("textbox", { name: "搜索关键词" })).toHaveValue("SSH 排障");

      await page.goto("/search/?q=%20%20", { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-search-bootstrap]")).toBeHidden();
      await expect(page.getByText("等待输入关键词")).toBeVisible();
      await expect(page.getByText("输入关键词开始搜索")).toBeVisible();
    } finally {
      releaseSearchIsland?.();
    }
  });

  test("public mobile density stays compact without shrinking touch targets", async ({ page }) => {
    for (const width of [393, 320]) {
      await page.setViewportSize({ width, height: width === 393 ? 852 : 700 });

      for (const route of ["/memos", "/posts", "/search", "/projects"]) {
        await gotoWithTheme(page, route, "dark");
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth
          )
        ).toBe(false);
      }

      await gotoWithTheme(page, "/memos", "dark");
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        const header = document.querySelector<HTMLElement>(
          ".nature-site-header-frame > .nature-surface"
        );
        const card = document.querySelector<HTMLElement>(".nature-timeline-card");
        const rail = document.querySelector<HTMLElement>(".nature-timeline-rail");
        const navLabels = Array.from(
          document.querySelectorAll<HTMLElement>(".nature-nav-link-label")
        );
        const navTargets = Array.from(
          document.querySelectorAll<HTMLElement>(".nature-nav-link")
        ).map((target) => target.getBoundingClientRect());
        const viewportWidth = root.clientWidth;
        const edgeSelectors = [
          ".nature-site-header-frame > .nature-surface",
          "main > .nature-container",
          "footer .nature-container > .nature-surface",
        ];
        const shellEdges = edgeSelectors.map((selector) => {
          const element = document.querySelector<HTMLElement>(selector);
          const bounds = element?.getBoundingClientRect();

          return bounds
            ? { left: bounds.left, right: viewportWidth - bounds.right }
            : { left: -1, right: -1 };
        });

        return {
          hasRequiredElements: Boolean(header && card && rail),
          headerRadius: header ? Number.parseFloat(getComputedStyle(header).borderRadius) : 0,
          cardWidth: card?.getBoundingClientRect().width ?? 0,
          railWidth: rail?.getBoundingClientRect().width ?? 0,
          visibleNavLabels: navLabels.filter((label) => getComputedStyle(label).display !== "none")
            .length,
          shellEdges,
          navTargets: navTargets.map(({ width: targetWidth, height }) => ({
            width: targetWidth,
            height,
          })),
        };
      });

      expect(metrics.hasRequiredElements).toBe(true);
      expect(metrics.headerRadius).toBeLessThanOrEqual(16);
      for (const edges of metrics.shellEdges) {
        expect(edges.left).toBeCloseTo(12, 0);
        expect(edges.right).toBeCloseTo(12, 0);
      }
      expect(metrics.navTargets).toHaveLength(4);
      for (const target of metrics.navTargets) {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }

      if (width === 320) {
        expect(metrics.visibleNavLabels).toBe(0);
        expect(metrics.railWidth).toBeLessThanOrEqual(16);
        expect(metrics.cardWidth).toBeGreaterThanOrEqual(250);
      }
    }
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
    const memoCount = await memosTimeline.getByTestId("memo-card").count();
    expect(memoCount).toBeGreaterThan(0);
    if (memoCount > 1) {
      await expect(memosTimeline.getByTestId("timeline-connector").first()).toBeVisible();
    } else {
      await expect(memosTimeline.getByTestId("timeline-connector")).toHaveCount(0);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoWithTheme(page, "/memos", "light");
    const mobileTimeline = page.getByTestId("memos-timeline");
    const mobileNode = mobileTimeline.getByTestId("timeline-node").first();
    await expect(mobileNode).toBeVisible();

    const nodeBox = await mobileNode.boundingBox();
    expect(nodeBox).not.toBeNull();

    if (!nodeBox) {
      throw new Error("timeline node is not measurable on mobile");
    }

    expect(nodeBox.width).toBeGreaterThan(8);
    if (memoCount > 1) {
      const mobileConnector = mobileTimeline.getByTestId("timeline-connector").first();
      await expect(mobileConnector).toBeVisible();

      const connectorBox = await mobileConnector.boundingBox();
      expect(connectorBox).not.toBeNull();

      if (!connectorBox) {
        throw new Error("timeline connector is not measurable on mobile");
      }

      expect(connectorBox.height).toBeGreaterThan(24);
    } else {
      await expect(mobileTimeline.getByTestId("timeline-connector")).toHaveCount(0);
    }
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
