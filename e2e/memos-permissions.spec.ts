import { expect, test } from "@playwright/test";

/**
 * Memos 权限控制测试套件
 *
 * 验证管理员和普通用户在 memos 页面的不同权限表现
 */

test.describe("Memos 权限控制", () => {
  test.describe("管理员权限测试", () => {
    test.beforeEach(async ({ page }) => {
      // 确保管理员模式启用（开发环境默认已启用）
      await page.addInitScript(() => {
        // 确保管理员环境变量生效
        window.localStorage.setItem("test-admin-mode", "true");
      });

      // 设置管理员请求头（确保后端识别为管理员）
      await page.setExtraHTTPHeaders({
        "Remote-Email": process.env.ADMIN_EMAIL || "admin@example.com",
      });
    });

    test("管理员应该看到完整的管理功能", async ({ page }) => {
      await page.goto("/memos");

      // 等待页面加载完成
      await page.waitForLoadState("networkidle");

      // 验证 QuickMemoEditor 组件可见
      const quickEditor = page.getByTestId("quick-memo-editor");
      await expect(quickEditor).toBeVisible();

      // 验证快速发布标题
      await expect(page.getByText("快速发布 Memo")).toBeVisible();

      // 验证编辑器输入区域
      const editorInput = page.getByTestId("quick-memo-editor");
      await expect(editorInput).toBeVisible();

      // 等待 memo 列表加载
      await page.waitForSelector(".memos-list", { timeout: 10000 });

      // 验证 memo 卡片上的管理按钮（如果有 memo 的话）
      const memoCards = page.locator(".memo-card");
      const cardCount = await memoCards.count();

      if (cardCount > 0) {
        // 检查第一个 memo 卡片的编辑/删除按钮
        const firstCard = memoCards.first();

        // 查找编辑按钮（可能是图标或文本）
        const editButton = firstCard
          .locator("button")
          .filter({ hasText: /编辑|edit/i })
          .or(firstCard.locator('button[title*="编辑"]'))
          .or(
            firstCard
              .locator("button")
              .filter({ has: page.locator("svg") })
              .first()
          );

        // 查找删除按钮
        const deleteButton = firstCard
          .locator("button")
          .filter({ hasText: /删除|delete/i })
          .or(firstCard.locator('button[title*="删除"]'))
          .or(
            firstCard
              .locator("button")
              .filter({ has: page.locator("svg") })
              .last()
          );

        // 验证按钮存在（至少有一个管理按钮）
        const hasManageButtons = (await editButton.count()) > 0 || (await deleteButton.count()) > 0;
        expect(hasManageButtons).toBeTruthy();
      }
    });

    test("管理员应该能够创建新 memo", async ({ page }) => {
      await page.goto("/memos");
      await page.waitForLoadState("networkidle");

      // 查找快速编辑器
      const quickEditor = page.getByTestId("quick-memo-editor");
      await expect(quickEditor).toBeVisible();

      // 输入测试内容
      const testContent = `测试 memo - ${Date.now()}`;
      await quickEditor.fill(testContent);

      // 查找并点击发布按钮
      const publishButton = page.getByRole("button", { name: /发布|保存|submit/i });
      if ((await publishButton.count()) > 0) {
        await publishButton.click();

        // 等待发布完成（可能有加载状态）
        await page.waitForTimeout(2000);

        // 验证新 memo 出现在列表中
        await expect(page.getByText(testContent)).toBeVisible();
      }
    });

    test("管理员界面截图", async ({ page }) => {
      await page.goto("/memos");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000); // 等待动画完成

      // 截图保存
      await page.screenshot({
        path: "test-results/admin-memos-view.png",
        fullPage: true,
      });
    });
  });

  test.describe("普通用户权限测试", () => {
    test.beforeEach(async ({ page }) => {
      // 清除管理员权限
      await page.addInitScript(() => {
        window.localStorage.removeItem("test-admin-mode");
      });

      // 设置非管理员请求头 - 关键是设置 X-Test-Mode 来绕过 ADMIN_MODE
      await page.setExtraHTTPHeaders({
        "X-Test-Mode": "non-admin", // 这个头会让 extractAuthFromRequest 跳过 ADMIN_MODE 逻辑
        "Remote-Email": "user@example.com", // 非管理员邮箱
      });
    });

    test("普通用户不应该看到管理功能", async ({ page }) => {
      await page.goto("/memos");
      await page.waitForLoadState("networkidle");

      // 验证 QuickMemoEditor 组件不可见
      const quickEditor = page.getByTestId("quick-memo-editor");
      await expect(quickEditor).not.toBeVisible();

      // 验证没有"快速发布 Memo"标题
      await expect(page.getByText("快速发布 Memo")).not.toBeVisible();

      // 等待 memo 列表加载
      await page.waitForSelector(".memos-list", { timeout: 10000 });

      // 验证 memo 卡片上没有管理按钮
      const memoCards = page.locator(".memo-card");
      const cardCount = await memoCards.count();

      if (cardCount > 0) {
        const firstCard = memoCards.first();

        // 验证没有编辑按钮
        const editButtons = firstCard.locator("button").filter({ hasText: /编辑|edit/i });
        await expect(editButtons).toHaveCount(0);

        // 验证没有删除按钮
        const deleteButtons = firstCard.locator("button").filter({ hasText: /删除|delete/i });
        await expect(deleteButtons).toHaveCount(0);
      }
    });

    test("普通用户只能查看公开内容", async ({ page }) => {
      await page.goto("/memos");
      await page.waitForLoadState("networkidle");

      // 验证页面标题存在（说明页面正常加载）
      await expect(page.getByText("Memos")).toBeVisible();

      // 验证可以看到 memo 列表（公开内容）
      const memosList = page.locator(".memos-list");
      await expect(memosList).toBeVisible();

      // 验证没有任何管理相关的UI元素
      await expect(page.getByText("快速发布")).not.toBeVisible();
      await expect(page.getByText("管理")).not.toBeVisible();
    });

    test("普通用户界面截图", async ({ page }) => {
      await page.goto("/memos");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000); // 等待动画完成

      // 截图保存
      await page.screenshot({
        path: "test-results/user-memos-view.png",
        fullPage: true,
      });
    });
  });

  test.describe("边界情况测试", () => {
    test("未登录用户访问", async ({ page }) => {
      // 清除所有认证信息
      await page.context().clearCookies();

      await page.goto("/memos");
      await page.waitForLoadState("networkidle");

      // 验证页面可以正常访问（应该显示公开内容）
      await expect(page.getByText("Memos")).toBeVisible();

      // 验证没有管理功能
      await expect(page.getByTestId("quick-memo-editor")).not.toBeVisible();
    });

    test("权限检查加载状态", async ({ page }) => {
      // 模拟慢速网络
      await page.route("/api/trpc/auth.me*", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // 延迟1秒
        await route.continue();
      });

      await page.goto("/memos");

      // 验证加载状态存在
      const loadingElements = page.locator(".animate-pulse");
      await expect(loadingElements.first()).toBeVisible();

      // 等待加载完成
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // 验证最终内容显示
      await expect(page.getByText("Memos")).toBeVisible();
    });
  });
});
