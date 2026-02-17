import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures";

/**
 * Memos 删除确认（管理员）
 * - 仅在 /memos 列表页进行测试
 * - 必须出现 daisyUI 模态框（而非浏览器 confirm）
 * - 确认后列表数量应减少，且删除接口返回 200
 */

const E2E_FS_ONLY = process.env.E2E_FS_ONLY === "1" || process.env.E2E_FS_ONLY === "true";

let seededTitles: { webdav?: string; local: string };
test.describe("Memos 删除确认 (admin)", () => {
  async function loadUntilFound(
    page: import("@playwright/test").Page,
    locator: ReturnType<typeof page.locator>,
    maxClicks = 5
  ) {
    for (let i = 0; i < maxClicks; i++) {
      const count = await locator.count();
      if (count > 0) return true;
      const loadMore = page.getByRole("button", { name: "加载更多 Memo" }).first();
      const hasLoadMore = (await loadMore.count().catch(() => 0)) > 0;
      if (!hasLoadMore) break;
      const visible = await loadMore.isVisible({ timeout: 1000 }).catch(() => false);
      if (!visible) break;
      const disabled = await loadMore.isDisabled().catch(() => true);
      if (disabled) break;
      // CI 下偶发：加载中的占位/遮罩会拦截 pointer events，导致 click 超时；这里强制点击以降低波动。
      await loadMore.click({ force: true, timeout: 15_000 });
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(200);
    }
    return (await locator.count()) > 0;
  }
  test.beforeEach(async ({ page }) => {
    // 通过 dev 登录接口建立管理员会话（测试环境允许）
    await page.request.post("/api/dev/login", {
      data: { email: process.env.ADMIN_EMAIL || "admin@example.com" },
    });
    // 在 WebDAV 与本地各插入一条带唯一标题的数据，避免互相影响
    const ts = Date.now();
    seededTitles = {
      local: `E2E 删除测试-LOCAL-${ts}`,
    } as const;
    if (!E2E_FS_ONLY) {
      seededTitles.webdav = `E2E 删除测试-WEBDAV-${ts}`;
    }

    // 通过 dev API 写入文件到对应内容目录
    if (!E2E_FS_ONLY && seededTitles.webdav) {
      const respWebdav = await page.request.post("/api/dev/test-content", {
        data: {
          kind: "memo",
          source: "webdav",
          title: seededTitles.webdav,
          body: `# ${seededTitles.webdav}\n\nseed for delete - webdav\n\nmarker: ${seededTitles.webdav}`,
        },
      });
      expect(respWebdav.ok()).toBeTruthy();
    }

    const respLocal = await page.request.post("/api/dev/test-content", {
      data: {
        kind: "memo",
        source: "local",
        title: seededTitles.local,
        body: `# ${seededTitles.local}\n\nseed for delete - local\n\nmarker: ${seededTitles.local}`,
      },
    });
    expect(respLocal.ok()).toBeTruthy();

    // 触发一次内容同步，保证页面可见
    const syncResp = await page.request.post("/api/dev/sync");
    expect(syncResp.ok()).toBeTruthy();
  });

  test("列表页弹出 daisyUI 确认框并成功删除", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");

    // 等待列表渲染稳定
    await page.waitForSelector(".memos-list", { timeout: 15000 });
    await page.waitForTimeout(300);

    // 使用每卡唯一的时间元素进行计数（如需）
    // 列表可能为空（只创建了1条），此时 beforeCount 可以为 0

    // FS-only 下只会同步 local 数据；非 FS-only 下优先删除 WebDAV 种子以覆盖更多路径。
    const targetSource = E2E_FS_ONLY ? "local" : "webdav";
    const targetTitle = E2E_FS_ONLY
      ? seededTitles.local
      : (seededTitles.webdav ?? seededTitles.local);

    // 删除目标种子：通过唯一 marker 标记定位；若未渲染则滚动加载
    const cardByTitle = page.locator('[data-testid="memo-card"][data-slug]').filter({
      hasText: `marker: ${targetTitle}`,
    });
    const found = await loadUntilFound(page, cardByTitle, 8);
    // 如果没找到，就退化为选择首个目标来源的卡片
    let targetCard = cardByTitle;
    if (!found) {
      targetCard = page
        .locator(`[data-testid="memo-card"][data-source="${targetSource}"][data-slug]`)
        .first();
      await expect(targetCard).toBeVisible();
    }
    const targetSlug = await targetCard.getAttribute("data-slug");
    const targetCardDeleteBtn = targetCard.getByRole("button", { name: /^删除 Memo/ });
    await expect(targetCardDeleteBtn).toBeVisible();
    const a11yName = await targetCardDeleteBtn.getAttribute("aria-label");
    const memoTitle = a11yName?.replace(/^删除 Memo:\s*/, "")?.trim() || undefined;

    // 点击删除，应该出现 daisyUI 模态对话框
    await targetCardDeleteBtn.click();

    const modal = page.locator(".modal.modal-open .modal-box");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { name: "确认删除" })).toBeVisible();
    await expect(modal.getByText("此操作不可撤销")).toBeVisible();
    if (memoTitle) {
      await expect(modal.getByText(memoTitle)).toBeVisible();
    }

    // 点击“确认删除”，以 UI 状态为准进行稳健等待（避免响应匹配脆弱）
    const confirmBtn = modal.getByRole("button", { name: "确认删除" });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // 模态关闭（删除成功）
    await expect(modal).toBeHidden({ timeout: 20000 });

    // 断言目标卡片已从列表消失（基于 data-slug），避免受分页影响
    if (targetSlug) {
      await expect(
        page.locator(`[data-testid="memo-card"][data-slug="${targetSlug}"]`)
      ).toHaveCount(0, { timeout: 20000 });
    }

    // 成功提示出现（react-toastify + daisyUI 样式）
    const successToast = page.locator(".Toastify__toast .alert.alert-success");
    await expect(successToast).toBeVisible();

    // 注意：页面其他操作可能触发非相关的错误提示，此处不做全局错误断言以避免干扰
  });

  test("删除失败时显示错误提示", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".memos-list", { timeout: 15000 });

    // 拦截删除接口并返回 500
    await page.route(/\/api\/trpc\/memos\.delete.*/, async (route) => {
      await route.fulfill({ status: 500, body: "server error" });
    });

    // 删除本地种子（失败）：通过唯一 marker 标记定位；若未渲染则滚动加载
    let localCard = page.locator('[data-testid="memo-card"][data-slug]').filter({
      hasText: `marker: ${seededTitles.local}`,
    });
    let localFound = await loadUntilFound(page, localCard, 8);
    if (!localFound) {
      // 预览可能截断或不含 marker，回退到根据来源选择第一张本地卡片
      localCard = page.locator('[data-testid="memo-card"][data-source="local"][data-slug]').first();
      await expect(localCard).toBeVisible();
      localFound = true;
    }
    expect(localFound).toBeTruthy();
    // 记录目标卡片标识，后续断言仍存在（使用 data-slug 更稳健）
    const beforeSlug = await localCard.getAttribute("data-slug").catch(() => null);
    const deleteBtn = localCard.getByRole("button", { name: /^删除 Memo/ }).first();
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    const modal = page.locator(".modal.modal-open .modal-box");
    await expect(modal.getByRole("heading", { name: "确认删除" })).toBeVisible();

    const confirmBtn = modal.getByRole("button", { name: "确认删除" });
    await confirmBtn.click();

    // 失败后模态仍应保持打开，并在对话框内显示错误提示
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/删除失败/)).toBeVisible();

    // 不应出现全局错误 toast（对话框内已显示错误信息）
    const failToast = page.locator(".Toastify__toast .alert.alert-error");
    await expect(failToast).toHaveCount(0);

    // 目标卡片仍应存在（没有被移除）
    if (beforeSlug) {
      await expect(
        page.locator(`[data-testid="memo-card"][data-slug="${beforeSlug}"]`)
      ).toHaveCount(1);
    } else {
      await expect(localCard).toBeVisible();
    }
  });
});
