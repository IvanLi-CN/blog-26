import { expect, type Page } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { waitForAdminLiveMemoCard, waitForQuickMemoEditor } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

async function loginAsAdmin(page: Page) {
  await page.request.post("/api/dev/login", {
    data: { email: ADMIN_EMAIL },
  });
}

async function createMemo(
  page: Page,
  title: string,
  isPublic = true,
  content = `# ${title}\n\nMemo admin inline view test content.`
) {
  const response = await page.request.post("/api/public/memos", {
    data: { content, isPublic, tags: ["e2e-inline-view"] },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: string; slug: string; content: string };
}

function isMemoListRequest(request: { url: () => string; method: () => string }) {
  const url = new URL(request.url());
  return url.pathname === "/api/public/memos" && request.method() === "GET";
}

test.describe("Inline memo admin view", () => {
  test.describe.configure({ timeout: 150_000 });

  test.beforeEach(async ({ page }) => {
    await page.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/css", body: "" })
    );
  });

  test("uses ten-item server pages, load more, and refreshes from the first cursor", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const marker = `inline-page-${Date.now()}`;
    for (let index = 0; index < 12; index += 1) {
      await createMemo(page, `${marker}-${String(index).padStart(2, "0")}`, index % 2 === 0);
    }

    const requests: string[] = [];
    page.on("request", (request) => {
      if (isMemoListRequest(request)) requests.push(request.url());
    });
    await page.goto("/memos", { waitUntil: "domcontentloaded" });

    const cards = page.getByTestId("admin-live-memo-card");
    await expect(cards).toHaveCount(10);
    const initialIds = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-id"))
    );
    const initialRequest = requests
      .map((requestUrl) => new URL(requestUrl))
      .find((url) => !url.searchParams.has("cursor"));
    expect(initialRequest?.searchParams.get("limit")).toBe("10");
    expect(initialRequest?.searchParams.get("publicOnly")).toBe("false");
    expect(initialRequest?.searchParams.has("search")).toBe(false);
    await expect(page.getByRole("searchbox", { name: "搜索实时 Memo" })).toHaveCount(0);
    await expect(page.getByPlaceholder("搜索文章...")).toBeVisible();

    const loadMoreRequest = page.waitForRequest(
      (request) => isMemoListRequest(request) && new URL(request.url()).searchParams.has("cursor")
    );
    await page.getByRole("button", { name: "加载更多" }).click();
    await loadMoreRequest;
    await expect.poll(() => cards.count()).toBeGreaterThan(10);
    const ids = await cards.evaluateAll((elements) =>
      elements.map(
        (element) => element.getAttribute("data-id") ?? element.getAttribute("data-slug")
      )
    );
    expect(new Set(ids).size).toBe(ids.length);

    const refreshRequest = page.waitForRequest(
      (request) => isMemoListRequest(request) && !new URL(request.url()).searchParams.has("cursor")
    );
    await page.getByRole("button", { name: "刷新列表" }).click();
    await refreshRequest;
    await expect(cards).toHaveCount(10);
    const refreshedIds = await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-id"))
    );
    expect(refreshedIds).toEqual(initialIds);
  });

  test("edits in the current list, saves through PATCH, restores focus, and previews read-only", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const title = `inline-edit-${Date.now()}`;
    const memo = await createMemo(page, title);
    await page.goto("/memos", { waitUntil: "domcontentloaded" });

    const card = await waitForAdminLiveMemoCard(page, title);
    const editButton = card.getByTestId("admin-live-memo-edit");
    await editButton.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    const detailRequest = page.waitForRequest(
      (request) =>
        request.method() === "GET" &&
        new URL(request.url()).pathname.endsWith(`/api/public/memos/${memo.slug}`)
    );
    await editButton.click();
    await detailRequest;
    const modal = page.getByTestId("quick-memo-edit-modal");
    await expect(modal).toBeVisible();
    const editArea = modal.locator(".ProseMirror");
    await expect(editArea).toBeFocused();
    await modal.getByTestId("quick-memo-visibility-input").uncheck();

    const patchResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        new URL(response.url()).pathname.endsWith(`/api/public/memos/${memo.slug}`)
    );
    await modal.getByRole("button", { name: "保存更改" }).click();
    const savedResponse = await patchResponse;
    expect(savedResponse.ok()).toBeTruthy();
    await expect(modal).toHaveCount(0);
    await expect(card.getByTestId("private-indicator")).toBeVisible();
    await expect(editButton).toBeFocused();
    await expect(page).toHaveURL(/\/memos\/?$/);

    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThanOrEqual(1);
    const savedMemo = (await savedResponse.json()) as { content: string; isPublic: boolean };
    expect(savedMemo.content).toContain("Memo admin inline view test content.");
    expect(savedMemo.isPublic).toBe(false);

    await card.getByRole("link", { name: "预览" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/preview/memos/${memo.slug}$`));
    await expect(page.getByTestId("admin-preview-memo-body")).toBeVisible();
    await expect(page.getByTestId("public-memo-detail-controls")).toHaveCount(0);
  });

  test("saves private creation and shows the private-only message", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    await expect(page.getByRole("searchbox", { name: "搜索实时 Memo" })).toHaveCount(0);

    const title = `私有闪念 ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(`# ${title}`);
    const visibility = container.getByTestId("quick-memo-visibility-input");
    await visibility.uncheck();
    const save = container.getByRole("button", { name: "保存私有 Memo" });
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page.getByRole("status")).toHaveText("私有 Memo 已保存，仅管理员可见。");
    const card = await waitForAdminLiveMemoCard(page, title);
    await expect(card.getByTestId("private-indicator")).toBeVisible();
  });

  test("keeps failed public creation in place and succeeds on retry", async ({ page }) => {
    await loginAsAdmin(page);
    let postAttempts = 0;
    await page.route("**/api/public/memos", async (route) => {
      if (route.request().method() === "POST" && postAttempts++ === 0) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary memo save failure" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    const title = `公开重试闪念 ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(`# ${title}\n\n内容在失败后保留。`);
    const save = container.getByRole("button", { name: "公开发布 Memo" });

    await save.click();
    const saveError = container.getByRole("alert");
    await expect(saveError).toContainText("Temporary memo save failure");
    await expect(saveError).toContainText("请检查内容后重试");
    await expect(editor).toContainText(title);
    await expect(save).toBeEnabled();

    await save.click();
    await expect(page.getByRole("status")).toHaveText(
      "公开 Memo 已保存；公开时间线将在下次发布后更新。"
    );
    await expect(editor).not.toContainText(title);
    const card = await waitForAdminLiveMemoCard(page, title);
    await expect(card.getByTestId("public-indicator")).toBeVisible();
    expect(postAttempts).toBe(2);
  });

  test("keeps a new memo visible when the first refreshed page is briefly stale", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    let createdId: string | undefined;
    let stalePageReturned = false;

    await page.route("**/api/public/memos**", async (route) => {
      if (route.request().method() === "POST") {
        const response = await route.fetch();
        const created = (await response.json()) as { id: string; slug: string };
        createdId = created.id;
        await route.fulfill({ response, json: created });
        return;
      }

      if (isMemoListRequest(route.request()) && createdId && !stalePageReturned) {
        stalePageReturned = true;
        const response = await route.fetch();
        const payload = (await response.json()) as {
          memos?: Array<{ id: string }>;
          items?: Array<{ id: string }>;
        };
        if (payload.memos) payload.memos = payload.memos.filter((memo) => memo.id !== createdId);
        if (payload.items) payload.items = payload.items.filter((memo) => memo.id !== createdId);
        await route.fulfill({ response, json: payload });
        return;
      }

      await route.continue();
    });

    const title = `列表同步延迟闪念 ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(`# ${title}\n\n保存成功后保留在当前列表。`);
    await container.getByRole("button", { name: "公开发布 Memo" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "公开 Memo 已保存；公开时间线将在下次发布后更新。"
    );
    expect(stalePageReturned).toBe(true);
    await expect(await waitForAdminLiveMemoCard(page, title)).toBeVisible();
  });

  test("keeps the full editor and long card actions usable at desktop, 393px, and 320px", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const marker = `inline-responsive-${Date.now()}`;
    const title = `${marker} Responsive admin Memo cards keep a long readable title with existing content on narrow screens`;
    await createMemo(page, title, false);

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 393, height: 852 },
      { width: 320, height: 780 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/memos", { waitUntil: "domcontentloaded" });
      const { container } = await waitForQuickMemoEditor(page);
      const editorSurface = container.getByTestId("quick-memo-editor-surface");
      const editorBox = await editorSurface.boundingBox();
      expect(editorBox?.height).toBeGreaterThanOrEqual(120);
      const editorSurfaceOverflow = await container
        .getByTestId("quick-memo-editor-surface")
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(editorSurfaceOverflow).toBe(false);

      const editor = container.locator(".ProseMirror");
      await editor.click();
      await page.keyboard.insertText("键盘路径测试");
      await page.keyboard.press("Tab");
      const visibility = container.getByTestId("quick-memo-visibility-input");
      await expect(visibility).toBeFocused();
      expect(await visibility.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
      await page.keyboard.press("Tab");
      const submit = container.getByRole("button", { name: "公开发布 Memo" });
      await expect(submit).toBeFocused();
      expect(await submit.evaluate((element) => element.matches(":focus-visible"))).toBe(true);

      await expect(page.getByRole("searchbox", { name: "搜索实时 Memo" })).toHaveCount(0);
      const card = await waitForAdminLiveMemoCard(page, marker);
      const cardList = page.getByTestId("admin-live-memo-list").getByTestId("admin-live-memo-card");
      const firstCard = cardList.first();
      const contentBox = await card.getByTestId("admin-live-memo-content").boundingBox();
      const actionsBox = await card.getByTestId("admin-live-memo-actions").boundingBox();
      expect(contentBox).not.toBeNull();
      expect(actionsBox).not.toBeNull();
      if (!contentBox || !actionsBox)
        throw new Error("Memo card content or actions did not render");

      if (viewport.width < 640) {
        expect(actionsBox.y).toBeGreaterThanOrEqual(contentBox.y + contentBox.height);

        const stream = page
          .getByTestId("admin-live-memo-list")
          .locator(".nature-mobile-reading-stream");
        const streamBox = await stream.boundingBox();
        const rowBox = await firstCard.boundingBox();
        const rowMetrics = await firstCard.evaluate((element) => {
          const style = window.getComputedStyle(element);
          return {
            paddingLeft: Number.parseFloat(style.paddingLeft),
            borderRadius: Number.parseFloat(style.borderTopLeftRadius),
            borderBottomWidth: Number.parseFloat(style.borderBottomWidth),
            borderBottomStyle: style.borderBottomStyle,
          };
        });
        expect(streamBox?.x).toBeCloseTo(0, 0);
        expect(streamBox?.width).toBeCloseTo(viewport.width, 0);
        expect(rowBox?.x).toBeCloseTo(0, 0);
        expect(rowBox?.width).toBeCloseTo(viewport.width, 0);
        expect(rowMetrics.paddingLeft).toBe(viewport.width < 375 ? 12 : 16);
        expect(rowMetrics.borderRadius).toBe(0);
        expect(rowMetrics.borderBottomWidth).toBe(1);
        expect(rowMetrics.borderBottomStyle).toBe("solid");
      } else {
        expect(actionsBox.x).toBeGreaterThan(contentBox.x + contentBox.width - 1);
        expect(actionsBox.width).toBeGreaterThanOrEqual(143);
        const desktopCardMetrics = await card.evaluate((element) => {
          const style = window.getComputedStyle(element);
          return Number.parseFloat(style.borderTopLeftRadius);
        });
        expect(desktopCardMetrics).toBeGreaterThan(0);
      }

      for (const action of [
        card.getByRole("link", { name: "预览" }),
        card.getByTestId("admin-live-memo-edit"),
      ]) {
        const box = await action.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(viewport.width < 640 ? 44 : 36);
      }

      const visibilityBox = await container
        .getByTestId("quick-memo-visibility-input")
        .boundingBox();
      const visibilityLabelBox = await container
        .getByTestId("quick-memo-visibility-label")
        .boundingBox();
      const saveBox = await container.getByRole("button", { name: "公开发布 Memo" }).boundingBox();
      expect(visibilityBox?.height).toBeGreaterThanOrEqual(44);
      expect(visibilityLabelBox?.height).toBeLessThanOrEqual(20);
      expect(saveBox?.height).toBeGreaterThanOrEqual(viewport.width < 640 ? 44 : 36);
      expect(saveBox?.height).toBeLessThanOrEqual(52);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
    }
  });
});
