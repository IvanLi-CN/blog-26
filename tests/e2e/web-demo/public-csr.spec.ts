import { expect, type Page, test } from "@playwright/test";

const routeApi = (url: string) => new URL(url).pathname === "/api/public/page";
async function ready(page: Page) {
  await page.waitForFunction(
    () =>
      !document.querySelector('astro-island[component-url*="PublicRouter"]')?.hasAttribute("ssr")
  );
}
async function clickRoute(page: Page, path: string) {
  // Use a real anchor event, including targets absent from the persistent main navigation.
  await page.evaluate((path) => {
    const link = document.createElement("a");
    link.href = path;
    link.dataset.csrTestLink = "true";
    link.textContent = "Test route";
    document.body.append(link);
  }, path);
  await page.locator("a[data-csr-test-link]").click();
  await page.locator("a[data-csr-test-link]").evaluate((node) => node.remove());
}

async function openInspector(page: Page) {
  const trigger = page.getByRole("button", { name: "打开 Web Demo 调试控制面板", exact: true });
  if (await trigger.isVisible()) await trigger.click();
}

const asyncSkeletonRoutes = [
  ["/", "home"],
  ["/posts/", "posts"],
  ["/posts/hello-world/", "post"],
  ["/projects/", "projects"],
  ["/projects/codex-vibe-monitor/", "project"],
  ["/tags/", "tags"],
  ["/tags/code/", "tag"],
  ["/memos/", "memos"],
  ["/memos/memo-web-demo-1181/", "memo"],
  ["/search/?q=fixture", "search"],
  ["/playbook/", "playbook"],
  ["/playbook/topics/delivery/", "playbookDetail"],
] as const;

