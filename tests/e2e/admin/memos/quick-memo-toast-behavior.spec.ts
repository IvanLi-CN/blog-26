import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { waitForQuickMemoEditor } from "./helpers";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";

test.describe("Quick memo publish feedback (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post("/api/dev/login", {
      data: { email: ADMIN_EMAIL },
    });
  });

  test("success toast, clears editor and renders memo", async ({ page }) => {
    let dialogOpened = false;
    page.on("dialog", async (dialog) => {
      dialogOpened = true;
      await dialog.dismiss();
    });

    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    await editor.click();

    const marker = `E2E 快速发布成功 ${Date.now()}`;
    await page.keyboard.insertText(marker);
    await expect(editor).toContainText(marker);
    await page.waitForTimeout(200);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();

    const [createResp] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.request().method() === "POST",
        { timeout: 30000 }
      ),
      publish.click(),
    ]);
    expect(createResp.status()).toBe(200);

    const toast = page.locator(".Toastify__toast .nature-alert-success");
    await expect(toast).toContainText("Memo 已发布", { timeout: 10000 });

    await expect
      .poll(async () => ((await editor.textContent()) || "").trim().length, {
        timeout: 5000,
        message: "等待快速发布编辑器清空",
      })
      .toBe(0);

    const memoCard = page.locator('[data-testid="memo-card"]').filter({ hasText: marker }).first();
    await expect(memoCard).toBeVisible({ timeout: 30000 });

    expect(dialogOpened).toBe(false);
  });

  test("core creation failure shows error toast and no new memo", async ({ page }) => {
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);
    const marker = `E2E 强制失败 ${Date.now()} [[force-fail]]`;
    await editor.click();
    await page.keyboard.insertText(marker);
    await expect(editor).toContainText("force-fail");
    await page.waitForTimeout(200);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();

    const [createResp] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.request().method() === "POST",
        { timeout: 30000 }
      ),
      publish.click(),
    ]);
    expect(createResp.status()).toBeGreaterThanOrEqual(500);

    const errorToast = page.locator(".Toastify__toast .nature-alert-error");
    await expect(errorToast).toContainText("发布 Memo 失败", { timeout: 10000 });

    await expect
      .poll(async () => ((await editor.textContent()) || "").trim().length, {
        timeout: 3000,
        message: "失败后编辑器仍保留内容",
      })
      .toBeGreaterThan(0);

    const memoCard = page.locator('[data-testid="memo-card"]').filter({ hasText: marker });
    await expect(memoCard).toHaveCount(0);
  });

  test("degraded response still treated as success", async ({ page }) => {
    await page.goto("/memos", { waitUntil: "domcontentloaded" });
    const { container, editor } = await waitForQuickMemoEditor(page);

    const marker = `E2E 降级返回 ${Date.now()} [[force-degrade]]`;
    await editor.click();
    await page.keyboard.insertText(marker);
    await expect(editor).toContainText("降级返回");
    await page.waitForTimeout(200);

    const publish = container.getByRole("button", { name: "发布 Memo" });
    await expect(publish).toBeEnabled();

    const [createResp] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.create") && res.request().method() === "POST",
        { timeout: 30000 }
      ),
      publish.click(),
    ]);
    expect(createResp.status()).toBe(200);

    const toast = page.locator(".Toastify__toast .nature-alert-success");
    await expect(toast).toContainText("Memo 已发布", { timeout: 10000 });

    const memoCard = page.locator('[data-testid="memo-card"]').filter({ hasText: "E2E 降级返回" });
    await expect(memoCard.first()).toBeVisible({ timeout: 30000 });
  });
});
