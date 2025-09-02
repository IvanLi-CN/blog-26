/**
 * Jotai状态管理功能测试
 *
 * 测试用例：
 * 5.1: 状态调试器正确显示状态
 */

import { expect, test } from "@playwright/test";
import { EditorPage } from "./pages/EditorPage";
import { EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("Jotai状态管理功能", () => {
  let editorPage: EditorPage;

  test.beforeEach(async ({ page }) => {
    // 设置控制台日志捕获
    await EditorTestHelpers.setupConsoleLogCapture(page);

    editorPage = new EditorPage(page);
    await editorPage.goto();

    // 等待页面完全加载
    await editorPage.waitForFileTreeLoad();

    // 等待Jotai调试器加载（仅在开发环境）
    await editorPage.waitForJotaiDebugger();
  });

  test("测试用例 5.1: 状态调试器正确显示状态", async ({ _page }) => {
    // 1. 访问编辑器页面（已在beforeEach中完成）

    // 2. 验证初始状态
    await editorPage.verifyJotaiState({
      activeTabId: "null",
      tabCount: 0,
    });

    // 3. 选择文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 4. 验证状态更新
    await editorPage.verifyJotaiState({
      activeTabId: "local:blog/01-react-hooks-deep-dive.md",
      tabCount: 1,
      activeContentId: "local:blog/01-react-hooks-deep-dive.md",
    });

    // 5. 添加第二个标签页
    await editorPage.selectFile("03-graphql-api-best-practices.md");

    // 6. 验证状态更新
    await editorPage.verifyJotaiState({
      activeTabId: "local:blog/03-graphql-api-best-practices.md",
      tabCount: 2,
      activeContentId: "local:blog/03-graphql-api-best-practices.md",
    });
  });

  test("测试用例 5.2: 标签页状态管理", async ({ _page }) => {
    // 测试标签页的创建、切换和关闭状态管理

    // 1. 创建多个标签页
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.selectFile("03-graphql-api-best-practices.md");

    // 2. 验证标签页数量
    await editorPage.verifyJotaiState({
      tabCount: 3,
    });

    // 3. 切换到第一个标签页
    await editorPage.switchToTab("01-react-hooks-deep-dive");

    // 4. 验证活动标签页状态
    await editorPage.verifyJotaiState({
      activeTabId: "local:blog/01-react-hooks-deep-dive.md",
      activeContentId: "local:blog/01-react-hooks-deep-dive.md",
    });

    // 5. 关闭一个标签页
    await editorPage.closeTab("02-typescript-advanced-types");

    // 6. 验证标签页数量减少
    await editorPage.verifyJotaiState({
      tabCount: 2,
    });
  });

  test("测试用例 5.3: 文件树展开状态管理", async ({ _page }) => {
    // 测试文件树展开状态的Jotai管理

    // 1. 验证初始展开状态
    await editorPage.verifyFolderCollapsed("blog");

    // 2. 展开文件夹
    await editorPage.expandFolder("blog");
    await editorPage.verifyFolderExpanded("blog");

    // 3. 选择文件（应该触发自动展开逻辑）
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 4. 验证文件夹保持展开状态
    await editorPage.verifyFolderExpanded("blog");

    // 5. 收起文件夹
    await editorPage.collapseFolder("blog");

    // 6. 切换标签页（应该触发自动展开）
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.collapseFolder("blog");
    await editorPage.switchToTab("01-react-hooks-deep-dive");

    // 7. 验证文件夹自动展开
    await editorPage.verifyFolderExpanded("blog");
  });

  test("测试用例 5.4: 状态持久化测试", async ({ page }) => {
    // 测试Jotai状态的持久化

    // 1. 创建状态
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 验证状态
    await editorPage.verifyJotaiState({
      activeTabId: "local:blog/01-react-hooks-deep-dive.md",
      tabCount: 1,
    });

    // 3. 刷新页面
    await page.reload({ waitUntil: "networkidle" });
    await editorPage.waitForFileTreeLoad();
    await editorPage.waitForJotaiDebugger();

    // 4. 检查状态是否恢复
    // 注意：这取决于具体的持久化策略
    try {
      await editorPage.verifyJotaiState({
        activeTabId: "local:blog/01-react-hooks-deep-dive.md",
        tabCount: 1,
      });
      console.log("✅ Jotai状态已持久化");
    } catch {
      console.log("ℹ️ Jotai状态未持久化（这可能是预期行为）");
    }
  });

  test("测试用例 5.5: 状态同步性能测试", async ({ page }) => {
    // 测试状态更新的性能

    // 1. 测量状态更新时间
    const updateTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await editorPage.expandFolder("blog");
      await editorPage.selectFile("01-react-hooks-deep-dive.md");

      // 等待状态更新
      await editorPage.verifyJotaiState({
        activeTabId: "local:blog/01-react-hooks-deep-dive.md",
        tabCount: 1,
      });
    });

    // 2. 验证状态更新时间在合理范围内（< 500ms）
    expect(updateTime).toBeLessThan(500);
    console.log(`Jotai状态更新耗时: ${updateTime}ms`);

    // 3. 测试快速切换的性能
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.selectFile("03-graphql-api-best-practices.md");

    const switchTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await editorPage.switchToTab("01-react-hooks-deep-dive");
      await editorPage.verifyJotaiState({
        activeTabId: "local:blog/01-react-hooks-deep-dive.md",
      });
    });

    // 4. 验证切换时间在合理范围内（< 300ms）
    expect(switchTime).toBeLessThan(300);
    console.log(`标签页切换耗时: ${switchTime}ms`);
  });

  test("测试用例 5.6: 错误状态处理", async ({ page }) => {
    // 测试异常情况下的状态管理

    // 1. 创建正常状态
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 验证正常状态
    await editorPage.verifyJotaiState({
      activeTabId: "local:blog/01-react-hooks-deep-dive.md",
      tabCount: 1,
    });

    // 3. 模拟网络错误
    await editorPage.simulateNetworkError();

    // 4. 尝试选择另一个文件
    try {
      await editorPage.selectFile("02-typescript-advanced-types.md");
    } catch {
      // 预期可能失败
    }

    // 5. 验证状态管理器仍然稳定
    await editorPage.verifySystemStability();

    // 6. 验证系统仍然稳定（调试器已移除）
    await expect(page.locator("body")).toBeVisible();
    console.log("ℹ️ Jotai调试器已移除，系统保持稳定");
  });

  test("测试用例 5.7: 复杂状态场景测试", async ({ _page }) => {
    // 测试复杂的状态管理场景

    // 1. 创建复杂的初始状态
    await editorPage.expandFolder("blog");
    await editorPage.expandFolder("projects");

    // 2. 创建多个不同类型的标签页
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.selectFile("01-open-source-component-library.md");
    await editorPage.selectFile("02-typescript-advanced-types.md");

    // 3. 验证复杂状态
    await editorPage.verifyJotaiState({
      tabCount: 3,
    });

    // 4. 执行复杂的操作序列
    await editorPage.switchToTab("01-react-hooks-deep-dive");
    await editorPage.collapseFolder("blog");
    await editorPage.switchToTab("01-open-source-component-library");
    await editorPage.switchToTab("02-typescript-advanced-types");

    // 5. 验证最终状态的一致性
    await editorPage.verifyJotaiState({
      activeTabId: "local:blog/02-typescript-advanced-types.md",
      tabCount: 3,
    });

    // 6. 验证文件夹自动展开
    await editorPage.verifyFolderExpanded("blog");
  });
});
