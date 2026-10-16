import { expect, test } from "@playwright/test";

async function clearPendingShare(page: import("@playwright/test").Page) {
  await page.goto("/share?d_persona=admin&d_share=text", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("ivan-console-system-share");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
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
    await expect(page.getByTestId("system-share-page")).toBeVisible();
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
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText(
      "刷新后仍然保留在唯一 Memo 编辑框内的内容。"
    );
    await page.getByTestId("system-share-original-toggle").click();
    await expect(page.getByTestId("system-share-original")).toContainText("会议记录附件");
    await page.getByTestId("system-share-submit").click();
    await expect(page.getByTestId("system-share-toast-progress")).toBeVisible();
    const successShownAt = Date.now();
    await expect(page.getByTestId("system-share-toast-success")).toBeVisible();
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/);
    expect(Date.now() - successShownAt).toBeGreaterThanOrEqual(850);
    await expect(page.getByTestId("system-share-toast-success")).toHaveCount(0);
  });

  test("keeps a clipping URL in the single Memo content field", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=admin&d_share=url", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("system-share-classification")).toHaveCount(0);
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText(
      "https://example.com/reading-note"
    );
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText(
      "分享时附带的剪藏备注。"
    );
    await expect(page.getByTestId("system-share-memo-editor-surface")).toContainText("#剪藏");
  });

  test("persists an edited clipping URL and keeps a memo edit after refresh", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto("/share?d_persona=admin&d_share=url", {
      waitUntil: "domcontentloaded",
    });
    const editor = page.getByTestId("system-share-memo-editor").locator(".ProseMirror");
    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("https://example.com/changed\n\n换成新的剪藏备注");
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(editor).toContainText("https://example.com/changed");
    await expect(editor).toContainText("换成新的剪藏备注");
    await expect(editor).not.toContainText("https://example.com/reading-note");

    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("已经改成普通闪念");
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(editor).toContainText("已经改成普通闪念");
    await expect(editor).not.toContainText("#剪藏");
  });

  test("keeps a failed submission in place and retries from the global toast", async ({ page }) => {
    await clearPendingShare(page);
    await page.goto(
      "/share?d_persona=admin&d_share=error&d_scene=system-share-error&d_delay=slow",
      {
        waitUntil: "domcontentloaded",
      }
    );
    await expect(page.getByTestId("system-share-page")).toBeVisible();
    await page.getByTestId("system-share-submit").click();
    await expect(page.getByTestId("system-share-toast-error")).toBeVisible();
    await expect(page.getByTestId("system-share-toast-error")).toHaveCount(1);
    await page
      .getByTestId("system-share-toast-error")
      .getByRole("button", { name: "重试" })
      .click();
    await expect(page.getByTestId("system-share-toast-progress")).toBeVisible();
    await expect(page.getByTestId("system-share-toast-success")).toBeVisible();
    await expect(page).toHaveURL(/\/memos\/console-demo-created-\d+$/);
  });
});
