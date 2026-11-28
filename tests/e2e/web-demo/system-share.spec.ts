import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    recordSystemShareSuccessToast: () => void;
  }
}

async function clearPendingShare(page: import("@playwright/test").Page) {
  await page.goto("/share?d_persona=admin&d_share=text", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("system-share-page")).toBeVisible({ timeout: 15_000 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("ivan-console-system-share", 2);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("pending")) {
            request.result.createObjectStore("pending");
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("pending", "readwrite");
          transaction.objectStore("pending").clear();
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      })
  );
}

async function expectSharePage(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("system-share-page")).toBeVisible({ timeout: 15_000 });
}

async function readPendingIdentity(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open("ivan-console-system-share", 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction("pending", "readonly")
            .objectStore("pending")
            .get("current");
          read.onsuccess = () => {
            database.close();
            resolve(read.result?.submissionId ?? null);
          };
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
        };
      })
  );
}

async function readPendingText(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open("ivan-console-system-share", 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction("pending", "readonly")
            .objectStore("pending")
            .get("current");
          read.onsuccess = () => {
            database.close();
            resolve(typeof read.result?.text === "string" ? read.result.text : null);
          };
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
        };
      })
  );
}

type ShareLayoutSnapshot = {
  viewport: { width: number; height: number };
  document: { clientWidth: number; scrollWidth: number; scrollHeight: number; scrollTop: number };
  main: { left: number; right: number; top: number; bottom: number };
  form: { left: number; right: number; top: number; bottom: number };
  editor: { left: number; right: number; top: number; bottom: number; height: number };
  editorMeta: { left: number; right: number; top: number; bottom: number; height: number };
  submit: { left: number; right: number; top: number; bottom: number; height: number };
  visibility: { top: number; bottom: number; height: number };
  bodyOverflow: { overflowX: string; overflowY: string; overscrollBehaviorY: string };
  editorBody: { overflowY: string; overscrollBehaviorY: string };
};

