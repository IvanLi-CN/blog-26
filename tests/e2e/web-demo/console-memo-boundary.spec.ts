import { expect, type Page, test } from "@playwright/test";

const privateSlug = "console-demo-private-release-notes";
const draftSlug = "console-demo-draft-reading-list";
const clippingSlug = "console-demo-clipping-durable-workflows";
const isMobileViewport = process.env.WEB_DEMO_VIEWPORT === "mobile";

async function waitForPublicRouterHydration(page: Page) {
  await page.waitForFunction(() => {
    const island = document.querySelector<HTMLElement>(
      'astro-island[component-url*="PublicRouter"]'
    );
    return island instanceof HTMLElement && !island.hasAttribute("ssr");
  });
}

async function gotoHydratedPublicRoute(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForPublicRouterHydration(page);
}

async function goBackToHydratedPublicRoute(page: Page) {
  await page.goBack({ waitUntil: "domcontentloaded" });
  await waitForPublicRouterHydration(page);
}

test.describe("Console Memo Web Demo", () => {
  test.describe.configure({ timeout: 60_000 });

  test("covers the admin list eye action, same-origin detail, preview boundary, and back position", async ({
    page,
  }) => {
    await gotoHydratedPublicRoute(page, "/memos/?d_persona=admin&d_delay=normal");
    const list = page.getByTestId("admin-live-memo-list-items");
    await expect(list).toBeVisible();
    const card = page.getByTestId("admin-live-memo-card").filter({
      hasText: "发布窗口后的内部复盘",
    });
    const detailLink = card.getByRole("link", { name: "查看详情" });
    await expect(detailLink).toHaveAttribute("href", `/memos/${privateSlug}/`);
    let previousDocumentHeight = 0;
    let stableHeightSamples = 0;
    await expect
      .poll(async () => {
        const { height, viewportHeight } = await page.evaluate(() => ({
          height: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
        }));
        if (height === previousDocumentHeight) stableHeightSamples += 1;
        else {
          previousDocumentHeight = height;
          stableHeightSamples = 0;
        }
        return height >= viewportHeight && stableHeightSamples >= 2;
      })
      .toBe(true);
    const listScrollTarget = await page.evaluate(() => {
      const maxScrollY = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
      return maxScrollY >= 1 ? Math.min(240, maxScrollY) : null;
    });
    if (listScrollTarget !== null) {
      await page.evaluate((top) => {
        document.scrollingElement?.scrollTo({ top, left: 0, behavior: "instant" });
      }, listScrollTarget);
      await expect
        .poll(() => page.evaluate(() => Math.round(document.scrollingElement?.scrollTop ?? 0)))
        .toBe(listScrollTarget);
    }
    const listScrollY = await page.evaluate(() => Math.round(window.scrollY));
    await detailLink.click();
    await expect(page).toHaveURL(new RegExp(`/memos/${privateSlug}/?$`));
    await expect(page.getByTestId("public-memo-detail-controls")).toBeVisible();
    const detailCard = page.locator('[data-testid="public-memo-detail-card"]:visible');
    await expect(detailCard.getByTestId("public-memo-detail-status")).toBeVisible();
    await expect(page.getByTestId("public-memo-detail-body")).toContainText(
      "管理员可以在详情首屏看到尚未进入公开快照的正文"
    );

    await goBackToHydratedPublicRoute(page);
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
    browser,
    request: pageRequest,
  }) => {
    const adminResponse = await pageRequest.get(`/memos/${privateSlug}/?d_persona=admin`);
    expect(adminResponse.status()).toBe(200);
    const adminBody = await adminResponse.text();
    expect(adminBody).toContain("管理员可以在详情首屏看到尚未进入公开快照的正文");

    const context = await browser.newContext({ javaScriptEnabled: false });
    const noScriptPage = await context.newPage();
    const noScriptResponse = await noScriptPage.goto(`/memos/${privateSlug}/?d_persona=guest`, {
      waitUntil: "domcontentloaded",
    });
    expect(noScriptResponse?.status()).toBe(404);
    await expect(noScriptPage).toHaveTitle("页面未找到 - Ivan's Blog");
    await expect(noScriptPage.locator("body")).not.toContainText(
      "管理员可以在详情首屏看到尚未进入公开快照的正文"
    );
    await context.close();

    await page.goto(`/memos/${privateSlug}/?d_persona=guest`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle("页面未找到 - Ivan's Blog");
    await expect(page.locator("body")).not.toContainText(
      "管理员可以在详情首屏看到尚未进入公开快照的正文"
    );
  });

  test("keeps draft detail unavailable to a guest before hydration", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    const response = await page.goto(`/memos/${draftSlug}/?d_persona=guest`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle("页面未找到 - Ivan's Blog");
    await expect(page.locator("body")).not.toContainText("待确认的阅读清单");
    await context.close();
  });

  test("rechecks the detail boundary when the Web Demo persona changes", async ({ page }) => {
    await gotoHydratedPublicRoute(page, `/memos/${privateSlug}/?d_persona=admin&d_delay=normal`);
    await expect(page.getByTestId("public-memo-detail-controls")).toBeVisible();
    await expect(page.getByTestId("public-memo-detail-body")).toContainText(
      "管理员可以在详情首屏看到尚未进入公开快照的正文"
    );

    await page.getByTestId("web-demo-inspector-trigger").click();
    await page.getByTestId("web-demo-persona-guest").click();
    await expect(page.getByTestId("public-memo-detail-controls")).toHaveCount(0);
    await expect(page.locator('[data-testid="public-memo-detail-card"]:visible')).toHaveCount(0);

    await page.getByTestId("web-demo-persona-admin").click();
    await expect(page.getByTestId("public-memo-detail-controls")).toBeVisible();
    await expect(page.locator('[data-testid="public-memo-detail-body"]:visible')).toContainText(
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
    await gotoHydratedPublicRoute(page, `/memos/${clippingSlug}/?d_persona=admin&d_delay=normal`);
    const clipping = page
      .locator('[data-testid="clipping-detail"][data-clipping-surface="public"]:visible')
      .last();
    await expect(clipping).toBeVisible();
    const panel = clipping.locator(".clipping-memo-card:visible").last();
    await expect
      .poll(async () =>
        panel.evaluate((element) => {
          const style = getComputedStyle(element);
          return `${style.backgroundImage !== "none"}:${style.borderTopStyle}:${style.borderTopWidth}`;
        })
      )
      .toBe(isMobileViewport ? "false:none:0px" : "true:solid:1px");
    const panelStyle = await panel.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        borderTopStyle: style.borderTopStyle,
        borderTopWidth: style.borderTopWidth,
      };
    });
    if (isMobileViewport) {
      expect(panelStyle.backgroundImage).toBe("none");
      expect(panelStyle.borderTopStyle).toBe("none");
      expect(panelStyle.borderTopWidth).toBe("0px");
    } else {
      expect(panelStyle.backgroundImage).not.toBe("none");
      expect(panelStyle.borderTopStyle).toBe("solid");
      expect(panelStyle.borderTopWidth).toBe("1px");
    }
    await expect(
      page.locator('[data-testid="clipping-article-source"]:visible').last()
    ).toContainText("Durable article workflows");
    if (isMobileViewport) await page.getByTestId("clipping-open-chat").last().click();
    await expect(page.locator('[data-testid="clipping-chat"]:visible').last()).toBeVisible();
    if (isMobileViewport) await page.getByRole("button", { name: "关闭" }).click();
    await page.getByRole("button", { name: "简体中文译文" }).click();
    await expect(
      page.locator('[data-testid="clipping-article-translation"]:visible').last()
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="clipping-article-translation"]:visible').last()
    ).toContainText("持久文章工作流");
  });

  test("renders guest clipping materials without exposing discussion controls", async ({
    page,
  }) => {
    await gotoHydratedPublicRoute(page, `/memos/${clippingSlug}/?d_persona=guest&d_delay=normal`);
    const clipping = page
      .locator('[data-testid="clipping-detail"][data-clipping-surface="public"]:visible')
      .last();
    await expect(clipping).toBeVisible();
    await expect(
      page.locator('[data-testid="clipping-article-source"]:visible').last()
    ).toContainText("Durable article workflows");
    await page.getByRole("button", { name: "简体中文译文" }).click();
    await expect(
      page.locator('[data-testid="clipping-article-translation"]:visible').last()
    ).toContainText("持久文章工作流");
    await expect(page.getByTestId("clipping-open-chat")).toHaveCount(0);
    await expect(page.locator('[data-testid="clipping-chat"]:visible')).toHaveCount(0);
  });

  test("keeps clipping materials and discussion inside the Admin preview Web Demo", async ({
    page,
  }) => {
    await page.goto(`/admin/preview/memos/${clippingSlug}?d_persona=admin&d_scene=clipping-ready`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: "Memo 预览" })).toBeVisible();
    await expect(
      page.locator('[data-testid="clipping-detail"][data-clipping-surface="admin"]')
    ).toBeVisible();
    await expect(page.locator('[data-testid="clipping-article-source"]:visible')).toContainText(
      "Durable article workflows"
    );
    if (isMobileViewport) await page.getByTestId("clipping-open-chat").click();
    await expect(page.locator('[data-testid="clipping-chat"]:visible')).toBeVisible();
    if (isMobileViewport) await page.getByRole("button", { name: "关闭" }).click();
    await page.getByRole("button", { name: "简体中文译文" }).click();
    await expect(
      page.locator('[data-testid="clipping-article-translation"]:visible')
    ).toContainText("持久文章工作流");
  });

  test("saves in place and records the in-memory Web Demo mutation", async ({ page }) => {
    await gotoHydratedPublicRoute(page, "/memos/?d_persona=admin&d_delay=normal");
    await page
      .getByTestId("admin-live-memo-card")
      .filter({ hasText: "发布窗口后的内部复盘" })
      .getByRole("link", { name: "查看详情" })
      .click();
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

    await goBackToHydratedPublicRoute(page);
    await expect(page).toHaveURL(/\/memos\/?(?:\?.*)?$/);
    await expect(page.getByTestId("admin-live-memo-list-items")).toBeVisible();
    await expect(
      page.getByTestId("admin-live-memo-card").filter({ hasText: "Console Web Demo 保存验收" })
    ).toBeVisible();

    await page.getByTestId("web-demo-inspector-trigger").click();
    await expect(page.locator(".web-demo-inspector-mutations")).toContainText("保存 Memo 详情");
  });

  test("opens the dedicated preview with the saved Console Web Demo content", async ({ page }) => {
    await gotoHydratedPublicRoute(page, "/memos/?d_persona=admin&d_delay=normal");
    await page
      .getByTestId("admin-live-memo-card")
      .filter({ hasText: "发布窗口后的内部复盘" })
      .getByRole("link", { name: "查看详情" })
      .click();
    const editButton = page.getByRole("button", { name: "编辑 Memo" });
    await expect(editButton).toBeEnabled({ timeout: 15_000 });
    await editButton.click();
    const modal = page.getByTestId("quick-memo-edit-modal");
    await expect(modal).toBeVisible();
    await modal
      .locator(".ProseMirror")
      .fill("# 预览同步验收\n\n专用预览必须读取当前 Console Web Demo 保存的正文。");
    await modal.getByRole("button", { name: "保存更改" }).click();
    await expect(modal).toHaveCount(0);
    await page.getByRole("link", { name: "打开专用预览" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/preview/memos/${privateSlug}$`));
    await expect(page.getByTestId("admin-preview-memo-body")).toContainText(
      "专用预览必须读取当前 Console Web Demo 保存的正文"
    );
  });

  test("keeps a deleted Web Demo Memo out of the list after client navigation", async ({
    page,
  }) => {
    await gotoHydratedPublicRoute(page, "/memos/?d_persona=admin&d_delay=normal");
    await page
      .locator(`[data-testid="admin-live-memo-card"][data-slug="${privateSlug}"]`)
      .getByRole("link", { name: "查看详情" })
      .click();
    await expect(page.getByTestId("admin-live-memo-delete")).toBeEnabled();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("admin-live-memo-delete").click();
    await expect(page).toHaveURL(/\/memos\/?(?:\?.*)?$/);
    await expect(page.getByTestId("admin-live-memo-list-items")).toBeVisible();
    await expect(page.getByText("发布窗口后的内部复盘", { exact: true })).toHaveCount(0);
    await page.getByTestId("web-demo-inspector-trigger").click();
    await expect(page.locator(".web-demo-inspector-mutations")).toContainText("删除 Memo");
  });

  test("does not restore a deleted detail from its SSR seed on reload", async ({ page }) => {
    await gotoHydratedPublicRoute(page, "/memos/?d_persona=admin&d_delay=normal");
    await page
      .locator(`[data-testid="admin-live-memo-card"][data-slug="${privateSlug}"]`)
      .getByRole("link", { name: "查看详情" })
      .click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId("admin-live-memo-delete").click();
    await expect(page).toHaveURL(/\/memos\/?(?:\?.*)?$/);

    await gotoHydratedPublicRoute(page, `/memos/${privateSlug}/?d_persona=admin&d_delay=normal`);
    await expect(page.locator('[data-testid="public-memo-detail-card"]:visible')).toHaveCount(0);
    await expect(page.locator('[data-testid="public-memo-detail-body"]:visible')).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      "管理员可以在详情首屏看到尚未进入公开快照的正文"
    );
  });
});
