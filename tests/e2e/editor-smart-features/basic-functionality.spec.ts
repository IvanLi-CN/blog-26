/**
 * 基本功能测试
 *
 * 验证编辑器的基本功能是否正常工作
 */

import { expect, test } from "@playwright/test";
import { devLogin } from "./utils/editor-test-helpers";

test.describe("编辑器基本功能测试", () => {
  test.beforeEach(async ({ page }) => {
    // 先访问首页
    await page.goto("/");

    // 进行开发环境登录
    await devLogin(page);

    // 访问编辑器页面
    await page.goto("/admin/posts/editor");
    await page.waitForLoadState("networkidle");
    // 等待页面完全加载
    await page.waitForTimeout(5000);
  });

  test("测试用例: 页面基本加载", async ({ page }) => {
    // 1. 验证页面标题（不再是登录页面）
    const title = await page.title();
    expect(title).not.toContain("管理员登录");

    // 2. 验证数据源按钮存在
    await expect(page.locator('button:has-text("LOCAL")')).toBeVisible();
    await expect(page.locator('button:has-text("WEBDAV")')).toBeVisible();

    // 3. 验证页面基本功能（Jotai调试器已移除）
    // 检查页面是否正常加载，没有错误
    const bodyElement = page.locator("body");
    await expect(bodyElement).toBeVisible();

    console.log("✅ 页面基本加载测试通过");
  });

  test("测试用例: 文件选择功能", async ({ page }) => {
    // 1. 先展开LOCAL数据源
    const localButton = page.locator('button:has-text("LOCAL")');
    await localButton.click();
    await page.waitForTimeout(2000);

    // 2. 展开blog文件夹
    const blogFolder = page.locator('button:has-text("blog")');
    await blogFolder.click();
    await page.waitForTimeout(2000);

    // 3. 等待.md文件出现
    await page.waitForSelector('button:has-text(".md")', { timeout: 10000 });

    // 4. 点击第一个.md文件
    const fileButton = page.locator('button:has-text(".md")').first();
    await fileButton.click();

    // 5. 等待状态更新
    await page.waitForTimeout(3000);

    // 6. 验证URL更新
    expect(page.url()).toContain("source=");
    expect(page.url()).toContain("path=");

    // 7. 验证Jotai状态更新
    const activeTab = page.locator("text=活动标签页ID:");
    await expect(activeTab).toBeVisible();

    console.log("✅ 文件选择功能测试通过");
  });

  test("测试用例: 标签页创建", async ({ page }) => {
    // 1. 先展开LOCAL数据源
    const localButton = page.locator('button:has-text("LOCAL")');
    await localButton.click();
    await page.waitForTimeout(2000);

    // 2. 展开blog文件夹
    const blogFolder = page.locator('button:has-text("blog")');
    await blogFolder.click();
    await page.waitForTimeout(2000);

    // 3. 等待文件按钮出现
    await page.waitForSelector('button:has-text(".md")', { timeout: 10000 });

    // 4. 点击一个文件
    const fileButton = page.locator('button:has-text("01-react-hooks-deep-dive.md")').first();
    await fileButton.click();

    // 5. 等待标签页创建
    await page.waitForTimeout(3000);

    // 6. 验证标签页存在（使用更具体的选择器）
    const tab = page.locator(".editor-tab-active");
    await expect(tab).toBeVisible();

    // 7. 验证标签页数量在调试器中显示
    const tabCount = page.locator("text=标签页数量: 1");
    await expect(tabCount).toBeVisible();

    console.log("✅ 标签页创建功能测试通过");
  });

  test("测试用例: 多文件选择", async ({ page }) => {
    // 1. 先展开LOCAL数据源
    const localButton = page.locator('button:has-text("LOCAL")');
    await localButton.click();
    await page.waitForTimeout(2000);

    // 2. 展开blog文件夹
    const blogFolder = page.locator('button:has-text("blog")');
    await blogFolder.click();
    await page.waitForTimeout(2000);

    // 3. 等待文件按钮出现
    await page.waitForSelector('button:has-text(".md")', { timeout: 10000 });

    // 4. 选择第一个文件
    const firstFile = page.locator('button:has-text("01-react-hooks-deep-dive.md")').first();
    await firstFile.click();
    await page.waitForTimeout(2000);

    // 5. 选择第二个文件
    const secondFile = page.locator('button:has-text("02-typescript-advanced-types.md")').first();
    await secondFile.click();
    await page.waitForTimeout(2000);

    // 6. 验证标签页数量
    const tabCount = page.locator("text=标签页数量: 2");
    await expect(tabCount).toBeVisible();

    // 7. 验证两个标签页都存在
    const tabs = page.locator('button:has-text("✕")');
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);

    console.log("✅ 多文件选择功能测试通过");
  });

  test("测试用例: URL状态同步", async ({ page }) => {
    // 1. 先展开LOCAL数据源
    const localButton = page.locator('button:has-text("LOCAL")');
    await localButton.click();
    await page.waitForTimeout(2000);

    // 2. 展开blog文件夹
    const blogFolder = page.locator('button:has-text("blog")');
    await blogFolder.click();
    await page.waitForTimeout(2000);

    // 3. 等待文件按钮出现
    await page.waitForSelector('button:has-text(".md")', { timeout: 10000 });

    // 4. 点击一个文件
    const fileButton = page.locator('button:has-text("01-react-hooks-deep-dive.md")').first();
    await fileButton.click();
    await page.waitForTimeout(3000);

    // 5. 验证URL包含正确的参数
    const url = page.url();
    expect(url).toContain("source=local");
    expect(url).toContain("path=blog%252F01-react-hooks-deep-dive.md");

    // 6. 刷新页面验证状态恢复
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    // 7. 验证状态恢复
    const activeTab = page.locator("text=活动标签页ID: local:blog/01-react-hooks-deep-dive.md");
    await expect(activeTab).toBeVisible();

    console.log("✅ URL状态同步功能测试通过");
  });

  test("测试用例: 控制台日志验证", async ({ page }) => {
    // 1. 监听控制台日志
    const logs: string[] = [];
    page.on("console", (msg) => {
      logs.push(msg.text());
    });

    // 2. 先展开LOCAL数据源
    const localButton = page.locator('button:has-text("LOCAL")');
    await localButton.click();
    await page.waitForTimeout(2000);

    // 3. 展开blog文件夹
    const blogFolder = page.locator('button:has-text("blog")');
    await blogFolder.click();
    await page.waitForTimeout(2000);

    // 4. 等待文件按钮出现
    await page.waitForSelector('button:has-text(".md")', { timeout: 10000 });

    // 5. 点击一个文件
    const fileButton = page.locator('button:has-text("01-react-hooks-deep-dive.md")').first();
    await fileButton.click();
    await page.waitForTimeout(3000);

    // 6. 验证关键日志存在
    const hasEditorLog = logs.some((log) => log.includes("[EditorAtoms]"));
    const hasScrollLog = logs.some((log) => log.includes("[DirectoryTree]"));
    const hasUrlLog = logs.some((log) => log.includes("[UrlSyncManager]"));

    expect(hasEditorLog).toBe(true);
    expect(hasScrollLog).toBe(true);
    expect(hasUrlLog).toBe(true);

    console.log("✅ 控制台日志验证测试通过");
    console.log(`捕获到 ${logs.length} 条日志`);
  });
});