async function readShareLayout(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing layout element: ${selector}`);
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        height: box.height,
      };
    };
    const scroll = document.scrollingElement ?? document.documentElement;
    const editorBody = document.querySelector<HTMLElement>(
      '[data-testid="system-share-memo-editor-body"]'
    );
    if (!editorBody) throw new Error("Missing share editor body");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: scroll.scrollHeight,
        scrollTop: scroll.scrollTop,
      },
      main: rect('[data-testid="system-share-page"]'),
      form: rect('[data-testid="system-share-memo-editor"]'),
      editor: rect('[data-testid="system-share-memo-editor-surface"]'),
      editorMeta: rect('[data-testid="system-share-memo-editor-meta"]'),
      submit: rect('[data-testid="system-share-submit"]'),
      visibility: rect(".quick-memo-edit-visibility"),
      bodyOverflow: {
        overflowX: getComputedStyle(document.body).overflowX,
        overflowY: getComputedStyle(document.body).overflowY,
        overscrollBehaviorY: getComputedStyle(document.body).overscrollBehaviorY,
      },
      editorBody: {
        overflowY: getComputedStyle(editorBody).overflowY,
        overscrollBehaviorY: getComputedStyle(editorBody).overscrollBehaviorY,
      },
    } satisfies ShareLayoutSnapshot;
  });
}

async function synthesizeTouchScroll(
  page: import("@playwright/test").Page,
  selector: string,
  distance: number
) {
  const point = await page.evaluate(
    ({ targetSelector, distance: gestureDistance }) => {
      const target = document.querySelector<HTMLElement>(targetSelector);
      const scroll = document.scrollingElement ?? document.documentElement;
      if (!target) throw new Error(`Missing touch target: ${targetSelector}`);
      const maxScrollTop = Math.max(0, scroll.scrollHeight - window.innerHeight);
      const gestureHeadroom = Math.abs(gestureDistance);
      target.scrollIntoView({ block: "center", inline: "nearest" });
      const centeredBox = target.getBoundingClientRect();
      const targetDocumentTop = centeredBox.top + scroll.scrollTop;
      const minScrollTop = Math.min(gestureHeadroom, maxScrollTop);
      const maxScrollTopWithHeadroom = Math.max(minScrollTop, maxScrollTop - gestureHeadroom);
      const preferredScrollTop = targetDocumentTop - window.innerHeight / 2;
      scroll.scrollTop = Math.max(
        minScrollTop,
        Math.min(maxScrollTopWithHeadroom, preferredScrollTop)
      );
      const box = target.getBoundingClientRect();
      return {
        x: Math.max(2, Math.min(window.innerWidth - 2, box.left + box.width / 2)),
        y: Math.max(2, Math.min(window.innerHeight - 2, box.top + Math.min(24, box.height / 2))),
        before: scroll.scrollTop,
        maxScrollTop,
      };
    },
    { targetSelector: selector, distance }
  );
  expect(point.maxScrollTop).toBeGreaterThan(0);

  const before = await page.evaluate(() => {
    const scroll = document.scrollingElement ?? document.documentElement;
    return scroll.scrollTop;
  });
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  try {
    await client.send("Input.synthesizeScrollGesture", {
      x: point.x,
      y: point.y,
      yDistance: distance,
      speed: 1000,
      gestureSourceType: "default",
    });
  } finally {
    await client.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await client.detach();
  }
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => {
    const scroll = document.scrollingElement ?? document.documentElement;
    return scroll.scrollTop;
  });
  return { ...point, before, after };
}

test.describe("Console system share Web Demo", () => {
  test.describe.configure({ timeout: 60_000 });

  test("shows a structured reading state while the pending share loads", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=admin&d_share=url&d_delay=slow", {
      waitUntil: "domcontentloaded",
    });
    const loading = page.getByTestId("system-share-loading");
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(loading.getByRole("heading", { name: "发布 Memo" })).toBeVisible();
    await expect(loading.getByRole("status")).toContainText("正在读取待处理分享…");
    await expect(loading.locator(".nature-spinner")).toHaveCount(1);
    // The placeholder mirrors the populated form: the editor surface and its
    // attachment column exist already, so the page does not reshuffle on load.
    await expect(loading.getByRole("heading", { name: "编辑 Memo" })).toBeVisible();
    await expect(loading.locator(".system-share-reading-editor")).toBeVisible();
    await expect(loading.locator(".system-share-memo-attachments")).toBeVisible();
    await expect(loading.locator(".system-share-reading-footer")).toBeVisible();
    await expect(loading.locator(".system-share-reading-body")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    await expectSharePage(page);
    // The populated page reuses the same two structural regions.
    await expect(page.getByRole("heading", { name: "编辑 Memo" })).toBeVisible();
    await expect(page.locator(".system-share-memo-attachments")).toBeVisible();
  });

  test("keeps the page layout fixed while the publish notice appears", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=admin&d_share=text&d_delay=slow", {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(page);
    const before = await page.getByTestId("system-share-memo-editor").boundingBox();
    const headerBefore = await page.locator(".system-share-page-header").boundingBox();
    if (!before || !headerBefore) throw new Error("Missing confirmation layout");
    const paddingBefore = await page
      .getByTestId("system-share-page")
      .evaluate((element) => getComputedStyle(element).paddingTop);
    const heightBefore = await page.evaluate(
      () => (document.scrollingElement ?? document.documentElement).scrollHeight
    );
    await page.getByTestId("system-share-submit").click();
    await expect(page.getByTestId("system-share-toast-progress")).toBeVisible();
    const during = await page.getByTestId("system-share-memo-editor").boundingBox();
    const headerDuring = await page.locator(".system-share-page-header").boundingBox();
    if (!during || !headerDuring) throw new Error("Missing layout after the notice appeared");
    // A layout-neutral notice cannot move the page; the panel's own 2px hover
    // lift is unrelated to the notice.
    expect(Math.abs(during.y - before.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(headerDuring.y - headerBefore.y)).toBeLessThanOrEqual(3);
    const heightDuring = await page.evaluate(
      () => (document.scrollingElement ?? document.documentElement).scrollHeight
    );
    expect(heightDuring).toBe(heightBefore);
    const paddingDuring = await page
      .getByTestId("system-share-page")
      .evaluate((element) => getComputedStyle(element).paddingTop);
    expect(paddingDuring).toBe(paddingBefore);
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/, { timeout: 15_000 });
  });

  test("keeps the publish notice fixed on screen while the page scrolls", async ({ page }) => {
    // A short viewport guarantees real scroll range; the form fits 393x852.
    await page.setViewportSize({ width: 393, height: 600 });
    await clearPendingShare(page);
    await page.goto(
      `/share?d_persona=admin&d_share=text&d_scene=system-share-response-loss&d_delay=slow`,
      { waitUntil: "domcontentloaded" }
    );
    await expectSharePage(page);
    await page.getByTestId("system-share-submit").click();
    const notice = page.getByTestId("system-share-toast-error");
    await expect(notice).toBeVisible();
    const before = await page.locator(".system-share-toast").boundingBox();
    if (!before) throw new Error("Missing notice box");
    const beforeScroll = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll);
    const after = await page.locator(".system-share-toast").boundingBox();
    if (!after) throw new Error("Missing notice box after scrolling");
    // Scrolling must not move the notice relative to the user.
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(".system-share-toast")).toHaveCount(1);
  });

  test("docks the publish notice under the page header at every width", async ({ page }) => {
    for (const size of [
      { width: 1440, height: 1000 },
      { width: 768, height: 1024 },
      { width: 393, height: 852 },
      { width: 360, height: 740 },
    ]) {
      await page.setViewportSize(size);
      await clearPendingShare(page);
      await page.goto("/share?d_persona=admin&d_share=url&d_delay=slow", {
        waitUntil: "domcontentloaded",
      });
      await expectSharePage(page);
      await page.getByTestId("system-share-submit").click();
      await expect(page.getByTestId("system-share-toast-progress")).toBeVisible();
      // Measure the settled box; the zoom transition scales the card briefly.
      await expect
        .poll(
          () =>
            page
              .locator(".system-share-toast")
              .first()
              .evaluate((element) => getComputedStyle(element).transform),
          { timeout: 5_000 }
        )
        .toBe("none");
      const geometry = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);
          if (!element) throw new Error(`Missing element: ${selector}`);
          const box = element.getBoundingClientRect();
          return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
        };
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          notice: rect(".system-share-toast"),
          header: rect(".system-share-page-header"),
          submit: rect('[data-testid="system-share-submit"]'),
        };
      });
      expect(geometry.notice.top).toBeGreaterThanOrEqual(geometry.header.bottom);
      expect(geometry.notice.top).toBeLessThanOrEqual(geometry.header.bottom + 20);
      expect(geometry.notice.bottom).toBeLessThan(geometry.viewport.height / 2);
      const center = (geometry.notice.left + geometry.notice.right) / 2;
      expect(Math.abs(center - geometry.viewport.width / 2)).toBeLessThanOrEqual(2);
      expect(geometry.notice.bottom).toBeLessThan(geometry.submit.top);
      await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/, { timeout: 15_000 });
    }
  });

  test("persists edits through refresh and publishes into the returned detail", async ({
    page,
  }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=admin&d_share=file&d_delay=slow", {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(page);
    const originalShare = page.getByTestId("system-share-original");
    await expect(originalShare).toBeVisible();
    await expect(page.getByTestId("system-share-memo-editor")).toBeVisible();
    await expect(page.getByTestId("system-share-memo-editor").locator(".ProseMirror")).toHaveCount(
      1
    );
    await expect(page.getByLabel("标题")).toHaveCount(0);
    await expect(page.getByLabel("网址（可选）")).toHaveCount(0);
    await expect(page.getByLabel("添加 Memo 标签")).toHaveCount(0);
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText(
      "把这段文字整理成一条可以继续编辑的闪念。"
    );
    await originalShare.getByTestId("system-share-original-toggle").click();
    await expect(originalShare).toHaveAttribute("open", "");
    await expect(originalShare).toContainText("分享附件.txt");
    await expect(originalShare).toContainText("把这段文字整理成一条可以继续编辑的闪念。");
    const editor = page.getByTestId("system-share-memo-editor").locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("刷新后仍然保留在唯一 Memo 编辑框内的内容。");
    await expect
      .poll(() => readPendingText(page), { timeout: 5_000 })
      .toContain("刷新后仍然保留在唯一 Memo 编辑框内的内容。");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectSharePage(page);
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText(
      "刷新后仍然保留在唯一 Memo 编辑框内的内容。"
    );
    await page.getByTestId("system-share-original-toggle").click();
    await expect(page.getByTestId("system-share-original")).toContainText("会议记录附件");
    await page.getByTestId("system-share-submit").click();
    await expect(page.getByTestId("system-share-toast-progress")).toBeVisible();
    await expect(editor).toHaveAttribute("contenteditable", "false");
    // The notice is delivered across the navigation instead of holding the
    // confirmation page open.
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/, { timeout: 5_000 });
    await expect(page.getByTestId("system-share-toast-success")).toBeVisible();
    await expect(page.getByTestId("system-share-toast-success")).toContainText("发布成功");
  });

  test("keeps a clipping URL in the single Memo content field", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=admin&d_share=url", {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(page);
    await expect(page.getByTestId("system-share-classification")).toHaveCount(0);
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText(
      "https://example.com/reading-note"
    );
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText(
      "分享时附带的剪藏备注。"
    );
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText("#剪藏");
  });

  test("clears the pending slot before navigating to the created Memo", async ({ page }) => {
    await clearPendingShare(page);
    const submissionId = randomUUID();
    await page.goto(`/share?d_persona=admin&d_share=url&d_submission=${submissionId}`, {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(page);
    const editor = page.getByTestId("system-share-memo-editor").locator(".ProseMirror");
    await expect(editor).toContainText("#剪藏");
    expect(await readPendingIdentity(page)).toBe(submissionId);
    // The finished slot is cleared before leaving, so a reload of the detail
    // page cannot reopen the published share.
    await page.getByTestId("system-share-submit").click();
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/);
    expect(await readPendingIdentity(page)).toBeNull();
  });

  test("navigates immediately and carries the notice to the detail page", async ({ page }) => {
    await clearPendingShare(page);
    let successToastShownAt = 0;
    await page.exposeFunction("recordSystemShareSuccessToast", () => {
      successToastShownAt = performance.now();
    });
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[data-testid="system-share-toast-success"]')) return;
        if (!window.location.pathname.startsWith("/memos/")) return;
        void window.recordSystemShareSuccessToast();
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    const submissionId = randomUUID();
    await page.goto(
      `/share?d_persona=admin&d_share=text&d_submission=${submissionId}&d_delay=slow`,
      {
        waitUntil: "domcontentloaded",
      }
    );
    await expectSharePage(page);
    await page.getByTestId("system-share-submit").click();
    await page.waitForURL(/\/memos\/console-demo-created-\d+$/, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    await expect(page.getByTestId("system-share-toast-success")).toBeVisible();
    expect(successToastShownAt).toBeGreaterThan(0);
    // Measure the settled box: the zoom transition briefly scales the card.
    await expect
      .poll(
        () =>
          page
            .locator(".system-share-toast")
            .first()
            .evaluate((element) => getComputedStyle(element).transform),
        { timeout: 5_000 }
      )
      .toBe("none");
    // The destination anchors the notice below the public site header.
    const destination = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const box = element.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      };
      return {
        notice: rect(".system-share-toast"),
        header: rect(".nature-site-header[data-public-header]"),
      };
    });
    expect(destination.notice).not.toBeNull();
    expect(destination.header).not.toBeNull();
    if (!destination.notice || !destination.header) {
      throw new Error("Missing destination notice or public header");
    }
    expect(destination.notice.top).toBeGreaterThanOrEqual(destination.header.bottom);
    expect(destination.notice.top).toBeLessThanOrEqual(destination.header.bottom + 24);
    // The notice dismisses itself instead of blocking the page.
    await expect(page.getByTestId("system-share-toast-success")).toHaveCount(0, { timeout: 6_000 });
  });

  test("keeps a guest share local and preserves the return path for login", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=guest&d_share=text", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("system-share-auth-required")).toBeVisible();
    await expect(page.getByTestId("system-share-auth-required").getByRole("link")).toHaveAttribute(
      "href",
      "/admin/?returnTo=%2Fshare"
    );
    expect(await readPendingIdentity(page)).toBe("00000000-0000-4000-8000-000000000005");
  });

  test("persists an edited clipping URL and keeps a memo edit after refresh", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=admin&d_share=url", {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(page);
    const editor = page.getByTestId("system-share-memo-editor").locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("https://example.com/changed\n\n换成新的剪藏备注");
    await expect
      .poll(() => readPendingText(page), { timeout: 5_000 })
      .toContain("https://example.com/changed");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectSharePage(page);
    await expect(editor).toContainText("https://example.com/changed");
    await expect(editor).toContainText("换成新的剪藏备注");
    await expect(editor).not.toContainText("https://example.com/reading-note");

    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("已经改成普通闪念");
    await expect
      .poll(() => readPendingText(page), { timeout: 5_000 })
      .toContain("已经改成普通闪念");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectSharePage(page);
    await expect(editor).toContainText("已经改成普通闪念");
    await expect(editor).not.toContainText("#剪藏");
  });

  test("keeps a failed submission in place and retries from the global toast", async ({ page }) => {
    await clearPendingShare(page);
    const submissionId = randomUUID();
    await page.goto(
      `/share?d_persona=admin&d_share=error&d_submission=${submissionId}&d_scene=system-share-error&d_delay=slow`,
      {
        waitUntil: "domcontentloaded",
      }
    );
    await expectSharePage(page);
    const editor = page.getByTestId("system-share-memo-editor").locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("重试后仍然保留的编辑内容");
    await expect
      .poll(() => readPendingText(page), { timeout: 5_000 })
      .toContain("重试后仍然保留的编辑内容");
    await page.getByTestId("system-share-submit").click();
    await expect(page.getByTestId("system-share-toast-error")).toBeVisible();
    await expect(page.getByTestId("system-share-toast-error")).toHaveCount(1);
    await page
      .getByTestId("system-share-toast-error")
      .getByRole("button", { name: "重试" })
      .click();
    await expect(page.getByTestId("system-share-toast-progress")).toBeVisible();
    await expect(page.getByTestId("system-share-toast-progress")).toBeFocused();
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/);
    await expect(page.locator("body")).toContainText("重试后仍然保留的编辑内容");
  });

  test("recovers a lost publish response through the same submission identity", async ({
    page,
  }) => {
    await clearPendingShare(page);
    const submissionId = randomUUID();
    await page.goto(
      `/share?d_persona=admin&d_share=text&d_submission=${submissionId}&d_scene=system-share-response-loss&d_delay=slow`,
      { waitUntil: "domcontentloaded" }
    );
    await expectSharePage(page);
    await page.getByTestId("system-share-submit").click();
    await expect(page.getByTestId("system-share-toast-error")).toContainText("响应丢失");
    await page
      .getByTestId("system-share-toast-error")
      .getByRole("button", { name: "重试" })
      .click();
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/);
    await expect(page.getByTestId("system-share-toast-success")).toContainText("恢复此前发布", {
      timeout: 15_000,
    });
  });

  test("does not publish a stale confirmation after another share replaces the slot", async ({
    page,
  }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=admin&d_share=text", { waitUntil: "domcontentloaded" });
    await expectSharePage(page);

    const replacement = await page.context().newPage();
    await clearPendingShare(replacement);
    await replacement.goto("/share?d_persona=admin&d_share=file", {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(replacement);

    await page.getByTestId("system-share-submit").click();
    await expect(page.getByTestId("system-share-toast-error")).toContainText(
      "已被新的系统分享替换"
    );
    await expect(page).toHaveURL(/\/share\?/);
    await replacement.close();
  });

  test("keeps compact mobile publish controls in the first viewport", {
    tag: "@own-viewport",
  }, async ({ page }) => {
    for (const size of [
      { width: 360, height: 740 },
      { width: 393, height: 852 },
    ]) {
      await page.setViewportSize(size);
      await clearPendingShare(page);
      await page.goto(`/share?d_persona=admin&d_share=url&d_submission=${randomUUID()}`, {
        waitUntil: "domcontentloaded",
      });
      await expectSharePage(page);
      await expect(page.locator("body")).toHaveClass(/system-share-body/);
      await expect(page).toHaveTitle("发布 Memo");
      await expect(page.getByTestId("system-share-submit")).toHaveText("发布 Memo");
      await expect(page.getByTestId("system-share-home")).toHaveAttribute("href", "/");
      await expect(page.getByRole("link", { name: "返回首页" })).toHaveCount(1);

      const compact = await readShareLayout(page);
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
        "content",
        /interactive-widget=resizes-content/
      );
      const pageHeader = await page.locator(".system-share-page-header").boundingBox();
      const pageTitle = await page.getByRole("heading", { name: "发布 Memo" }).boundingBox();
      expect(pageHeader).not.toBeNull();
      expect(pageTitle).not.toBeNull();
      if (!pageHeader || !pageTitle) throw new Error("Missing compact share page header");
      expect(pageHeader.height).toBeGreaterThanOrEqual(pageTitle.height);
      expect(pageHeader.height).toBeLessThanOrEqual(52);
      expect(compact.editor.height).toBeGreaterThanOrEqual(192);
      expect(compact.editor.height).toBeGreaterThan(192);
      expect(Math.abs(compact.editor.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(compact.editor.right - size.width)).toBeLessThanOrEqual(1);
      expect(compact.editorMeta.top - compact.editor.bottom).toBeGreaterThanOrEqual(3);
      expect(compact.editorMeta.top - compact.editor.bottom).toBeLessThanOrEqual(5);
      expect(compact.submit.bottom).toBeLessThanOrEqual(size.height + 1);
      expect(compact.visibility.bottom).toBeLessThanOrEqual(size.height + 1);
      expect(Math.abs(compact.submit.top - compact.visibility.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(compact.submit.bottom - compact.visibility.bottom)).toBeLessThanOrEqual(1);

      await page.setViewportSize({ width: size.width, height: size.height + 100 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectSharePage(page);
      const taller = await readShareLayout(page);
      expect(taller.editor.height).toBeGreaterThan(compact.editor.height + 40);
    }
  });

  test("exposes a public home escape link", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto(`/share?d_persona=admin&d_share=text&d_submission=${randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(page);
    const homeHref = await page.getByTestId("system-share-home").getAttribute("href");
    expect(homeHref).toBe("/");
    await page.goto(new URL(homeHref ?? "/", page.url()).toString(), {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveTitle("Ivan's Blog");
  });

  test("wraps publish controls only below the compact mobile width", {
    tag: "@own-viewport",
  }, async ({ page }) => {
    for (const [width, shouldWrap] of [
      [320, true],
      [360, false],
      [375, false],
      [393, false],
    ] as const) {
      await page.setViewportSize({ width, height: 852 });
      await clearPendingShare(page);
      await page.goto(`/share?d_persona=admin&d_share=url&d_submission=${randomUUID()}`, {
        waitUntil: "domcontentloaded",
      });
      await expectSharePage(page);
      const layout = await readShareLayout(page);
      const sameRow = Math.abs(layout.submit.top - layout.visibility.top) <= 1;
      expect(sameRow).toBe(!shouldWrap);
      expect(layout.submit.height).toBeGreaterThanOrEqual(44);
      expect(layout.visibility.height).toBeGreaterThanOrEqual(44);
      expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth + 1);
    }
  });

  test("uses the mobile edge-to-edge surface without horizontal overflow", {
    tag: "@own-viewport",
  }, async ({ page }) => {
    for (const width of [320, 360, 375, 393, 639]) {
      await page.setViewportSize({ width, height: 852 });
      await clearPendingShare(page);
      await page.goto(`/share?d_persona=admin&d_share=text&d_submission=${randomUUID()}`, {
        waitUntil: "domcontentloaded",
      });
      await expectSharePage(page);
      const layout = await readShareLayout(page);
      const expectedInset = width < 375 ? 12 : 16;
      const attachmentTitle = await page
        .getByTestId("system-share-attachments-title")
        .boundingBox();
      const attachmentPicker = await page.locator(".system-share-file-picker").boundingBox();
      expect(attachmentTitle).not.toBeNull();
      expect(attachmentPicker).not.toBeNull();
      if (!attachmentTitle || !attachmentPicker) {
        throw new Error("Missing attachment title or picker layout");
      }
      expect(attachmentPicker.x).toBeGreaterThanOrEqual(
        attachmentTitle.x + attachmentTitle.width - 1
      );
      expect(attachmentPicker.x + attachmentPicker.width).toBeLessThanOrEqual(
        width - expectedInset + 1
      );
      expect(attachmentPicker.height).toBeGreaterThanOrEqual(44);
      expect(attachmentPicker.width).toBeLessThan(140);
      expect(Math.abs(layout.main.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.main.right - width)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.form.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.form.right - width)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.editor.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(layout.editor.right - width)).toBeLessThanOrEqual(1);
      expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth + 1);
      const editorLabelLeft = await page
        .getByTestId("system-share-memo-editor-content")
        .locator("span")
        .first()
        .evaluate((element) => element.getBoundingClientRect().left);
      expect(editorLabelLeft).toBeGreaterThanOrEqual(expectedInset - 1);
    }

    for (const size of [
      { width: 768, height: 1024 },
      { width: 1440, height: 1000 },
    ]) {
      await page.setViewportSize(size);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectSharePage(page);
      const layout = await readShareLayout(page);
      expect(layout.document.scrollWidth).toBeLessThanOrEqual(layout.document.clientWidth + 1);
      expect(layout.form.right - layout.form.left).toBeLessThan(size.width);
      expect(layout.submit.right).toBeGreaterThan(layout.form.left);
      expect(layout.submit.left).toBeLessThan(layout.form.right);
    }
  });

  test("scrolls the document from attachment controls with a native touch gesture", {
    tag: "@own-viewport",
  }, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 568 });
    await clearPendingShare(page);
    await page.goto(`/share?d_persona=admin&d_share=file&d_submission=${randomUUID()}`, {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(page);

    const editor = page.getByTestId("system-share-memo-editor").locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText(
      Array.from({ length: 96 }, (_, index) => `滚动回归正文第 ${index + 1} 行`).join("\n")
    );
    await expect.poll(() => readPendingText(page), { timeout: 5_000 }).toContain("第 96 行");
    await expect(page.getByTestId("system-share-files")).toContainText("分享附件.txt");
    await page.getByTestId("system-share-original-toggle").click();
    await expect(page.getByTestId("system-share-original").locator("dl")).toBeVisible();

    const gestureDeltas: number[] = [];
    for (const selector of [
      '[data-testid="system-share-attachments-title"]',
      '[data-testid="system-share-file-row-0"]',
      '[data-testid="system-share-empty-attachments"]',
      ".system-share-file-picker",
    ]) {
      if (selector === '[data-testid="system-share-empty-attachments"]') {
        await page.getByRole("button", { name: "移除 分享附件.txt" }).click();
        await expect(page.getByTestId("system-share-empty-attachments")).toBeVisible();
      }
      const result = await synthesizeTouchScroll(page, selector, 180);
      expect(Math.abs(result.after - result.before)).toBeGreaterThan(0);
      gestureDeltas.push(Math.abs(result.after - result.before));
    }
    expect(Math.max(...gestureDeltas)).toBeGreaterThan(0);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: "触控回归-a.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("附件增删回归 A"),
      },
      {
        name: "触控回归-b.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("附件增删回归 B"),
      },
    ]);
    await expect(page.getByTestId("system-share-files")).toContainText("触控回归-a.txt");
    await expect(page.getByTestId("system-share-files")).toContainText("触控回归-b.txt");
    await page.getByRole("button", { name: "移除 触控回归-a.txt" }).click();
    await page.getByRole("button", { name: "移除 触控回归-b.txt" }).click();
    await expect(page.getByTestId("system-share-empty-attachments")).toBeVisible();

    const layout = await readShareLayout(page);
    expect(layout.bodyOverflow).toEqual({
      overflowX: "clip",
      overflowY: "visible",
      overscrollBehaviorY: "auto",
    });
    expect(layout.editorBody.overflowY).toBe("visible");
    expect(layout.editorBody.overscrollBehaviorY).toBe("auto");
  });
});
