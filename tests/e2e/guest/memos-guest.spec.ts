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
