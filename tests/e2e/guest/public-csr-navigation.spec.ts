import { expect, test } from "@playwright/test";

async function ready(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () =>
      !document.querySelector('astro-island[component-url*="PublicRouter"]')?.hasAttribute("ssr")
  );
}

async function linkTo(page: import("@playwright/test").Page, href: string) {
  await page.evaluate((href) => {
    const link = document.createElement("a");
    link.href = href;
    link.dataset.csrTestLink = "true";
    link.textContent = "Navigate to target";
    document.body.append(link);
    link.click();
    link.remove();
  }, href);
}

const routeData = (url: string) => {
  const path = new URL(url).pathname;
  return path === "/api/public/page" || path.startsWith("/_content/routes/");
};

test("Memo list route data contains card summaries without unvisited detail bodies", async ({
  page,
}) => {
  await page.goto("/posts/");
  await ready(page);
  const response = page.waitForResponse((response) => routeData(response.url()));
  await page.getByRole("link", { name: "闪念", exact: true }).click();
  const payload = await (await response).json();
  expect(payload.kind).toBe("memos");
  for (const field of ["initialMemos", "renderedMemos"]) {
    expect(payload.data[field].length).toBeGreaterThan(0);
    for (const memo of payload.data[field]) {
      expect(memo).toHaveProperty("slug");
      expect(memo).toHaveProperty("excerpt");
      expect(memo).not.toHaveProperty("content");
    }
  }
});

test("navigation during a pending history read preserves the destination reading position", async ({
  page,
}) => {
  await page.goto("/projects/xp/");
  await ready(page);
  await page.evaluate(() => window.scrollTo({ top: 1100, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => history.state?.publicCsrScroll?.top)).toBe(1100);
  await page.getByRole("link", { name: "文章", exact: true }).click();
  await expect(page.locator("main.nature-main h1")).toHaveText("文章");
  let resume = () => {
    /* Assigned synchronously by the Promise constructor. */
  };
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      routeData(url.href) &&
      (url.searchParams.get("path") === "/projects/xp/" ||
        url.pathname.endsWith("/projects/xp.json"))
    ) {
      await released;
      await route.continue().catch(() => {
        /* The obsolete history read may already have been aborted. */
      });
    } else await route.continue();
  });
  try {
    await page.goBack();
    await expect(page.locator("main.nature-main h1")).toHaveText("正在加载页面");
    await page.getByRole("link", { name: "标签", exact: true }).click();
    await expect(page.locator("main.nature-main h1")).toHaveText("浏览所有标签");
  } finally {
    resume();
  }
  await page.goBack();
  await expect(page.locator("#raft-期望状态")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.abs(window.scrollY - 1100))).toBeLessThan(2);
});

test("fragment history restores reading positions on direct and cross-page entries", async ({
  page,
}) => {
  await page.goto("/projects/xp/");
  await ready(page);
  await page.evaluate(() => window.scrollTo({ top: 450, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => history.state?.publicCsrScroll?.top)).toBe(450);
  await linkTo(page, "#raft-期望状态");
  await expect(page).toHaveURL(/#raft-/);
  await expect
    .poll(() =>
      page.locator("#raft-期望状态").evaluate((node) => Math.abs(node.getBoundingClientRect().top))
    )
    .toBeLessThan(250);
  const fragmentScroll = await page.evaluate(() => window.scrollY);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => Math.abs(window.scrollY - 450))).toBeLessThan(2);
  await page.goForward();
  await expect(page).toHaveURL(/#raft-/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(fragmentScroll);
  await page.evaluate(() => window.scrollTo({ top: 1100, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => history.state?.publicCsrScroll?.top)).toBe(1100);
  await linkTo(page, "/posts/");
  await expect(page.locator("main.nature-main h1")).toHaveText("文章");
  await page.goBack();
  await expect(page.locator("#raft-期望状态")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.abs(window.scrollY - 1100))).toBeLessThan(2);
});

test("a cross-page fragment waits for the route-specific MDX module", async ({ page }) => {
  await page.goto("/posts/");
  await ready(page);
  let resume = () => {
    /* Assigned synchronously by the Promise constructor. */
  };
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await released;
    await route.continue();
  });
  try {
    await linkTo(page, "/projects/xp/#raft-期望状态");
    await expect(page.locator("[data-public-body-pending]")).toBeVisible();
  } finally {
    resume();
  }
  await expect(page.locator("#raft-期望状态")).toBeVisible();
  await expect
    .poll(() =>
      page.locator("#raft-期望状态").evaluate((node) => Math.abs(node.getBoundingClientRect().top))
    )
    .toBeLessThan(250);
  await expect(page.locator("main.nature-main")).toBeFocused();
});

