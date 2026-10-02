import { expect, type Page } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { waitForAdminLiveMemoCard, waitForQuickMemoEditor } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const END_OF_DOCUMENT_KEY = process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End";
const SELECT_ALL_KEY = process.platform === "darwin" ? "Meta+A" : "Control+A";

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

  test("auto-loads ten-item server pages and refreshes from the first cursor", async ({ page }) => {
    await loginAsAdmin(page);
    const marker = `inline-page-${Date.now()}`;
    const createdMemos: Array<{ id: string }> = [];
    for (let index = 0; index < 12; index += 1) {
      createdMemos.push(
        await createMemo(page, `${marker}-${String(index).padStart(2, "0")}`, index % 2 === 0)
      );
    }
    const firstPageResponse = await page.request.get("/api/public/memos?publicOnly=false&limit=10");
    expect(firstPageResponse.ok()).toBeTruthy();
    const firstPage = (await firstPageResponse.json()) as {
      memos: Array<{ id: string }>;
      nextCursor: string | null;
    };
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPageResponse = await page.request.get(
      `/api/public/memos?publicOnly=false&limit=10&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`
    );
    expect(secondPageResponse.ok()).toBeTruthy();
    const secondPage = (await secondPageResponse.json()) as { memos: Array<{ id: string }> };
    const expectedServiceOrder = [...firstPage.memos, ...secondPage.memos].map((memo) => memo.id);

    const requests: string[] = [];
    page.on("request", (request) => {
      if (isMemoListRequest(request)) requests.push(request.url());
    });
    await page.goto("/memos", { waitUntil: "domcontentloaded" });

    const memoList = page.getByTestId("admin-live-memo-list-items");
    const readMountedRows = () =>
      memoList.locator(":scope > .virtualized-memo-row").evaluateAll((rows) =>
        rows.map((row) => ({
          index: Number(row.getAttribute("data-index")),
          id: row.querySelector("[data-testid='admin-live-memo-card']")?.getAttribute("data-id"),
        }))
      );
    await expect(memoList).toHaveAttribute("data-loaded-memos", "10");
    await expect.poll(async () => (await readMountedRows()).length).toBeGreaterThan(0);
    const initialRows = await readMountedRows();
    for (const row of initialRows) expect(row.id).toBe(expectedServiceOrder[row.index]);
    const initialRequest = requests
      .map((requestUrl) => new URL(requestUrl))
      .find((url) => !url.searchParams.has("cursor"));
    if (initialRequest) {
      expect(initialRequest.searchParams.get("limit")).toBe("10");
      expect(initialRequest.searchParams.get("publicOnly")).toBe("false");
      expect(initialRequest.searchParams.has("search")).toBe(false);
    } else {
      expect(requests).toHaveLength(0);
    }
    await expect(page.getByRole("searchbox", { name: "搜索实时 Memo" })).toHaveCount(0);
    await expect(page.getByPlaceholder("搜索文章...")).toBeVisible();

    const loadMoreRequest = page.waitForRequest(
      (request) => isMemoListRequest(request) && new URL(request.url()).searchParams.has("cursor")
    );
    const sentinel = page.getByTestId("admin-memo-pagination-sentinel");
    await expect(sentinel).toBeAttached();
    await expect(page.locator(".memo-pagination-fallback")).toHaveCount(0);
    const accessibleFallback = page.getByTestId("memo-pagination-accessible");
    await expect(accessibleFallback).toBeAttached();
    const fallbackBounds = await accessibleFallback.boundingBox();
    expect(fallbackBounds?.width).toBeLessThan(2);
    expect(fallbackBounds?.height).toBeLessThan(2);
    await sentinel.scrollIntoViewIfNeeded();
    await loadMoreRequest;
    await expect(memoList).toHaveAttribute(
      "data-loaded-memos",
      String(expectedServiceOrder.length)
    );
    const appendedRows = await readMountedRows();
    for (const row of appendedRows) expect(row.id).toBe(expectedServiceOrder[row.index]);
    expect(new Set(appendedRows.map((row) => row.index)).size).toBe(appendedRows.length);

    await expect(page.getByTestId("admin-memo-pagination-sentinel-newer")).toHaveCount(0);
    await expect(memoList).toHaveAttribute(
      "data-loaded-memos",
      String(expectedServiceOrder.length)
    );
    const rowsAfterNewerLoad = await readMountedRows();
    for (const row of rowsAfterNewerLoad) expect(row.id).toBe(expectedServiceOrder[row.index]);

    const refreshRequest = page.waitForRequest(
      (request) => isMemoListRequest(request) && !new URL(request.url()).searchParams.has("cursor")
    );
    await page.getByRole("button", { name: "刷新列表" }).click();
    await refreshRequest;
    await expect(memoList).toHaveAttribute("data-loaded-memos", "10");
    const refreshedRows = await readMountedRows();
    for (const row of refreshedRows) expect(row.id).toBe(expectedServiceOrder[row.index]);
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
    await expect(editButton).toBeVisible();
    await editButton.scrollIntoViewIfNeeded();
    await page.evaluate(
      () => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    );
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
    await editArea.click();
    await page.keyboard.press(END_OF_DOCUMENT_KEY);
    await page.keyboard.insertText("\n\n编辑后摘要仍应显示在原卡片上。");
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

    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 2_000 })
      .toBe(scrollBefore);
    const savedMemo = (await savedResponse.json()) as { content: string; isPublic: boolean };
    expect(savedMemo.content).toContain("Memo admin inline view test content.");
    expect(savedMemo.content).toContain("编辑后摘要仍应显示在原卡片上。");
    expect(savedMemo.isPublic).toBe(false);
    await expect(card).toContainText("编辑后摘要仍应显示在原卡片上。");

    await card.getByRole("link", { name: "预览" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/preview/memos/${memo.slug}$`));
    await expect(page.getByTestId("admin-preview-memo-body")).toBeVisible();
    await expect(page.getByTestId("public-memo-detail-controls")).toHaveCount(0);
  });

  test("does not let a list response started before PATCH overwrite the saved card", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const title = `inline-patch-race-${Date.now()}`;
    const memo = await createMemo(page, title);
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const card = await waitForAdminLiveMemoCard(page, title);
    let shouldHoldListResponse = false;
    let resolveListCaptured: (() => void) | undefined;
    let releaseListResponse: (() => void) | undefined;
    const listCaptured = new Promise<void>((resolve) => {
      resolveListCaptured = resolve;
    });
    const listRelease = new Promise<void>((resolve) => {
      releaseListResponse = resolve;
    });

    await page.route("**/api/public/memos**", async (route) => {
      if (isMemoListRequest(route.request()) && shouldHoldListResponse) {
        shouldHoldListResponse = false;
        const response = await route.fetch();
        const payload = await response.json();
        resolveListCaptured?.();
        await listRelease;
        await route.fulfill({ response, json: payload });
        return;
      }
      await route.continue();
    });

    shouldHoldListResponse = true;
    const staleListRequest = page.waitForRequest((request) => isMemoListRequest(request));
    await page.getByRole("button", { name: "刷新列表" }).click();
    await staleListRequest;
    await listCaptured;
    const staleListResponse = page.waitForResponse(
      (response) => isMemoListRequest(response.request()),
      { timeout: 45_000 }
    );

    const editButton = card.getByTestId("admin-live-memo-edit");
    await editButton.click();
    const modal = page.getByTestId("quick-memo-edit-modal");
    const editArea = modal.locator(".ProseMirror");
    await expect(editArea).toBeFocused();
    await editArea.click();
    await page.keyboard.press(END_OF_DOCUMENT_KEY);
    await page.keyboard.insertText("\n\nPATCH race must retain this fresh edit marker.");
    await expect(editArea).toContainText("PATCH race must retain this fresh edit marker.");

    const patchResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        new URL(response.url()).pathname.endsWith(`/api/public/memos/${memo.slug}`)
    );
    await modal.getByRole("button", { name: "保存更改" }).click();
    const savedResponse = await patchResponse;
    expect(savedResponse.ok()).toBeTruthy();
    const submittedMemo = savedResponse.request().postDataJSON() as { content: string };
    expect(submittedMemo.content).toContain("PATCH race must retain this fresh edit marker.");
    const savedMemo = (await savedResponse.json()) as { content: string };
    expect(savedMemo.content).toContain("PATCH race must retain this fresh edit marker.");
    await expect(card).toContainText("PATCH race must retain this fresh edit marker.");
    releaseListResponse?.();
    expect((await staleListResponse).ok()).toBeTruthy();
    await expect(page.getByText("正在更新列表…")).toHaveCount(0);
    await expect(card).toContainText("PATCH race must retain this fresh edit marker.");
  });

  test("saves shorter live content and discards delayed updates after reset", async ({ page }) => {
    await page.addInitScript(() => {
      const testWindow = window as Window & {
        __holdMemoMarkdownUpdate?: boolean;
        __heldMemoMarkdownUpdates?: Array<() => void>;
      };
      const originalSetTimeout = window.setTimeout.bind(window);
      testWindow.__holdMemoMarkdownUpdate = false;
      testWindow.__heldMemoMarkdownUpdates = [];
      window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        if (testWindow.__holdMemoMarkdownUpdate && timeout === 0 && typeof handler === "function") {
          testWindow.__heldMemoMarkdownUpdates?.push(() => handler(...args));
          return 0;
        }
        return Reflect.apply(originalSetTimeout, window, [handler, timeout, ...args]) as number;
      }) as typeof window.setTimeout;
    });

    await loginAsAdmin(page);
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    const previousContent = "This previous Memo is longer than the replacement.";
    const replacementContent = "Short replacement.";
    const characterCount = container.getByText(/^\d+ 字符$/);
    const readCharacterCount = async () =>
      Number((await characterCount.textContent())?.match(/^\d+/)?.[0] ?? 0);

    await editor.click();
    await page.keyboard.insertText(previousContent);
    await expect(editor).toContainText(previousContent);
    await expect.poll(readCharacterCount).toBeGreaterThan(replacementContent.length);

    await page.evaluate(() => {
      const testWindow = window as Window & {
        __holdMemoMarkdownUpdate?: boolean;
      };
      testWindow.__holdMemoMarkdownUpdate = true;
    });
    await editor.click();
    await page.keyboard.press(SELECT_ALL_KEY);
    await page.keyboard.insertText(replacementContent);
    await expect(editor).toContainText(replacementContent);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const testWindow = window as Window & {
            __heldMemoMarkdownUpdates?: Array<() => void>;
          };
          return testWindow.__heldMemoMarkdownUpdates?.length ?? 0;
        })
      )
      .toBeGreaterThan(0);

    await expect.poll(readCharacterCount).toBeGreaterThan(replacementContent.length);

    const createResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/public/memos"
    );
    await editor.evaluate((node) => {
      const testWindow = window as Window & {
        __holdMemoMarkdownUpdate?: boolean;
      };
      const target = node as HTMLElement;
      const form = target.closest("form");
      if (!(form instanceof HTMLFormElement)) {
        throw new Error("Quick Memo editor form was not found");
      }
      form.requestSubmit();
      testWindow.__holdMemoMarkdownUpdate = false;
    });

    const savedResponse = await createResponse;
    expect(savedResponse.ok()).toBeTruthy();
    const submittedMemo = savedResponse.request().postDataJSON() as { content: string };
    expect(submittedMemo.content).toContain(replacementContent);
    expect(submittedMemo.content).not.toContain(previousContent);
    await expect(page.getByRole("status")).toHaveText(
      "公开 Memo 已保存；公开时间线将在下次发布后更新。"
    );
    await expect(editor).toHaveText("");
    await expect(page.getByText("0 字符", { exact: true })).toBeVisible();

    const replayedCallbackCount = await page.evaluate(() => {
      const testWindow = window as Window & {
        __heldMemoMarkdownUpdates?: Array<() => void>;
      };
      const callbacks = testWindow.__heldMemoMarkdownUpdates ?? [];
      for (const callback of callbacks) {
        callback();
      }
      testWindow.__heldMemoMarkdownUpdates = [];
      return callbacks.length;
    });
    expect(replayedCallbackCount).toBeGreaterThan(0);

    await expect(editor).toHaveText("");
    await expect(page.getByText("0 字符", { exact: true })).toBeVisible();
    await expect(container.getByRole("button", { name: "公开发布 Memo" })).toBeDisabled();
  });

  test("saves private creation and shows the private-only message", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    await expect(page.getByRole("searchbox", { name: "搜索实时 Memo" })).toHaveCount(0);

    const title = `私有闪念 ${Date.now()}`;
    await editor.click();
    await page.keyboard.insertText(`# ${title}\n\n私有 Memo 摘要应在创建后保留。`);
    const visibility = container.getByTestId("quick-memo-visibility-input");
    await visibility.uncheck();
    const save = container.getByRole("button", { name: "保存私有 Memo" });
    await expect(save).toBeEnabled();
    await save.click();

    await expect(page.getByRole("status")).toHaveText("私有 Memo 已保存，仅管理员可见。");
    const card = await waitForAdminLiveMemoCard(page, title);
    await expect(card.getByTestId("private-indicator")).toBeVisible();
    await expect(card).toContainText("私有 Memo 摘要应在创建后保留。");
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

  test("keeps created memos across stale refreshes and carries the displaced row into pagination", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const marker = `inline-stale-page-${Date.now()}`;
    const seededMemos = [];
    for (let index = 0; index < 12; index += 1) {
      seededMemos.push(await createMemo(page, `${marker}-${index}`));
    }
    const stalePageResponse = await page.request.get("/api/public/memos?publicOnly=false&limit=10");
    expect(stalePageResponse.ok()).toBeTruthy();
    const stalePage = await stalePageResponse.json();
    const seededIds = new Set(seededMemos.map((memo) => memo.id));

    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    let createdId: string | undefined;
    let stalePageResponses = 0;
    let resolveFirstStalePage: (() => void) | undefined;
    let resolveSecondStalePage: (() => void) | undefined;
    const firstStalePageCompleted = new Promise<void>((resolve) => {
      resolveFirstStalePage = resolve;
    });
    const secondStalePageCompleted = new Promise<void>((resolve) => {
      resolveSecondStalePage = resolve;
    });

    await page.route("**/api/public/memos**", async (route) => {
      if (route.request().method() === "POST") {
        const response = await route.fetch();
        const created = (await response.json()) as { id: string; slug: string };
        createdId = created.id;
        await route.fulfill({ response, json: created });
        return;
      }

      if (isMemoListRequest(route.request()) && createdId && stalePageResponses < 2) {
        stalePageResponses += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(stalePage),
        });
        if (stalePageResponses === 1) resolveFirstStalePage?.();
        else resolveSecondStalePage?.();
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
    await firstStalePageCompleted;
    await expect(page.getByText("正在更新列表…")).toHaveCount(0);
    const createdCard = await waitForAdminLiveMemoCard(page, title);
    await expect(createdCard).toBeVisible();

    await page.getByRole("button", { name: "刷新列表" }).click();
    await secondStalePageCompleted;
    await expect(page.getByText("正在更新列表…")).toHaveCount(0);
    await expect(await waitForAdminLiveMemoCard(page, title)).toBeVisible();

    const loadMoreResponse = page.waitForResponse(
      (response) =>
        isMemoListRequest(response.request()) && new URL(response.url()).searchParams.has("cursor")
    );
    await page.getByTestId("admin-memo-pagination-sentinel").scrollIntoViewIfNeeded();
    await expect((await loadMoreResponse).ok()).toBeTruthy();
    await expect.poll(() => page.getByTestId("admin-live-memo-card").count()).toBeGreaterThan(10);
    await expect(page.getByText("正在更新列表…")).toHaveCount(0);
    const loadedIds = await page
      .getByTestId("admin-live-memo-card")
      .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-id") ?? ""));
    expect([...seededIds].every((id) => loadedIds.includes(id))).toBe(true);
    expect(new Set(loadedIds).size).toBe(loadedIds.length);
    expect(createdId).toBeTruthy();
  });

  test("keeps the successful create response when refresh returns the same ID with stale content", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    let created: Record<string, unknown> | undefined;
    let stalePageResponses = 0;
    let resolveFirstStalePage: (() => void) | undefined;
    let resolveSecondStalePage: (() => void) | undefined;
    const firstStalePageCompleted = new Promise<void>((resolve) => {
      resolveFirstStalePage = resolve;
    });
    const secondStalePageCompleted = new Promise<void>((resolve) => {
      resolveSecondStalePage = resolve;
    });
    const staleTitle = `旧列表响应 ${Date.now()}`;
    const sharedSummary = "shared-prefix-".repeat(12);
    const staleTail = "旧正文尾部";

    await page.route("**/api/public/memos**", async (route) => {
      if (route.request().method() === "POST") {
        const response = await route.fetch();
        created = (await response.json()) as Record<string, unknown>;
        await route.fulfill({ response, json: created });
        return;
      }

      if (isMemoListRequest(route.request()) && created && stalePageResponses < 2) {
        const responseNumber = ++stalePageResponses;
        const response = await route.fetch();
        const payload = (await response.json()) as {
          memos?: Array<Record<string, unknown>>;
          items?: Array<Record<string, unknown>>;
        };
        if (payload.memos) {
          const staleMemo = { ...created };
          if (responseNumber === 1) {
            staleMemo.content = `# ${title}\n\n${sharedSummary}${staleTail}`;
          } else {
            staleMemo.title = staleTitle;
          }
          const index = payload.memos.findIndex((memo) => memo.id === created?.id);
          if (index >= 0) payload.memos[index] = staleMemo;
          else payload.memos.unshift(staleMemo);
        }
        if (payload.items) {
          payload.items = payload.items.map((memo) =>
            memo.id === created?.id
              ? responseNumber === 1
                ? { ...created, content: `# ${title}\n\n${sharedSummary}${staleTail}` }
                : { ...created, title: staleTitle }
              : memo
          );
        }
        await route.fulfill({ response, json: payload });
        if (responseNumber === 1) resolveFirstStalePage?.();
        else resolveSecondStalePage?.();
        return;
      }

      await route.continue();
    });

    const title = `列表旧内容闪念 ${Date.now()}`;
    const freshTail = "成功响应中的新正文尾部";
    await editor.click();
    await page.keyboard.insertText(`# ${title}\n\n${sharedSummary}${freshTail}`);
    await container.getByRole("button", { name: "公开发布 Memo" }).click();

    await expect(page.getByRole("status")).toHaveText(
      "公开 Memo 已保存；公开时间线将在下次发布后更新。"
    );
    await firstStalePageCompleted;
    await expect(page.getByText("正在更新列表…")).toHaveCount(0);
    await page.getByRole("button", { name: "刷新列表" }).click();
    await secondStalePageCompleted;
    await expect(page.getByText("正在更新列表…")).toHaveCount(0);
    const card = await waitForAdminLiveMemoCard(page, title);
    await expect(card.getByRole("heading", { name: title })).toBeVisible();
    await expect(card).not.toContainText(staleTitle);
  });

  test("follows the system theme and disables header transitions for reduced motion", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("theme", "system"));
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    await waitForQuickMemoEditor(page);

    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-ui-preference", "system");
    await expect(root).toHaveAttribute("data-ui-theme", "dark");
    await expect(page.locator("[data-public-header]")).toHaveCSS("transition-property", "none");

    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await expect(root).toHaveAttribute("data-ui-preference", "system");
    await expect(root).toHaveAttribute("data-ui-theme", "light");
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
      if (viewport.width < 640) {
        const header = page.locator("[data-public-header]");
        await expect(header).toHaveAttribute("data-public-header-offset", /\d+/);
        if (viewport.width === 320) {
          const collapseScroll = await page.evaluate(() => {
            const headerHeight =
              document.querySelector("[data-public-header]")?.getBoundingClientRect().height ?? 0;
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight - 1;
            return Math.max(1, Math.min(Math.ceil(headerHeight * 1.2), maxScroll));
          });
          await page.evaluate((scrollY) => window.scrollTo(0, scrollY), collapseScroll);
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(collapseScroll);
        } else {
          const collapseScroll = await page.evaluate(() => {
            const headerHeight =
              document.querySelector("[data-public-header]")?.getBoundingClientRect().height ?? 0;
            const maxScroll = document.documentElement.scrollHeight - window.innerHeight - 1;
            return Math.max(0, Math.min(Math.ceil(headerHeight * 1.2), maxScroll));
          });
          await page.evaluate((scrollY) => window.scrollTo(0, scrollY), collapseScroll);
          await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(collapseScroll);
        }
        await expect(header).toHaveAttribute("data-public-header-state", "collapsed");
        const positions = await page.evaluate(() => ({
          headerBottom: document.querySelector("[data-public-header]")?.getBoundingClientRect()
            .bottom,
          headingTop: document.querySelector("#admin-live-memos-heading")?.getBoundingClientRect()
            .top,
        }));
        expect(positions.headerBottom).toBeLessThanOrEqual(0);
        expect(positions.headingTop).toBeGreaterThanOrEqual(0);
      }
      const editorSurface = container.getByTestId("quick-memo-editor-surface");
      const editorBox = await editorSurface.boundingBox();
      expect(editorBox?.height).toBeGreaterThanOrEqual(120);
      const editorSurfaceOverflow = await container
        .getByTestId("quick-memo-editor-surface")
        .evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(editorSurfaceOverflow).toBe(false);
      const editorSurfaceVerticalOverflow = await editorSurface.evaluate(
        (element) => element.scrollHeight > element.clientHeight
      );
      expect(editorSurfaceVerticalOverflow).toBe(false);

      const editor = container.locator(".ProseMirror");
      await editor.click();
      await page.keyboard.insertText("键盘路径测试");
      const visibility = container.getByTestId("quick-memo-visibility-input");
      const submit = container.getByRole("button", { name: "公开发布 Memo" });
      await page.keyboard.press("Tab");
      await expect(visibility).toBeFocused();
      expect(await visibility.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
      await page.keyboard.press("Shift+Tab");
      await expect(editor).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(visibility).toBeFocused();
      await page.keyboard.press("Tab");
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
        expect(actionsBox.width).toBeGreaterThanOrEqual(88);
        const desktopCardMetrics = await card
          .locator(".nature-timeline-card")
          .evaluate((element) => {
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
