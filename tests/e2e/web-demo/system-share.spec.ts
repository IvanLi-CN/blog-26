import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

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

test.describe("Console system share Web Demo", () => {
  test.describe.configure({ timeout: 60_000 });

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
    await expect(page.getByTestId("system-share-toast-success")).toBeVisible();
    await expect(page).toHaveURL(/\/share\?/);
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/, { timeout: 5_000 });
    await expect(page.getByTestId("system-share-toast-success")).toHaveCount(0);
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

  test("retains the submission identity when refreshed during the success notice", async ({
    page,
  }) => {
    await clearPendingShare(page);
    const submissionId = randomUUID();
    await page.goto(`/share?d_persona=admin&d_share=url&d_submission=${submissionId}`, {
      waitUntil: "domcontentloaded",
    });
    await expectSharePage(page);
    const editor = page.getByTestId("system-share-memo-editor").locator(".ProseMirror");
    await expect(editor).toContainText("#剪藏");
    expect(await readPendingIdentity(page)).toBe(submissionId);
    await page.clock.install();
    await page.getByTestId("system-share-submit").click();
    await expect(page.getByTestId("system-share-toast-success")).toBeVisible();
    expect(await readPendingIdentity(page)).toBe(submissionId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectSharePage(page);
    await expect(editor).toContainText("https://example.com/reading-note");
    expect(await readPendingIdentity(page)).toBe(submissionId);
    await expect(page).toHaveURL(/\/share\?/);
  });

  test("holds the success notice for one second before navigating to detail", async ({ page }) => {
    await clearPendingShare(page);
    let successToastShownAt = 0;
    await page.exposeFunction("recordSystemShareSuccessToast", () => {
      successToastShownAt = performance.now();
    });
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (!document.querySelector('[data-testid="system-share-toast-success"]')) return;
        void (
          window as unknown as { recordSystemShareSuccessToast: () => void }
        ).recordSystemShareSuccessToast();
        observer.disconnect();
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
    await expect(page.getByTestId("system-share-toast-success")).toBeVisible();
    expect(page.url()).toMatch(/\/share\?/);
    await page.waitForURL(/\/memos\/console-demo-created-\d+$/, { timeout: 5_000 });
    expect(successToastShownAt).toBeGreaterThan(0);
    const successNoticeDuration = performance.now() - successToastShownAt;
    expect(successNoticeDuration).toBeGreaterThanOrEqual(800);
    expect(successNoticeDuration).toBeLessThan(1_400);
    await expect(page.getByTestId("system-share-toast-success")).toHaveCount(0);
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
    await expect(page.getByTestId("system-share-toast-success")).toBeVisible();
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
    await expect(page.getByTestId("system-share-toast-success")).toContainText("恢复此前发布", {
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/);
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
});
