import { expect, test } from "@playwright/test";

const privateSlug = "console-demo-private-release-notes";
const clippingSlug = "console-demo-clipping-durable-workflows";

test.describe("Console Memo Web Demo", () => {
  test.describe.configure({ timeout: 60_000 });

  test("covers the admin list eye action, same-origin detail, preview boundary, and back position", async ({
    page,
  }) => {
    await page.goto("/memos/?d_persona=admin&d_delay=normal", { waitUntil: "domcontentloaded" });
    const list = page.getByTestId("admin-live-memo-list-items");
    await expect(list).toBeVisible();
    const card = page.getByTestId("admin-live-memo-card").filter({
      hasText: "发布窗口后的内部复盘",
    });
    const detailLink = card.getByRole("link", { name: "查看详情" });
    await expect(detailLink).toHaveAttribute("href", `/memos/${privateSlug}/`);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 240)
      )
      .toBe(true);
    await page.evaluate(() => window.scrollTo({ top: 240, left: 0, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(240);
    const listScrollY = await page.evaluate(() => Math.round(window.scrollY));
    await detailLink.click();
    await expect(page).toHaveURL(new RegExp(`/memos/${privateSlug}/?$`));
    await expect(page.getByTestId("public-memo-detail-controls")).toBeVisible();
    await expect(page.getByTestId("public-memo-detail-body")).toContainText(
      "管理员可以在详情首屏看到尚未进入公开快照的正文"
    );

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/memos\/?(?:\?.*)?$/);
    await expect(page.getByTestId("admin-live-memo-list-items")).toBeVisible();
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(listScrollY);

    await page
      .getByTestId("admin-live-memo-card")
      .filter({ hasText: "发布窗口后的内部复盘" })
      .getByRole("link", { name: "查看详情" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/memos/${privateSlug}/?$`));
    await page.getByRole("link", { name: "打开专用预览" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/preview/memos/${privateSlug}$`));
    await expect(page.getByRole("heading", { name: "Memo 预览" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "发布窗口后的内部复盘" })).toBeVisible();
    await expect(page.getByTestId("admin-preview-memo-body")).toContainText(
      "管理员可以在详情首屏看到尚未进入公开快照的正文"
    );
    await expect(page.getByRole("link", { name: "打开详情" })).toHaveAttribute(
      "href",
      `/memos/${privateSlug}`
    );
  });

  test("keeps private SSR content for admin and returns a guest 404 without disclosure", async ({
    page,
    request: pageRequest,
  }) => {
    const adminResponse = await pageRequest.get(`/memos/${privateSlug}/?d_persona=admin`);
    expect(adminResponse.status()).toBe(200);
    const adminBody = await adminResponse.text();
    expect(adminBody).toContain("管理员可以在详情首屏看到尚未进入公开快照的正文");

    await page.goto(`/memos/${privateSlug}/?d_persona=guest`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle("页面未找到 - Ivan's Blog");
    await expect(page.locator("body")).not.toContainText(
      "管理员可以在详情首屏看到尚未进入公开快照的正文"
    );
  });

  test("keeps private and draft rows out of the guest list", async ({ page }) => {
    await page.goto("/memos/?d_persona=guest&d_delay=normal", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("本周公开笔记", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Pi Durable：可恢复的 Agent 工作流", { exact: true })
    ).toBeVisible();
    await expect(page.getByText("发布窗口后的内部复盘", { exact: true })).toHaveCount(0);
    await expect(page.getByText("待确认的阅读清单", { exact: true })).toHaveCount(0);
  });

  test("renders clipping source, translation, and admin discussion from the official adapter", async ({
    page,
  }) => {
    await page.goto(`/memos/${clippingSlug}/?d_persona=admin&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.locator('[data-testid="clipping-detail"][data-clipping-surface="admin"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="clipping-article-source"]:visible').last()
    ).toContainText("Durable article workflows");
    await expect(page.locator('[data-testid="clipping-chat"]:visible').last()).toBeVisible();
    await page.getByRole("button", { name: "简体中文译文" }).click();
    await expect(
      page.locator('[data-testid="clipping-article-translation"]:visible').last()
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="clipping-article-translation"]:visible').last()
    ).toContainText("持久文章工作流");
  });

  test("saves in place and records the in-memory Web Demo mutation", async ({ page }) => {
    await page.goto(`/memos/${privateSlug}/?d_persona=admin&d_delay=normal`, {
      waitUntil: "domcontentloaded",
    });
    const detailUrl = new RegExp(`/memos/${privateSlug}/?(?:\\?.*)?$`);
    const editButton = page.getByRole("button", { name: "编辑 Memo" });
    await expect(editButton).toBeEnabled({ timeout: 15_000 });
    await editButton.click();
    const modal = page.getByTestId("quick-memo-edit-modal");
    await expect(modal).toBeVisible();
    await modal
      .locator(".ProseMirror")
      .fill(
        "# Console Web Demo 保存验收\n\n保存后仍停留在当前详情路由，更新仅存在于本次演示内存。"
      );
    await modal.getByRole("button", { name: "保存更改" }).click();
    await expect(modal).toHaveCount(0);
    await expect(page).toHaveURL(detailUrl);
    await expect(page.getByTestId("public-memo-detail-body")).toContainText(
      "保存后仍停留在当前详情路由"
    );

    await page.getByTestId("web-demo-inspector-trigger").click();
    await expect(page.locator(".web-demo-inspector-mutations")).toContainText("保存 Memo 详情");
  });
});
