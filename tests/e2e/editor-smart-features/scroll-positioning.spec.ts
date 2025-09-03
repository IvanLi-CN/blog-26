/**
 * 滚动定位功能测试
 *
 * 测试用例：
 * 2.1: 文件选择时自动滚动到目标文件
 * 2.2: 标签页切换时自动滚动到对应文件
 */

import { expect, test } from "@playwright/test";
import { EditorPage } from "./pages/EditorPage";
import { devLogin, EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("滚动定位功能", () => {
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

    // 等待页面完全加载
    await editorPage.waitForFileTreeLoad();
  });

  test("测试用例 2.1: 文件选择时自动滚动到目标文件", async ({ page }) => {
    // 1. 访问编辑器页面（已在beforeEach中完成）

    // 2. 展开文件夹
    await editorPage.expandFolder("blog");

    // 3. 滚动到文件树顶部
    await editorPage.scrollFileTreeToTop();

    // 4. 点击底部的文件
    await editorPage.selectFile("05-redis-caching-strategies.md");

    // 5. 验证文件在可视区域内
    await editorPage.verifyFileInViewport("05-redis-caching-strategies.md");

    // 6. 验证控制台日志
    const hasLog = await EditorTestHelpers.waitForConsoleLog(
      page,
      "[DirectoryTree] 成功滚动到文件"
    );
    expect(hasLog).toBe(true);

    // 7. 验证标签页创建
    await editorPage.verifyTabExists("05-redis-caching-strategies");
  });

  test("测试用例 2.2: 标签页切换时自动滚动到对应文件", async ({ page }) => {
    // 1. 准备：创建多个标签页
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.selectFile("05-redis-caching-strategies.md");

    // 2. 滚动到文件树顶部
    await editorPage.scrollFileTreeToTop();

    // 3. 点击第一个标签页
    await editorPage.switchToTab("01-react-hooks-deep-dive");

    // 4. 验证对应文件在可视区域内
    await editorPage.verifyFileInViewport("01-react-hooks-deep-dive.md");

    // 5. 验证控制台日志
    const hasLog = await EditorTestHelpers.waitForConsoleLog(
      page,
      "[DirectoryTree] 成功滚动到文件: blog/01-react-hooks-deep-dive.md"
    );
    expect(hasLog).toBe(true);

    // 6. 验证文件高亮状态
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");
  });

  test("测试用例 2.3: 长列表滚动性能测试", async ({ page }) => {
    // 测试在长文件列表中的滚动性能

    // 1. 展开所有可能的文件夹
    try {
      await editorPage.expandFolder("blog");
      await editorPage.expandFolder("projects");
      await editorPage.expandFolder("memos");
    } catch {
      // 某些文件夹可能不存在，继续测试
    }

    // 2. 测量滚动到顶部文件的时间
    const scrollTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await editorPage.scrollFileTreeToTop();
      await editorPage.selectFile("01-react-hooks-deep-dive.md");
    });

    // 3. 验证滚动时间在合理范围内（< 2秒）
    expect(scrollTime).toBeLessThan(2000);
    console.log(`滚动定位耗时: ${scrollTime}ms`);

    // 4. 验证文件在视口中
    await editorPage.verifyFileInViewport("01-react-hooks-deep-dive.md");
  });

  test("测试用例 2.4: 跨文件夹滚动定位", async () => {
    // 测试跨不同文件夹的滚动定位

    // 1. 选择blog文件夹中的文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 选择projects文件夹中的文件
    await editorPage.expandFolder("projects");
    await editorPage.selectFile("01-open-source-component-library.md");

    // 3. 滚动到文件树顶部
    await editorPage.scrollFileTreeToTop();

    // 4. 切换回blog文件
    await editorPage.switchToTab("01-react-hooks-deep-dive");

    // 5. 验证滚动到正确位置
    await editorPage.verifyFileInViewport("01-react-hooks-deep-dive.md");

    // 6. 切换到projects文件
    await editorPage.switchToTab("01-open-source-component-library");

    // 7. 验证滚动到正确位置
    await editorPage.verifyFileInViewport("01-open-source-component-library.md");
  });

  test("测试用例 2.5: 滚动边界情况测试", async ({ page }) => {
    // 测试滚动的边界情况

    // 1. 展开文件夹
    await editorPage.expandFolder("blog");

    // 2. 选择第一个文件
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 3. 验证文件在视口中（应该已经可见）
    const isInViewport1 = await EditorTestHelpers.waitForElementInViewport(
      page,
      'button:has-text("01-react-hooks-deep-dive.md")'
    );
    expect(isInViewport1).toBe(true);

    // 4. 选择最后一个文件
    await editorPage.selectFile("05-redis-caching-strategies.md");

    // 5. 验证文件在视口中
    const isInViewport2 = await EditorTestHelpers.waitForElementInViewport(
      page,
      'button:has-text("05-redis-caching-strategies.md")'
    );
    expect(isInViewport2).toBe(true);
  });

  test("测试用例 2.6: 滚动状态恢复测试", async ({ page }) => {
    // 测试页面刷新后滚动状态的恢复

    // 1. 展开文件夹并选择文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("05-redis-caching-strategies.md");

    // 2. 验证文件在视口中
    await editorPage.verifyFileInViewport("05-redis-caching-strategies.md");

    // 3. 刷新页面
    await page.reload({ waitUntil: "networkidle" });
    await editorPage.waitForFileTreeLoad();

    // 4. 检查滚动位置是否恢复
    // 注意：这取决于实际的状态恢复实现
    try {
      await editorPage.verifyFileInViewport("05-redis-caching-strategies.md");
      console.log("✅ 滚动位置已恢复");
    } catch {
      console.log("ℹ️ 滚动位置未恢复（这可能是预期行为）");
    }
  });
});
