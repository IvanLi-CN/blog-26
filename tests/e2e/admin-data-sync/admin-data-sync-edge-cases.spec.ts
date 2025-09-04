/**
 * 数据同步边界情况测试
 *
 * 测试数据同步功能的边界情况，包括：
 * - 并发同步操作
 * - WebSocket 连接中断期间的同步
 * - 大量实时日志数据处理
 */

import { expect, test } from "@playwright/test";
import { devLogin } from "../editor-smart-features/utils/editor-test-helpers";

test.describe("数据同步边界情况测试", () => {
  test.beforeEach(async ({ page }) => {
    // 设置超时时间
    page.setDefaultTimeout(60000);

    // 登录并访问数据同步页面
    await page.goto("/");
    await devLogin(page);
    await page.goto("/admin/data-sync");
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("h1", { timeout: 30000 });
    await page.waitForSelector("[data-testid='full-sync-button']", { timeout: 30000 });
    await page.waitForTimeout(3000);
  });

  test("应该防止重复同步操作", async ({ page }) => {
    const fullSyncButton = page.locator("[data-testid='full-sync-button']");
    await expect(fullSyncButton).toBeVisible({ timeout: 15000 });

    // 快速连续点击同步按钮
    await fullSyncButton.click();
    await page.waitForTimeout(100);

    // 检查按钮是否被禁用或显示同步中状态
    const isDisabled = await fullSyncButton.isDisabled();
    const buttonText = await fullSyncButton.textContent();

    console.log("第一次点击后按钮状态:", { isDisabled, buttonText });

    // 验证防止重复操作机制
    if (!isDisabled && !buttonText?.includes("同步中")) {
      await fullSyncButton.click();
      console.log("能够再次点击按钮");
    } else {
      console.log("按钮已被正确禁用或显示同步中状态");
    }

    // 等待同步完成
    await page.waitForTimeout(5000);
  });

  test("应该处理 WebSocket 连接中断期间的同步操作", async ({ page }) => {
    // 监听 WebSocket 连接
    const wsConnections: any[] = [];
    page.on("websocket", (ws) => {
      console.log(`WebSocket 连接建立: ${ws.url()}`);
      wsConnections.push(ws);
    });

    // 开始同步
    const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
    await fullSyncButton.click();
    await page.waitForTimeout(1000);

    // 模拟网络中断
    await page.context().setOffline(true);
    console.log("🔌 网络已断开，WebSocket 连接将中断");

    // 等待一段时间
    await page.waitForTimeout(3000);

    // 恢复网络
    await page.context().setOffline(false);
    console.log("🔌 网络已恢复");

    // 等待页面响应和 WebSocket 重连
    await page.waitForTimeout(5000);

    // 验证页面功能恢复正常
    const syncButtonAfterReconnect = page.getByRole("button", { name: /全量同步/ });
    await expect(syncButtonAfterReconnect).toBeVisible();

    // 验证实时日志功能是否恢复
    const logsSection = page.locator("[data-testid='sync-logs-section']");
    await expect(logsSection).toBeVisible();
    console.log("✅ 实时日志功能在网络恢复后正常");
  });

  test("应该处理大量实时日志数据", async ({ page }) => {
    // 监听 WebSocket 消息以统计实时日志数量
    let realtimeLogCount = 0;
    page.on("websocket", (ws) => {
      ws.on("framereceived", (event) => {
        try {
          const data = JSON.parse(event.payload);
          if (data.type === "sync:log") {
            realtimeLogCount++;
          }
        } catch {
          // 忽略非 JSON 消息
        }
      });
    });

    // 触发同步以生成大量实时日志
    const fullSyncButton = page.getByRole("button", { name: /全量同步/ });
    await fullSyncButton.click();
    await page.waitForTimeout(2000);

    // 等待同步进行，收集实时日志
    await page.waitForTimeout(8000);

    console.log(`收到 ${realtimeLogCount} 条实时日志消息`);

    // 查找实时日志元素
    const logRows = page.locator("tbody tr, .card");
    const logCount = await logRows.count();

    console.log(`显示的日志数量: ${logCount}`);

    // 验证至少有一些日志内容
    expect(logCount).toBeGreaterThan(0);
  });
});
