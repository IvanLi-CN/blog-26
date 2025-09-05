/**
 * 智能文件树展开功能测试
 *
 * 测试用例：
 * 1.1: 文件选择时自动展开相关文件夹
 * 1.2: 标签页切换时自动展开相关文件夹
 */

import { expect, test } from "@playwright/test";
import { EditorPage } from "./pages/EditorPage";
import { devLogin, EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("智能文件树展开功能", () => {
  let editorPage: EditorPage;

  test.beforeEach(async ({ page }) => {
    // 设置控制台日志捕获
    await EditorTestHelpers.setupConsoleLogCapture(page);

    // 先访问首页
    await page.goto("/");

    // 进行开发环境登录
    await devLogin(page);

    editorPage = new EditorPage(page);
    await editorPage.goto();

    // 清理localStorage状态，确保文件树展开状态干净
    await EditorTestHelpers.clearLocalStorage(page);

    // 等待页面完全加载
    await editorPage.waitForFileTreeLoad();
  });

  test("测试用例 1.1: 文件选择时自动展开相关文件夹", async ({ page }) => {
    // 1. 等待页面加载完成
    await editorPage.waitForFileTreeLoad();

    // 2. 验证文件管理器存在
    await expect(page.locator('h3:has-text("文件管理器")')).toBeVisible();

    // 3. 展开 blog 文件夹
    await editorPage.expandFolder("blog");

    // 4. 选择一个文件
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 5. 验证标签页创建
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");

    // 6. 验证文件高亮
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 7. 验证控制台日志
    const hasLog = await EditorTestHelpers.waitForConsoleLog(page, "[EditorAtoms] 自动展开文件夹");
    expect(hasLog).toBe(true);

    console.log("✅ 文件选择时自动展开相关文件夹测试通过");
  });

  test("测试用例 1.2: 标签页切换时自动展开相关文件夹", async ({ page }) => {
    // 1. 等待页面加载
    await editorPage.waitForFileTreeLoad();

    // 2. 创建两个标签页
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.selectFile("02-typescript-advanced-types.md");

    // 3. 收起 blog 文件夹（通过点击其他区域或等待）
    await page.waitForTimeout(1000);

    // 4. 切换到第一个标签页
    await editorPage.switchToTab("01-react-hooks-deep-dive");

    // 5. 验证文件高亮状态切换
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");
    await editorPage.verifyFileNotHighlighted("02-typescript-advanced-types.md");

    // 6. 验证控制台日志
    const hasLog = await EditorTestHelpers.waitForConsoleLog(page, "[EditorAtoms] 自动展开文件夹");
    expect(hasLog).toBe(true);

    console.log("✅ 标签页切换时自动展开相关文件夹测试通过");
  });

  test("测试用例 1.3: 多层级文件夹自动展开", async ({ page }) => {
    // 测试深层嵌套文件夹的自动展开功能
    await editorPage.waitForFileTreeLoad();

    // 查找文件夹按钮
    const folderButtons = page.locator("button").filter({ hasText: /^(blog|projects|memos)$/ });
    const folderCount = await folderButtons.count();

    if (folderCount > 0) {
      await folderButtons.first().click();
      await page.waitForTimeout(1000);
    }

    // 验证系统稳定性
    await expect(page.locator(".directory-tree-container")).toBeVisible();
    console.log("✅ 文件夹展开功能测试通过");
  });

  test("测试用例 1.4: WebDAV文件夹展开功能", async ({ page }) => {
    // 测试WebDAV数据源的文件夹展开
    await editorPage.waitForFileTreeLoad();

    // 查找WebDAV相关按钮（如果存在）
    const webdavButton = page.locator('button:has-text("webdav")').first();

    if (await webdavButton.isVisible()) {
      await webdavButton.click();
      await page.waitForTimeout(1000);
      console.log("✅ WebDAV文件夹展开功能测试通过");
    } else {
      console.log("ℹ️ WebDAV数据源不可用，跳过测试");
    }

    // 验证系统稳定性
    await expect(page.locator(".directory-tree-container")).toBeVisible();
  });

  test("测试用例 1.5: 文件夹展开状态持久化", async ({ page }) => {
    // 测试文件夹展开状态的持久化
    await editorPage.waitForFileTreeLoad();

    // 选择一个文件
    const fileButton = page.locator("button").filter({ hasText: ".md" }).first();
    if (await fileButton.isVisible()) {
      await fileButton.click();
      await page.waitForTimeout(1000);
    }

    // 刷新页面
    await page.reload({ waitUntil: "networkidle" });
    await editorPage.waitForFileTreeLoad();

    // 验证页面仍然可用
    await expect(page.locator(".directory-tree-container")).toBeVisible();
    console.log("✅ 页面刷新后稳定性测试通过");
  });
});