test("public navigation renders structured data without document exchange", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (/hydrat|Minified React error #(418|425)/i.test(message.text()))
      hydrationErrors.push(message.text());
  });
  await page.goto("/posts/?d_connection=offline&d_persona=admin");
  await page.waitForFunction(
    () =>
      !document.querySelector('astro-island[component-url*="PublicRouter"]')?.hasAttribute("ssr")
  );
  await expect(page.locator("html")).not.toHaveAttribute("data-web-demo-build", "true");
  await expect(page.getByText("Inspector", { exact: true })).toHaveCount(0);
  const documents: string[] = [];
  const reads: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documents.push(request.url());
    if (routeData(request.url())) reads.push(request.url());
  });
  await page.getByRole("link", { name: "Code Block Fixture", exact: true }).click();
  await expect(page.locator(".post-detail-body pre code")).toContainText("const tiny");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /Code Block Fixture/
  );
  await page.getByRole("link", { name: "项目", exact: true }).click();
  await expect(page.locator("main.nature-main h1")).toHaveText("项目");
  await page.goBack();
  await expect(page.locator(".post-detail-body pre code")).toContainText("const tiny");
  expect(reads).toHaveLength(3);
  expect(documents).toEqual([]);
  expect(hydrationErrors).toEqual([]);
});

test("a failed product data read stays at its destination and retries in place", async ({
  page,
}) => {
  await page.goto("/posts/code-block-fixture/");
  await page.waitForFunction(
    () =>
      !document.querySelector('astro-island[component-url*="PublicRouter"]')?.hasAttribute("ssr")
  );
  let fail = true;
  await page.route("**/*", async (route) => {
    if (fail && routeData(route.request().url()))
      await route.fulfill({ status: 503, body: "Unavailable" });
    else await route.continue();
  });
  await page.getByRole("link", { name: "项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/?$/);
  await expect(page.locator("main.nature-main [role=alert]")).toContainText("页面暂时无法加载");
  await expect(page.locator(".post-detail-body")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator("main.nature-main h1")).toHaveText("项目");
  await expect(page.locator("main.nature-main [role=alert]")).toHaveCount(0);
});

test("search query survives client navigation and a direct prerendered entry", async ({ page }) => {
  await page.goto("/posts/");
  await page.waitForFunction(
    () =>
      !document.querySelector('astro-island[component-url*="PublicRouter"]')?.hasAttribute("ssr")
  );
  const form = page.locator("header form");
  await form.locator("input").fill("fixture");
  await form.locator("input").press("Enter");
  await expect(page).toHaveURL(/\/search\/?\?q=fixture$/);
  await expect(page.getByRole("textbox", { name: "搜索关键词", exact: true })).toHaveValue(
    "fixture"
  );
  await page.reload();
  await expect(page.getByRole("textbox", { name: "搜索关键词", exact: true })).toHaveValue(
    "fixture"
  );
});

test("a search deep link preserves its query before the shared renderer hydrates", async ({
  page,
}) => {
  let resume = () => {
    /* Assigned synchronously by the Promise constructor. */
  };
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  await page.route(/PublicRouter\..*\.js$/, async (route) => {
    await released;
    await route.continue();
  });
  try {
    await page.goto("/search/?q=fixture", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-search-bootstrap]")).toBeVisible();
    await expect(page.locator("[data-search-bootstrap] [data-search-query-input]")).toHaveValue(
      "fixture"
    );
    await expect(page.locator("[data-search-island]")).toBeHidden();
  } finally {
    resume();
  }
  await expect(page.getByRole("textbox", { name: "搜索关键词", exact: true })).toHaveValue(
    "fixture"
  );
  await expect(page.locator("[data-search-bootstrap]")).toBeHidden();
});
