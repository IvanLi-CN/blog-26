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
  await expect(page.locator("main [role=alert]")).toHaveCount(0);
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
    expect(new URL(page.url()).pathname).toBe(new URL(path, "http://demo.invalid").pathname);
    await expect(page.locator("main .post-detail-body")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Inspector");
    expect(documents).toEqual([]);
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
  const requests: string[] = [];
  const documents: string[] = [];
  page.on("request", (r) => {
    if (routeApi(r.url())) requests.push(r.url());
    if (r.resourceType() === "document") documents.push(r.url());
  });
  await page.getByRole("link", { name: "Code Block Fixture", exact: true }).click();
  await expect(page.locator("main .post-detail-body")).toContainText("const tiny");
  await page.getByRole("link", { name: "项目", exact: true }).click();
  await expect(page.locator("main h1")).toHaveText("项目");
  await page.goBack();
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
