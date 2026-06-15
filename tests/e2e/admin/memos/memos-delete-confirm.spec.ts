import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";
import { openAdminMemoDetail } from "./helpers";

/**
 * Memos 删除确认（管理员）
 * - 通过实时管理员列表进入详情预览页删除
 * - 使用浏览器 confirm 作为当前产品合同
 * - 确认后列表中目标卡片消失
 */

let seededTitle: string;
let seededSlug: string;

test.describe("Memos 删除确认 (admin)", () => {
  test.beforeEach(async ({ page }) => {
    // 通过 dev 登录接口建立管理员会话（测试环境允许）
    await page.request.post("/api/dev/login", {
      data: { email: process.env.ADMIN_EMAIL || "admin@example.com" },
    });
    const ts = Date.now();
    seededTitle = `E2E 删除测试-LOCAL-${ts}`;

    const createResponse = await page.request.post("/api/public/memos", {
      data: {
        title: seededTitle,
        content: `# ${seededTitle}\n\nseed for delete - local\n\nmarker: ${seededTitle}`,
        isPublic: true,
        tags: ["e2e", "delete-test"],
        attachments: [],
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const payload = (await createResponse.json()) as { slug?: string };
    seededSlug = payload.slug ?? "";
    expect(seededSlug).toBeTruthy();
  });

  test("详情页确认删除后目标 memo 消失", async ({ page }) => {
    await openAdminMemoDetail(page, seededSlug);
    await expect(page.getByTestId("admin-live-memo-delete")).toBeVisible({ timeout: 30_000 });

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.getByTestId("admin-live-memo-delete").click();
    await page.waitForURL(/\/memos\/$/, { timeout: 60_000 });
    const refreshedCard = page.locator(
      `[data-testid="admin-live-memo-card"][data-slug="${seededSlug}"]`
    );
    await expect(refreshedCard).toHaveCount(0, { timeout: 20_000 });

    // 成功提示出现（react-toastify + daisyUI 样式）
    await expect(page.getByText("管理员实时 Memo 视图")).toBeVisible({ timeout: 20_000 });
  });

  test("删除失败时显示错误提示", async ({ page }) => {
    await page.route(/\/api\/public\/memos\/.+/, async (route) => {
      if (route.request().method() !== "DELETE") {
        await route.fallback();
        return;
      }
      await route.fulfill({ status: 500, body: "server error" });
    });

    await openAdminMemoDetail(page, seededSlug);
    await expect(page.getByTestId("admin-live-memo-delete")).toBeVisible({ timeout: 30_000 });
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    await page.getByTestId("admin-live-memo-delete").click();

    const failAlert = page.locator(".nature-alert-error");
    await expect(failAlert).toContainText("Request failed with status 500", { timeout: 10_000 });
    await expect(page.getByTestId("public-memo-detail-controls")).toBeVisible();
  });
});
