import { expect, type Page, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

async function createMemo(page: Page, title: string, isPublic: boolean) {
  const response = await page.request.post("/api/public/memos", {
    data: { content: `# ${title}\n\nGuest visibility test.`, isPublic, tags: ["e2e-guest"] },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { slug: string };
}

/**
 * Memos - 游客访问测试（无 Remote-Email 头）
 */

test.describe("Memos 游客访问", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/css", body: "" })
    );
  });

  test("未登录用户访问应仅看到公开内容", async ({ page }) => {
    await page.request.post("/api/dev/login", { data: { email: ADMIN_EMAIL } });
    const publicMemo = await createMemo(page, `访客可见 ${Date.now()}`, true);
    const privateMemo = await createMemo(page, `管理员私有 ${Date.now()}`, false);
    await page.context().clearCookies();
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Memos" })).toBeVisible();
    await expect(page.getByText("记录想法、灵感和日常思考的快速笔记")).toBeVisible();
    await expect(page.getByRole("region", { name: "快速发布区域" })).not.toBeVisible();
    await expect(page.getByTestId("admin-live-memo-list")).toHaveCount(0);
    await expect(
      page.getByTestId("memos-timeline").or(page.getByText("暂无公开 Memos", { exact: true }))
    ).toBeVisible();

    const response = await page.request.get("/api/public/memos?publicOnly=false&limit=50");
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as {
      memos: Array<{ slug: string; isPublic: boolean }>;
    };
    const publicSlugs = payload.memos.map((memo) => memo.slug);
    expect(publicSlugs).toContain(publicMemo.slug);
    expect(publicSlugs).not.toContain(privateMemo.slug);
    expect(payload.memos.every((memo) => memo.isPublic)).toBe(true);
  });

  test("console 游客从数据库自动续载公开 Memo，且不返回私有项", async ({ page }) => {
    await page.request.post("/api/dev/login", { data: { email: ADMIN_EMAIL } });
    const marker = `guest-infinite-${Date.now()}`;
    const createdSlugs: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      createdSlugs.push((await createMemo(page, `${marker}-${index}`, true)).slug);
    }
    const privateTitle = `${marker}-private`;
    await createMemo(page, privateTitle, false);
    await page.context().clearCookies();

    const firstResponse = await page.request.get("/api/public/memos?publicOnly=true&limit=10");
    expect(firstResponse.ok()).toBeTruthy();
    const firstPage = (await firstResponse.json()) as {
      memos: Array<{ slug: string }>;
      nextCursor: string | null;
    };
    expect(firstPage.nextCursor).toBeTruthy();
    const secondResponse = await page.request.get(
      `/api/public/memos?publicOnly=true&limit=10&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`
    );
    expect(secondResponse.ok()).toBeTruthy();
    const secondPage = (await secondResponse.json()) as { memos: Array<{ slug: string }> };
    const expectedSlugs = [...firstPage.memos, ...secondPage.memos].map((memo) => memo.slug);

    const response = await page.goto("/memos", { waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    const initialHtml = await response?.text();
    expect(initialHtml).toContain(marker);
    expect(initialHtml).not.toContain(privateTitle);

    const timeline = page.getByTestId("memos-timeline");
    await expect(timeline).not.toHaveAttribute("data-public-memos-static-list", "true");
    const cards = timeline.getByTestId("memo-card");
    await expect(cards).toHaveCount(10);
    const initialSlugs = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-slug"))
    );
    expect(initialSlugs).toEqual(expectedSlugs.slice(0, 10));

    const appendRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        request.method() === "GET" &&
        url.pathname === "/api/public/memos" &&
        url.searchParams.get("publicOnly") === "true" &&
        url.searchParams.has("cursor")
      );
    });
    await page.getByTestId("memo-pagination-sentinel").scrollIntoViewIfNeeded();
    await appendRequest;
    await expect(cards).toHaveCount(expectedSlugs.length);
    await expect(timeline).toHaveAttribute("data-loaded-memos", String(expectedSlugs.length));
    const loadedSlugs = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-slug"))
    );
    expect(loadedSlugs).toEqual(expectedSlugs);
    await page.waitForTimeout(1800);
    await expect(timeline).toHaveAttribute("data-loaded-memos", String(expectedSlugs.length));
    await expect(page.getByText(privateTitle, { exact: false })).toHaveCount(0);
  });

  test("滚到底部后只续载一页并将新 Memo 接在列表后面", async ({ page }) => {
    await page.request.post("/api/dev/login", { data: { email: ADMIN_EMAIL } });
    const marker = `guest-scroll-append-${Date.now()}`;
    for (let index = 0; index < 35; index += 1) {
      await createMemo(page, `${marker}-${index}`, true);
    }
    await page.context().clearCookies();

    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const timeline = page.getByTestId("memos-timeline");
    await expect(timeline).toHaveAttribute("data-loaded-memos", "10");
    const initialCount = Number(await timeline.getAttribute("data-loaded-memos"));

    const firstAppend = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        request.method() === "GET" &&
        url.pathname === "/api/public/memos" &&
        url.searchParams.get("publicOnly") === "true" &&
        url.searchParams.has("cursor")
      );
    });
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 9000);
    await firstAppend;
    await expect(timeline).toHaveAttribute("data-loaded-memos", String(initialCount + 10));
    await page.waitForTimeout(1800);

    expect(Number(await timeline.getAttribute("data-loaded-memos"))).toBe(initialCount + 10);
    const scrollPosition = await page.evaluate(() => ({
      y: window.scrollY,
      maxY: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(scrollPosition.maxY - scrollPosition.y).toBeGreaterThan(100);
  });

  test("权限检查加载状态", async ({ page }) => {
    await page.route("/api/trpc/auth.me*", async (route) => {
      await new Promise((r) => setTimeout(r, 500));
      await route.continue();
    });
    await page.goto("/memos");
    // /memos 已实现首屏 SSR，权限检查延迟不应阻塞主内容渲染
    await expect(page.getByRole("heading", { name: "Memos" })).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByTestId("memos-timeline").or(page.getByText("暂无公开 Memos", { exact: true }))
    ).toBeVisible({ timeout: 10000 });
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Memos" })).toBeVisible();
  });
});
