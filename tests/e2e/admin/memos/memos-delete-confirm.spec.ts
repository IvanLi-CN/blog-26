import { expect, test } from "@playwright/test";

/**
 * Memos 删除确认（管理员）
 * - 仅在 /memos 列表页进行测试
 * - 必须出现 daisyUI 模态框（而非浏览器 confirm）
 * - 确认后列表数量应减少，且删除接口返回 200
 */

test.describe("Memos 删除确认 (admin)", () => {
  test.beforeEach(async ({ page }) => {
    // 通过 dev 登录接口建立管理员会话（测试环境允许）
    await page.request.post("/api/dev/login", {
      data: { email: process.env.ADMIN_EMAIL || "admin@example.com" },
    });

    // 确保至少存在 1 条待删除的 Memo（自建，避免受其他用例影响）
    const seedTitle = "E2E 删除测试种子";
    const seedContent = "# E2E 删除测试种子\n\n用于验证删除确认流程。";

    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    const editor = page.getByRole("region", { name: "快速发布区域" });
    await editor.scrollIntoViewIfNeeded();

    // 如果列表为空或未找到该标题，则发布一条
    const hasSeed = await page.getByRole("heading", { name: seedTitle }).count();
    if (hasSeed === 0) {
      const editorBox = editor.getByRole("textbox");
      await editorBox.click();
      // 使用 type 触发输入事件
      await editorBox.type(seedContent, { delay: 1 });
      const publishBtn = editor.getByRole("button", { name: "发布 Memo" });
      await expect(publishBtn).toBeEnabled();
      const [createResp] = await Promise.all([
        page.waitForResponse(
          (res) => res.url().includes("/api/trpc/memos.create") && res.status() === 200
        ),
        publishBtn.click(),
      ]);
      // 基本防御
      if (createResp.status() !== 200) throw new Error("种子 memo 创建失败");
      await page.waitForTimeout(300);
    }
  });

  test("列表页弹出 daisyUI 确认框并成功删除", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");

    // 等待列表渲染稳定
    await page.waitForSelector(".memos-list", { timeout: 15000 });
    await page.waitForTimeout(300);

    // 使用每卡唯一的时间元素进行计数，避免 testid 重复导致的翻倍
    const timeEls = page.locator('[data-testid="memo-time"]');
    const beforeCount = await timeEls.count();
    expect(beforeCount).toBeGreaterThan(0);

    // 选择第一条可见的删除按钮（管理员视图才有）
    const deleteBtn = page.getByRole("button", { name: /^删除 Memo/ }).first();
    await expect(deleteBtn).toBeVisible();

    // 读取按钮的无障碍名称以提取 memo 标题，便于后续断言
    const a11yName = await deleteBtn.getAttribute("aria-label");
    const memoTitle = a11yName?.replace(/^删除 Memo:\s*/, "")?.trim() || undefined;

    // 点击删除，应该出现 daisyUI 模态对话框
    await deleteBtn.click();

    const modal = page.locator(".modal.modal-open .modal-box");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { name: "确认删除" })).toBeVisible();
    await expect(modal.getByText("此操作不可撤销")).toBeVisible();
    if (memoTitle) {
      await expect(modal.getByText(memoTitle)).toBeVisible();
    }

    // 点击“确认删除”并等待后端 tRPC 删除接口成功返回
    const confirmBtn = modal.getByRole("button", { name: "确认删除" });
    await expect(confirmBtn).toBeEnabled();

    const [deleteResp] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/trpc/memos.delete") && res.status() === 200,
        { timeout: 30000 }
      ),
      confirmBtn.click(),
    ]);

    expect(deleteResp.status()).toBe(200);

    // 模态关闭
    await expect(modal).toBeHidden({ timeout: 10000 });

    // 列表应减一：以轮询方式等待数据刷新完成
    await expect
      .poll(async () => await timeEls.count(), {
        timeout: 15000,
        message: "等待 memo 列表数量减 1",
      })
      .toBe(beforeCount - 1);

    // 成功提示出现（react-toastify + daisyUI 样式）
    const successToast = page.locator(".Toastify__toast .alert.alert-success");
    await expect(successToast).toBeVisible();

    // 基本防御：列表页没有出现全局错误告警（若实现了错误提示）
    const errorAlert = page.locator(".alert-error");
    await expect(errorAlert).toHaveCount(0);
  });

  test("删除失败时显示错误提示", async ({ page }) => {
    await page.goto("/memos");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".memos-list", { timeout: 15000 });

    // 拦截删除接口并返回 500
    await page.route(/\/api\/trpc\/memos\.delete.*/, async (route) => {
      await route.fulfill({ status: 500, body: "server error" });
    });

    const beforeCount = await page.locator('[data-testid="memo-time"]').count();

    const deleteBtn = page.getByRole("button", { name: /^删除 Memo/ }).first();
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

    // 数量不应减少
    const afterCount = await page.locator('[data-testid="memo-time"]').count();
    expect(afterCount).toBe(beforeCount);
  });
});
