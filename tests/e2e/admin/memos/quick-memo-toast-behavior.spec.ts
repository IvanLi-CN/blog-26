import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { waitForAdminLiveMemoCard, waitForQuickMemoEditor } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Quick memo publish feedback (admin)", () => {
  test.describe.configure({ timeout: 150_000 });

  test.beforeEach(async ({ page }) => {
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });
  });

  test("success state clears editor and renders memo", async ({ page }) => {
    let dialogOpened = false;
    page.on("dialog", async (dialog) => {
      dialogOpened = true;
      await dialog.dismiss();
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const { container, editor } = await waitForQuickMemoEditor(page);
    await editor.click();

    const marker = `E2E 快速发布成功 ${Date.now()}`;
    await page.keyboard.insertText(marker);
    await expect(editor).toContainText(marker);
    await page.waitForTimeout(200);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();

    await publish.click();

    await expect(page.getByText("Memo 已创建：")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".nature-alert-success strong")).toContainText(marker);

    await expect
      .poll(async () => ((await editor.textContent()) || "").trim().length, {
        timeout: 5000,
        message: "等待快速发布编辑器清空",
      })
      .toBe(0);

    await waitForAdminLiveMemoCard(page, marker, 30_000);

    expect(dialogOpened).toBe(false);
  });

  test("core creation failure keeps editor content and shows inline error", async ({ page }) => {
    await page.goto("/memos", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const { container, editor } = await waitForQuickMemoEditor(page);
    const marker = `E2E 强制失败 ${Date.now()} [[force-fail]]`;
    await editor.click();
    await page.keyboard.insertText(marker);
    await expect(editor).toContainText("force-fail");
    await page.waitForTimeout(200);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();

    await publish.click();

    const inlineError = page.locator(".nature-alert-error").filter({ hasText: "创建 memo 失败" });
    await expect(inlineError).toBeVisible({ timeout: 10_000 });

    await expect
      .poll(async () => ((await editor.textContent()) || "").trim().length, {
        timeout: 3000,
        message: "失败后编辑器仍保留内容",
      })
      .toBeGreaterThan(0);

    const memoCard = page
      .locator('[data-testid="admin-live-memo-card"]')
      .filter({ hasText: marker });
    await expect(memoCard).toHaveCount(0);
  });

  test("degraded response still surfaces success state", async ({ page }) => {
    await page.goto("/memos", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const { container, editor } = await waitForQuickMemoEditor(page);

    const marker = `E2E 降级返回 ${Date.now()} [[force-degrade]]`;
    await editor.click();
    await page.keyboard.insertText(marker);
    await expect(editor).toContainText("降级返回");
    await page.waitForTimeout(200);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();

    await publish.click();

    await expect(page.getByText("Memo 已创建：")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".nature-alert-success strong")).toContainText("E2E 降级返回");

    await waitForAdminLiveMemoCard(page, "E2E 降级返回", 30_000);
  });
});
