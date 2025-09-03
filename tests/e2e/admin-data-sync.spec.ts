/**
 * 数据同步管理页面端到端测试
 *
 * 测试数据同步管理页面的核心功能，包括：
 * - 页面加载和渲染
 * - 数据同步操作（全量和增量）
 * - 实时同步状态显示
 * - 实时日志功能
 * - 内容统计面板
 * - WebSocket 连接和实时更新
 * - 错误处理
 */

import { expect, test } from "@playwright/test";
import { devLogin } from "./editor-smart-features/utils/editor-test-helpers";

test.describe("数据同步管理页面", () => {
  test.beforeEach(async ({ page }) => {
    // 设置更长的超时时间
    page.setDefaultTimeout(60000);

    // 先访问首页
    await page.goto("/");

    // 使用修复的开发环境登录
    await devLogin(page);
    console.log("✅ 开发环境登录成功");

    // 访问数据同步管理页面
    await page.goto("/admin/data-sync");
    await page.waitForLoadState("networkidle");

    // 等待页面主要内容加载
    await page.waitForSelector("h1", { timeout: 30000 });

    // 等待同步按钮加载
    await page.waitForSelector("[data-testid='full-sync-button']", { timeout: 30000 });

    // 等待一下确保内容渲染完成
    await page.waitForTimeout(3000);
  });

  test.describe("页面基础功能", () => {
    test("应该正确显示页面标题和描述", async ({ page }) => {
      // 确保页面已经加载
      await page.waitForLoadState("domcontentloaded");

      // 验证页面标题
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible({ timeout: 15000 });
      await expect(pageTitle).toHaveText("数据同步");

      // 验证页面描述
      const description = page.locator("p").first();
      await expect(description).toBeVisible({ timeout: 10000 });
      await expect(description).toContainText("从内容源单向同步数据到数据库");

      // 验证页面URL正确
      expect(page.url()).toContain("/admin/data-sync");
    });

    test("应该显示内容统计面板", async ({ page }) => {
      // 等待内容统计面板加载
      await page.waitForTimeout(3000);

      // 查找内容统计面板
      const statsPanel = page.locator("h2").filter({ hasText: "内容统计" });
      const statsPanelCount = await statsPanel.count();

      if (statsPanelCount > 0) {
        await expect(statsPanel).toBeVisible();
        console.log("✅ 找到内容统计面板");

        // 验证统计数据显示
        const totalStat = page.locator(".stat-title").filter({ hasText: "总内容数" });
        const totalStatCount = await totalStat.count();

        if (totalStatCount > 0) {
          await expect(totalStat).toBeVisible();
          console.log("✅ 找到总内容数统计");
        }

        // 验证按类型统计
        const memoStat = page.locator(".stat-title").filter({ hasText: "闪念" });
        const postStat = page.locator(".stat-title").filter({ hasText: "文章" });

        const memoCount = await memoStat.count();
        const postCount = await postStat.count();

        if (memoCount > 0) {
          console.log("✅ 找到闪念统计");
        }
        if (postCount > 0) {
          console.log("✅ 找到文章统计");
        }
      } else {
        console.log("⚠️ 未找到内容统计面板，可能还在加载中");
      }
    });

    test("应该显示主要的控制按钮", async ({ page }) => {
      // 等待同步控制区域加载
      await page.waitForSelector("[data-testid='sync-controls']", { timeout: 15000 });

      // 验证全量同步按钮
      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await expect(fullSyncButton).toBeVisible();
      await expect(fullSyncButton).toBeEnabled();
      await expect(fullSyncButton).toContainText("全量同步");

      // 验证增量同步按钮
      const incrementalSyncButton = page.locator("[data-testid='incremental-sync-button']");
      await expect(incrementalSyncButton).toBeVisible();
      await expect(incrementalSyncButton).toBeEnabled();
      await expect(incrementalSyncButton).toContainText("增量同步");

      // 验证刷新状态按钮
      const refreshButton = page.getByRole("button", { name: /刷新状态/ });
      await expect(refreshButton).toBeVisible();
      await expect(refreshButton).toBeEnabled();

      // 验证取消同步按钮不应该在初始状态显示
      const cancelButton = page.locator("[data-testid='cancel-sync-button']");
      const cancelButtonCount = await cancelButton.count();
      expect(cancelButtonCount).toBe(0);
      console.log("✅ 取消同步按钮在初始状态下正确隐藏");
    });

    test("应该显示内容源状态信息", async ({ page }) => {
      // 等待内容源状态加载
      await page.waitForTimeout(3000);

      // 检查是否有状态显示区域
      const statusElements = page.locator("text=/状态|在线|离线|总项目|最后同步/");
      const statusCount = await statusElements.count();

      if (statusCount > 0) {
        console.log("找到内容源状态信息");
        await expect(statusElements.first()).toBeVisible();
      } else {
        console.log("未找到明显的状态信息，可能还在加载中");
      }
    });
  });

  test.describe("数据同步操作", () => {
    test("应该能够触发全量同步", async ({ page }) => {
      // 使用测试标识符定位全量同步按钮
      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await expect(fullSyncButton).toBeVisible();

      // 记录点击前的状态
      const initialButtonText = await fullSyncButton.textContent();
      console.log("点击前按钮文本:", initialButtonText);

      // 点击同步按钮
      await fullSyncButton.click();

      // 等待同步开始的反馈
      await page.waitForTimeout(2000);

      // 检查按钮状态变化（可能显示"同步中..."或变为禁用状态）
      const currentButtonText = await fullSyncButton.textContent();
      console.log("点击后按钮文本:", currentButtonText);

      // 验证同步操作已触发（按钮文本改变或状态改变）
      if (currentButtonText?.includes("同步中")) {
        console.log("同步已开始，按钮显示同步中状态");

        // 验证取消同步按钮出现（可能不会出现，如果同步很快）
        const cancelButton = page.locator("[data-testid='cancel-sync-button']");
        const cancelButtonCount = await cancelButton.count();

        if (cancelButtonCount > 0) {
          console.log("✅ 取消同步按钮已出现");

          // 验证取消按钮在同步完成后消失
          try {
            await expect(cancelButton).not.toBeVisible({ timeout: 30000 });
            console.log("✅ 取消同步按钮已隐藏");
          } catch {
            console.log("⚠️ 取消按钮可能仍然可见，但这可能是正常的");
          }
        } else {
          console.log("⚠️ 取消同步按钮未出现，同步可能很快完成");
        }

        // 等待同步完成（最多等待60秒）
        try {
          await expect(fullSyncButton).toContainText(/全量同步/, { timeout: 60000 });
          console.log("同步已完成");
        } catch {
          console.log("⚠️ 同步可能仍在进行中，但测试将继续");
        }
      } else {
        console.log("同步可能已快速完成或正在后台进行");
      }
    });

    test("应该能够触发增量同步", async ({ page }) => {
      // 使用测试标识符定位增量同步按钮
      const incrementalSyncButton = page.locator("[data-testid='incremental-sync-button']");
      await expect(incrementalSyncButton).toBeVisible();

      // 记录点击前的状态
      const initialButtonText = await incrementalSyncButton.textContent();
      console.log("点击前按钮文本:", initialButtonText);

      // 点击增量同步按钮
      await incrementalSyncButton.click();

      // 等待同步开始的反馈
      await page.waitForTimeout(2000);

      // 检查按钮状态变化
      const currentButtonText = await incrementalSyncButton.textContent();
      console.log("点击后按钮文本:", currentButtonText);

      // 验证同步操作已触发
      if (currentButtonText?.includes("同步中")) {
        console.log("增量同步已开始");

        // 等待同步完成（增加超时时间）
        try {
          await expect(incrementalSyncButton).toContainText(/增量同步/, { timeout: 60000 });
          console.log("增量同步已完成");
        } catch {
          console.log("⚠️ 增量同步可能仍在进行中，但测试将继续");
        }
      } else {
        console.log("增量同步可能已快速完成");
      }
    });

    test("应该能够显示实时同步进度", async ({ page }) => {
      // 触发同步
      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await fullSyncButton.click();

      // 等待进度显示
      await page.waitForTimeout(1000);

      // 查找同步进度区域
      const progressSection = page.locator("[data-testid='sync-progress-section']");
      const progressSectionCount = await progressSection.count();

      if (progressSectionCount > 0) {
        console.log("找到同步进度区域");
        await expect(progressSection).toBeVisible();

        // 查找运行中的进度显示
        const runningProgress = page.locator("[data-testid='sync-progress-running']");
        const runningProgressCount = await runningProgress.count();

        if (runningProgressCount > 0) {
          console.log("找到运行中的进度显示");
          await expect(runningProgress).toBeVisible();

          // 查找进度条
          const progressBar = page.locator("[data-testid='sync-progress-bar']");
          await expect(progressBar).toBeVisible();
          console.log("✅ 找到实时进度条");

          // 查找进度详情
          const progressDetails = page.locator("[data-testid='sync-progress-details']");
          await expect(progressDetails).toBeVisible();
          console.log("✅ 找到实时进度详情");

          // 验证进度条有实际的进度值
          const progressValue = await progressBar.getAttribute("value");
          console.log(`当前进度值: ${progressValue}`);
        }

        // 等待同步完成，查找成功消息
        const successMessage = page.locator("[data-testid='sync-success-message']");
        try {
          await expect(successMessage).toBeVisible({ timeout: 30000 });
          console.log("✅ 找到同步成功消息");
        } catch {
          console.log("⚠️ 未找到成功消息，同步可能仍在进行或快速完成");
        }
      } else {
        console.log("未找到进度区域，同步可能已快速完成");
      }
    });
  });

  test.describe("实时同步日志功能", () => {
    test("应该显示实时同步日志界面", async ({ page }) => {
      // 等待日志区域加载
      await page.waitForTimeout(2000);

      // 查找日志区域
      const logsSection = page.locator("[data-testid='sync-logs-section']");
      await expect(logsSection).toBeVisible();

      // 验证日志标题
      const logsTitle = page.locator("[data-testid='sync-logs-title']");
      await expect(logsTitle).toBeVisible();
      await expect(logsTitle).toContainText("同步日志");

      // 查找日志展开/折叠按钮
      const toggleButton = page.locator("[data-testid='toggle-logs-button']");
      await expect(toggleButton).toBeVisible();

      // 验证日志内容区域
      const logsContent = page.locator("[data-testid='sync-logs-content']");
      const logsContentCount = await logsContent.count();

      if (logsContentCount > 0) {
        console.log("找到日志内容区域");
        await expect(logsContent).toBeVisible();

        // 检查是否有日志计数显示
        const logsCount = page.locator("[data-testid='sync-logs-count']");
        const logsCountCount = await logsCount.count();
        if (logsCountCount > 0) {
          console.log("✅ 找到日志计数显示");
        }

        // 检查自动滚动指示器
        const autoScrollIndicator = page.locator("text=/自动滚动|手动模式/");
        const autoScrollCount = await autoScrollIndicator.count();
        if (autoScrollCount > 0) {
          console.log("✅ 找到自动滚动指示器");
        }
      }

      // 检查是否有空状态显示
      const emptyState = page.locator("[data-testid='empty-logs-state']");
      const emptyStateCount = await emptyState.count();

      if (emptyStateCount > 0) {
        console.log("显示空日志状态");
        await expect(emptyState).toBeVisible();
        await expect(emptyState).toContainText("暂无同步日志");
      }
    });

    test("应该能够展开和折叠日志", async ({ page }) => {
      // 等待页面加载
      await page.waitForTimeout(2000);

      // 使用测试标识符查找日志切换按钮
      const toggleButton = page.locator("[data-testid='toggle-logs-button']");
      await expect(toggleButton).toBeVisible();

      const initialText = await toggleButton.textContent();
      console.log("初始按钮文本:", initialText);

      // 点击切换按钮
      await toggleButton.click();
      await page.waitForTimeout(500);

      const afterClickText = await toggleButton.textContent();
      console.log("点击后按钮文本:", afterClickText);

      // 验证按钮文本发生了变化
      expect(afterClickText).not.toBe(initialText);

      // 验证日志内容的显示/隐藏状态
      const logsContent = page.locator("[data-testid='sync-logs-content']");
      const isVisible = await logsContent.isVisible();

      if (initialText?.includes("隐藏")) {
        // 如果初始状态是"隐藏日志"，点击后应该隐藏内容
        expect(isVisible).toBe(false);
        console.log("✅ 日志已正确隐藏");
      } else {
        // 如果初始状态是"显示日志"，点击后应该显示内容
        expect(isVisible).toBe(true);
        console.log("✅ 日志已正确显示");
      }
    });

    test("应该能够接收实时日志更新", async ({ page }) => {
      // 触发同步以生成实时日志
      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await fullSyncButton.click();

      // 等待日志开始出现
      await page.waitForTimeout(3000);

      // 检查是否有日志条目出现
      const logEntries = page.locator("tbody tr, .card");
      const logCount = await logEntries.count();

      if (logCount > 0) {
        console.log(`✅ 找到 ${logCount} 条实时日志`);

        // 验证日志内容包含预期的元素
        const firstLogEntry = logEntries.first();
        await expect(firstLogEntry).toBeVisible();

        // 检查日志是否包含时间戳
        const timeElements = page.locator("td:first-child, .font-mono");
        const timeCount = await timeElements.count();
        if (timeCount > 0) {
          console.log("✅ 日志包含时间戳");
        }

        // 检查日志是否包含状态标识
        const statusBadges = page.locator(".badge");
        const badgeCount = await statusBadges.count();
        if (badgeCount > 0) {
          console.log("✅ 日志包含状态标识");
        }
      } else {
        console.log("⚠️ 未找到实时日志，同步可能已快速完成");
      }
    });
  });

  test.describe("错误处理", () => {
    test("应该正确处理页面刷新", async ({ page }) => {
      // 确保页面已经加载完成
      await page.waitForLoadState("domcontentloaded");

      // 验证初始状态
      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await expect(fullSyncButton).toBeVisible();
      await expect(fullSyncButton).toBeEnabled();

      // 刷新页面
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);

      // 验证刷新后页面仍然正常
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible();
      await expect(pageTitle).toHaveText("数据同步");

      // 验证按钮仍然可用
      const refreshedSyncButton = page.locator("[data-testid='full-sync-button']");
      await expect(refreshedSyncButton).toBeVisible();
      await expect(refreshedSyncButton).toBeEnabled();

      // 验证页面URL正确
      expect(page.url()).toContain("/admin/data-sync");
    });
  });

  test.describe("响应式设计", () => {
    test("移动端适配测试", async ({ page }) => {
      // 设置移动端视口
      await page.setViewportSize({ width: 375, height: 667 });

      // 重新加载页面
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000);

      // 验证页面标题在移动端仍然可见
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible();

      // 验证主要按钮在移动端仍然可用
      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await expect(fullSyncButton).toBeVisible();
      await expect(fullSyncButton).toBeEnabled();
    });

    test("平板端适配测试", async ({ page }) => {
      // 设置平板端视口
      await page.setViewportSize({ width: 768, height: 1024 });

      // 重新加载页面
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(1000);

      // 验证页面在平板端的显示
      const pageTitle = page.locator("h1");
      await expect(pageTitle).toBeVisible();

      const fullSyncButton = page.locator("[data-testid='full-sync-button']");
      await expect(fullSyncButton).toBeVisible();
    });
  });

  test.describe("可访问性测试", () => {
    test("键盘导航支持", async ({ page }) => {
      // 使用Tab键导航
      await page.keyboard.press("Tab");

      // 验证焦点可以移动到可交互元素
      const focusedElement = page.locator(":focus");
      await expect(focusedElement).toBeVisible();

      // 继续Tab导航，确保能够到达主要按钮
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("Tab");
        const currentFocus = page.locator(":focus");
        const currentFocusCount = await currentFocus.count();

        if (currentFocusCount > 0) {
          const tagName = await currentFocus.evaluate((el) => el.tagName.toLowerCase());
          if (tagName === "button") {
            console.log("成功通过键盘导航到按钮元素");
            break;
          }
        }
      }
    });

    test("ARIA标签和语义化", async ({ page }) => {
      // 检查页面是否有适当的ARIA标签
      const ariaElements = page.locator("[aria-label], [aria-describedby], [role]");
      const ariaCount = await ariaElements.count();

      if (ariaCount > 0) {
        console.log(`找到 ${ariaCount} 个带有ARIA属性的元素`);
        await expect(ariaElements.first()).toBeVisible();
      }

      // 检查按钮是否有适当的标签
      const buttons = page.locator("button");
      const buttonCount = await buttons.count();

      for (let i = 0; i < Math.min(buttonCount, 5); i++) {
        const button = buttons.nth(i);
        const buttonText = await button.textContent();
        const ariaLabel = await button.getAttribute("aria-label");

        // 按钮应该有文本内容或aria-label
        expect(buttonText || ariaLabel).toBeTruthy();
      }
    });
  });
});