test("client navigation renders the destination skeleton for every async route family", async ({
  page,
}) => {
  await page.goto("/posts/?d_connection=online&d_delay=normal");
  await ready(page);

  for (const [path, kind] of asyncSkeletonRoutes) {
    let release = () => {
      /* Assigned synchronously by the Promise constructor. */
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    const routeHandler = async (route: import("@playwright/test").Route) => {
      const requestPath = new URL(route.request().url()).searchParams.get("path") ?? "";
      if (!held && requestPath.startsWith(path)) {
        held = true;
        await gate;
      }
      await route.continue();
    };
    await page.route("**/api/public/page**", routeHandler);
    try {
      await clickRoute(page, path);
      await expect.poll(() => held, { message: `expected a gated read for ${path}` }).toBe(true);
      await expect(page.locator(`main [data-public-route-skeleton="${kind}"]`)).toBeVisible();
      await expect(page.locator("main.nature-main")).toHaveAttribute("aria-busy", "true");
      await expect(page.locator("html[data-public-navigation-pending]")).toHaveCount(1);
    } finally {
      release();
    }
    await expect(page.locator("main.nature-main")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator("html[data-public-navigation-pending]")).toHaveCount(0);
    await page.unroute("**/api/public/page**", routeHandler);
  }

  await clickRoute(page, "/about/");
  await expect(page.locator("main [data-public-route-skeleton]")).toHaveCount(0);
  await expect(page.locator("html[data-public-navigation-pending]")).toHaveCount(0);
  await expect(page.locator("main h1")).toContainText("你好");
  await clickRoute(page, "/definitely-not-a-product-route/");
  await expect(page.locator("main [data-public-route-skeleton]")).toHaveCount(0);
  await expect(page.locator("html[data-public-navigation-pending]")).toHaveCount(0);
  await expect(page.locator("main")).toContainText("404");
});

test("tags navigation skeleton keeps the grouped tag index geometry", async ({ page }) => {
  await page.goto("/posts/?d_connection=online&d_delay=normal");
  await ready(page);

  let release = () => {
    /* Assigned synchronously by the Promise constructor. */
  };
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  const routeHandler = async (route: import("@playwright/test").Route) => {
    const requestPath = new URL(route.request().url()).searchParams.get("path") ?? "";
    if (!held && requestPath.startsWith("/tags/")) {
      held = true;
      await gate;
    }
    await route.continue();
  };
  await page.route("**/api/public/page**", routeHandler);
  try {
    await clickRoute(page, "/tags/");
    await expect.poll(() => held, { message: "expected a gated tags read" }).toBe(true);
    await expect(page.locator('main [data-public-route-skeleton="tags"]')).toBeVisible();

    const geometry = await page
      .locator('main [data-public-route-skeleton="tags"]')
      .evaluate((root) => {
        const pageSkeleton = root.querySelector<HTMLElement>(".public-skeleton-tags-page");
        const groups = [...root.querySelectorAll<HTMLElement>(".public-skeleton-tag-group")];
        const grids = [...root.querySelectorAll<HTMLElement>(".public-skeleton-tag-grid")];
        return {
          pageDisplay: pageSkeleton ? getComputedStyle(pageSkeleton).display : null,
          groupDisplays: groups.map((group) => getComputedStyle(group).display),
          gridColumnCounts: grids.map(
            (grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length
          ),
          cardCounts: grids.map((grid) => grid.children.length),
        };
      });
    expect(geometry.pageDisplay).toBe("grid");
    expect(geometry.groupDisplays).toEqual(["grid", "grid", "grid"]);
    expect(geometry.gridColumnCounts.every((count) => count >= 2)).toBe(true);
    expect(geometry.cardCounts).toEqual([6, 6, 6]);
  } finally {
    release();
  }
  await expect(page.locator("main.nature-main")).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/api/public/page**", routeHandler);
});

test("public header stays on one row beside the open Web Demo Inspector", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("web-demo-inspector-open", "true");
  });
  await page.goto("/posts/?d_connection=online&d_delay=normal");
  await ready(page);

  await expect(page.locator('body[data-web-demo-inspector-open="true"]')).toHaveCount(1);
  for (const { width, compactHeader } of [
    { width: 1200, compactHeader: true },
    { width: 1280, compactHeader: true },
    { width: 1440, compactHeader: true },
    { width: 1555, compactHeader: true },
    { width: 1561, compactHeader: true },
    { width: 1580, compactHeader: true },
    { width: 1589, compactHeader: true },
    { width: 1590, compactHeader: false },
    { width: 1600, compactHeader: false },
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(
        () =>
          page
            .locator(".nature-header-search-form")
            .evaluate((node) => getComputedStyle(node).display),
        { message: `${width}px desktop header layout settles` }
      )
      .toBe(compactHeader ? "none" : "flex");
    const headerSurface = page.locator(".nature-site-header .nature-surface");
    const navigation = page.getByRole("navigation", { name: "Main navigation" });
    const tools = page.locator(".nature-header-tools");
    const [headerBounds, navigationBounds, toolsBounds] = await Promise.all([
      headerSurface.boundingBox(),
      navigation.boundingBox(),
      tools.boundingBox(),
    ]);

    expect(headerBounds, `${width}px header surface`).not.toBeNull();
    expect(navigationBounds, `${width}px navigation`).not.toBeNull();
    expect(toolsBounds, `${width}px header tools`).not.toBeNull();
    expect(
      Math.abs((navigationBounds?.y ?? 0) - (toolsBounds?.y ?? 0)),
      `${width}px navigation and tools stay on one row`
    ).toBeLessThanOrEqual(2);
    expect(headerBounds?.height ?? 0, `${width}px header height`).toBeLessThan(96);
    expect(
      await page
        .locator(".nature-header-search-form")
        .evaluate((node) => getComputedStyle(node).display),
      `${width}px desktop search input display`
    ).toBe(compactHeader ? "none" : "flex");
    expect(
      await page
        .locator(".nature-header-search-link")
        .evaluate((node) => getComputedStyle(node).display),
      `${width}px search action display`
    ).toBe(compactHeader ? "flex" : "none");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
      ),
      `${width}px page has no horizontal overflow`
    ).toBe(true);
  }
});

test("public header keeps the full search form without the Web Demo Inspector", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("web-demo-inspector-open", "false");
  });
  await page.goto("/posts/?d_connection=online&d_delay=normal");
  await ready(page);
  await expect
    .poll(() => page.locator("body").getAttribute("data-web-demo-inspector-open"))
    .toBe("false");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await expect(page.locator(".nature-header-search-form")).toBeVisible();
  await expect(page.locator(".nature-header-search-link")).toBeHidden();
});

test("SSR content hydrates without repeating its page read", async ({ page, request }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (/hydrat|Minified React error #(418|425)/i.test(message.text()))
      hydrationErrors.push(message.text());
  });
  const response = await request.get("/posts/code-block-fixture/?d_connection=offline");
  expect(await response.text()).toContain("This fixture exists for canonical full E2E coverage");
  const reads: string[] = [];
  page.on("request", (r) => {
    if (routeApi(r.url())) reads.push(r.url());
  });
  await page.goto("/posts/code-block-fixture/?d_connection=offline&d_delay=normal");
  await ready(page);
  await expect(page.locator("main")).toContainText("Code Block Fixture");
  await expect(page.locator("main [data-public-route-error]")).toHaveCount(0);
  expect(reads).toEqual([]);
  expect(hydrationErrors).toEqual([]);
});

