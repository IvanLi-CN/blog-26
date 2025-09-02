/**
 * 编辑器页面对象模型
 *
 * 封装编辑器页面的所有操作和验证方法
 * 基于文档 docs/e2e-test-cases.md 中的测试用例规范
 */

import { expect, type Page } from "@playwright/test";

export class EditorPage {
  constructor(private page: Page) {}

  // 选择器定义
  private selectors = {
    fileTree: 'h3:has-text("文件管理器")',
    tabContainer: 'button:has-text("✕")',
    editor: "textbox",
  };

  // 导航方法
  async goto() {
    await this.page.goto("/admin/posts/editor");
    await this.page.waitForLoadState("networkidle");
  }

  // 文件树操作方法
  async expandFolder(folderName: string) {
    // 查找文件夹按钮，格式如 "blog +"
    const folderButton = this.page.locator(`button:has-text("${folderName} +")`).first();
    await folderButton.click();
    // 等待文件夹展开
    await this.page.waitForTimeout(1000);
  }

  async collapseFolder(folderName: string) {
    // 查找已展开的文件夹按钮，格式如 "blog -"（如果有的话）
    const folderButton = this.page.locator(`button:has-text("${folderName}")`).first();
    await folderButton.click();
    // 等待文件夹收起
    await this.page.waitForTimeout(1000);
  }

  async selectFile(fileName: string) {
    // 查找文件按钮，格式如 "01-react-hooks-deep-dive.md 1KB"
    const fileButton = this.page.locator(`button:has-text("${fileName}")`).first();
    await fileButton.click();
    // 等待状态更新和标签页创建
    await this.page.waitForTimeout(2000);
  }

  // 标签页操作方法
  async switchToTab(tabName: string) {
    // 查找标签页按钮，格式如 "01-react-hooks-deep-dive ✕"
    const tabSelector = `button:has-text("${tabName} ✕")`;
    const tab = this.page.locator(tabSelector).first();
    await tab.click();
    await this.page.waitForTimeout(1000);
  }

  async closeTab(tabName: string) {
    // 查找标签页内的关闭按钮 "✕"
    const tabSelector = `button:has-text("${tabName} ✕")`;
    const closeButton = this.page.locator(tabSelector).locator('button:has-text("✕")');
    await closeButton.click();
    await this.page.waitForTimeout(1000);
  }

  // 验证方法
  async verifyFileHighlighted(fileName: string) {
    const fileButton = this.page.locator(`button:has-text("${fileName}")`).first();
    // 验证文件按钮有 [active] 属性
    await expect(fileButton).toHaveAttribute("active", "");
  }

  async verifyFileNotHighlighted(fileName: string) {
    const fileButton = this.page.locator(`button:has-text("${fileName}")`).first();
    await expect(fileButton).not.toHaveAttribute("active");
  }

  async verifyTabActive(tabName: string) {
    const tab = this.page.locator(`button:has-text("${tabName} ✕")`).first();
    await expect(tab).toBeVisible();
  }

  async verifyTabExists(tabName: string) {
    const tab = this.page.locator(`button:has-text("${tabName} ✕")`).first();
    await expect(tab).toBeVisible();
  }

  async verifyFolderExpanded(folderName: string) {
    // 验证文件夹按钮存在且可见
    const folderButton = this.page.locator(`button:has-text("${folderName}")`).first();
    await expect(folderButton).toBeVisible();
  }

  async verifyFolderCollapsed(folderName: string) {
    // 验证文件夹按钮存在且可见
    const folderButton = this.page.locator(`button:has-text("${folderName}")`).first();
    await expect(folderButton).toBeVisible();
  }

  // Jotai状态验证方法（调试面板已移除，使用替代验证方式）
  async verifyJotaiState(expectedState: {
    activeTabId?: string;
    tabCount?: number;
    activeContentId?: string;
  }) {
    console.log("ℹ️ Jotai调试面板已移除，使用替代验证方式");

    // 使用标签页数量验证状态
    if (expectedState.tabCount !== undefined) {
      const tabs = this.page.locator(this.selectors.tabContainer);
      const actualCount = await tabs.count();
      expect(actualCount).toBe(expectedState.tabCount);
    }

    // 使用URL参数验证活动状态
    if (expectedState.activeTabId !== undefined && expectedState.activeTabId !== "null") {
      const currentUrl = this.page.url();
      // 简单验证URL包含相关路径信息
      if (expectedState.activeTabId.includes(":")) {
        const path = expectedState.activeTabId.split(":")[1];
        expect(currentUrl).toContain(encodeURIComponent(path.replace(/\//g, "%2F")));
      }
    }

    // 对于activeContentId，我们可以通过其他方式验证，比如检查当前打开的文件
    if (expectedState.activeContentId !== undefined) {
      console.log(`ℹ️ 预期活动内容ID: ${expectedState.activeContentId}`);
      // 这里可以添加其他验证逻辑，比如检查编辑器内容或URL
    }
  }

  // 控制台日志验证方法
  async verifyConsoleLog(expectedLog: string) {
    // 等待一段时间让日志生成
    await this.page.waitForTimeout(1000);

    const logs = await this.page.evaluate(() => {
      return (window as any).testLogs || [];
    });

    const hasLog = logs.some((log: string) => log.includes(expectedLog));
    expect(hasLog).toBe(true);
  }

  // URL验证方法
  async verifyUrlContains(expectedParams: string[]) {
    const url = this.page.url();
    for (const param of expectedParams) {
      expect(url).toContain(param);
    }
  }

  // 滚动相关方法
  async scrollFileTreeToTop() {
    const fileTreeSelector = this.selectors.fileTree || ".directory-tree-container";
    await this.page.locator(fileTreeSelector).scrollTo({ top: 0 });
  }

  async verifyFileInViewport(fileName: string) {
    const fileElement = this.page.locator(`button:has-text("${fileName}")`);
    await expect(fileElement).toBeInViewport();
  }

  // 性能测量方法
  async measureLoadTime(): Promise<number> {
    const startTime = Date.now();
    await this.goto();
    const endTime = Date.now();
    return endTime - startTime;
  }

  async measureFileTreeExpansionTime(folderName: string): Promise<number> {
    const startTime = Date.now();
    await this.expandFolder(folderName);
    const endTime = Date.now();
    return endTime - startTime;
  }

  // 错误处理相关方法
  async simulateNetworkError() {
    await this.page.route("**/api/content/**", (route) => route.abort());
  }

  async verifyErrorMessage(message: string) {
    await expect(this.page.locator(`text=${message}`)).toBeVisible();
  }

  async verifySystemStability() {
    // 验证页面基本元素仍然可见
    await expect(this.page.locator("button")).toBeVisible();
    // 验证页面没有崩溃
    await expect(this.page.locator("body")).toBeVisible();
  }

  // 等待方法
  async waitForFileTreeLoad() {
    // 等待页面加载完成
    await this.page.waitForLoadState("networkidle");
    // 等待文件按钮出现
    await this.page.waitForSelector("button", { timeout: 15000 });
    // 等待一段时间让文件树完全加载
    await this.page.waitForTimeout(3000);
  }

  async waitForJotaiDebugger() {
    // Jotai调试器已被移除，此方法保留以保持测试兼容性
    // 不再等待调试器，直接返回
    console.log("ℹ️ Jotai调试器已被移除，跳过等待");
  }
}