for (const path of [
  "/posts/",
  "/posts/hello-world/",
  "/projects/",
  "/projects/codex-vibe-monitor/",
  "/tags/",
  "/tags/code/",
  "/memos/",
  "/memos/memo-web-demo-1181/",
  "/search/?q=fixture",
  "/playbook/",
  "/playbook/topics/delivery/",
  "/playbook/policies/safe-release/",
]) {
  test(`offline target owns its failure and recovers: ${path}`, async ({ page }) => {
    await page.goto("/posts/code-block-fixture/?d_connection=offline&d_delay=normal");
    await ready(page);
    const documents: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "document") documents.push(r.url());
    });
    await clickRoute(page, path);
    await expect(page.locator("main [role=alert]")).toContainText("页面暂时无法加载");
    await expect(page.locator("main [data-public-route-error]")).toBeVisible();
    await expect(page.locator("html[data-public-navigation-pending]")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(new URL(path, "http://demo.invalid").pathname);
    await expect(page.locator("main .post-detail-body")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Inspector");
    expect(documents).toEqual([]);
    await openInspector(page);
    const recovered = page.waitForResponse((response) => routeApi(response.url()));
    await page.getByRole("radio", { name: "在线", exact: true }).click();
    expect((await (await recovered).json()).kind).not.toBe("notFound");
    await expect(page.locator("main.nature-main")).toHaveAttribute("aria-busy", "false");
    await expect(page.locator("main [role=alert]")).toHaveCount(0);
    expect(documents).toEqual([]);
  });
}

test("online CSR fetches structured data, keeps theme and uses fresh reads on history", async ({
  page,
}) => {
  await page.goto("/posts/?d_connection=online&d_theme=dark&d_persona=admin&d_delay=normal");
  await ready(page);
  await openInspector(page);
  const requests: string[] = [];
  const documents: string[] = [];
  page.on("request", (r) => {
    if (routeApi(r.url())) requests.push(r.url());
    if (r.resourceType() === "document") documents.push(r.url());
  });
  await page
    .getByRole("heading", { name: "Code Block Fixture", exact: true })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/posts\/code-block-fixture\/?(?:\?.*)?$/);
  await expect(page.locator("main.nature-main")).toHaveAttribute("data-public-route", "post");
  await expect(page.locator("main.nature-main")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("main .post-detail-body")).toContainText("const tiny");
  await page.getByRole("link", { name: "项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/?(?:\?.*)?$/);
  await expect(page.locator("main.nature-main")).toHaveAttribute("data-public-route", "projects");
  await expect(page.locator("main.nature-main")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("main h1")).toHaveText("项目");
  await page.goBack();
  await expect(page).toHaveURL(/\/posts\/code-block-fixture\/?(?:\?.*)?$/);
  await expect(page.locator("main.nature-main")).toHaveAttribute("data-public-route", "post");
  await expect(page.locator("main.nature-main")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("main .post-detail-body")).toContainText("const tiny");
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
  await expect(page.getByRole("radio", { name: "管理员", exact: true })).toBeChecked();
  expect(
    requests.filter((url) =>
      new URL(url).searchParams.get("path")?.startsWith("/posts/code-block-fixture/")
    ).length
  ).toBe(2);
  expect(documents).toEqual([]);
});

test("delay and cancellation cannot let an old route overwrite the newest one", async ({
  page,
}) => {
  await page.goto("/posts/?d_connection=online&d_delay=custom&d_delay_ms=800");
  await ready(page);
  const reads: string[] = [];
  page.on("request", (r) => {
    if (routeApi(r.url())) reads.push(r.url());
  });
  // Dispatch both real anchor events in one browser turn so driver/VM latency cannot
  // consume the delay before the cancellation is exercised.
  await page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>('header a[aria-label="项目"]')?.click();
    document.querySelector<HTMLAnchorElement>('header a[aria-label="标签"]')?.click();
  });
  await expect(page.locator("main h1")).toContainText("标签");
  expect(reads.some((url) => new URL(url).searchParams.get("path")?.startsWith("/projects/"))).toBe(
    false
  );
  expect(reads.some((url) => new URL(url).searchParams.get("path")?.startsWith("/tags/"))).toBe(
    true
  );
});

test("static about and unknown routes do not manufacture offline failures", async ({ page }) => {
  await page.goto("/posts/?d_connection=offline");
  await ready(page);
  await clickRoute(page, "/about/");
  await expect(page.locator("main h1")).toContainText("你好");
  await clickRoute(page, "/definitely-not-a-product-route/");
  await expect(page.locator("main")).toContainText("404");
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
});
