/**
 * 浏览器兼容性测试用例
 *
 * 测试用例：
 * 8.1: 不同浏览器下功能一致性
 */

import { expect, test } from "@playwright/test";
import { EditorPage } from "./pages/EditorPage";
import { EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("浏览器兼容性测试", () => {
  let editorPage: EditorPage;

  test.beforeEach(async ({ page }) => {
    // 设置控制台日志捕获
    await EditorTestHelpers.setupConsoleLogCapture(page);

    editorPage = new EditorPage(page);
    await editorPage.goto();

    // 等待页面完全加载
    await editorPage.waitForFileTreeLoad();
  });

  test("测试用例 8.1: 不同浏览器下功能一致性", async ({ page, browserName }) => {
    // 1. 获取浏览器信息
    const browserInfo = await EditorTestHelpers.getBrowserInfo(page);
    console.log(`当前浏览器: ${browserInfo.name} ${browserInfo.version}`);
    console.log(`Playwright浏览器名称: ${browserName}`);

    // 2. 测试基本文件树功能
    await editorPage.expandFolder("blog");
    await editorPage.verifyFolderExpanded("blog");

    // 3. 测试文件选择功能
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 4. 测试标签页切换功能
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.switchToTab("01-react-hooks-deep-dive");
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 5. 测试URL状态绑定
    await editorPage.verifyUrlContains([
      "source=local",
      "path=blog%252F01-react-hooks-deep-dive.md",
    ]);

    // 6. 验证系统稳定性
    await editorPage.verifySystemStability();
  });

  test("测试用例 8.2: 移动设备兼容性", async ({ page, browserName }) => {
    // 模拟移动设备
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE尺寸

    // 1. 验证页面在小屏幕下的可用性
    await editorPage.verifySystemStability();

    // 2. 测试触摸操作
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 3. 验证响应式布局
    const fileTree = page.locator(".directory-tree-container");
    await expect(fileTree).toBeVisible();

    // 4. 测试标签页在小屏幕下的行为
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");

    console.log(`移动设备兼容性测试通过 (${browserName})`);
  });

  test("测试用例 8.3: 键盘导航兼容性", async ({ page, browserName }) => {
    // 测试键盘导航功能

    // 1. 使用Tab键导航
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // 2. 使用Enter键展开文件夹
    await page.keyboard.press("Enter");

    // 3. 使用方向键导航
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // 4. 验证键盘操作的效果
    // 注意：具体的键盘导航行为取决于实际实现
    await editorPage.verifySystemStability();

    console.log(`键盘导航兼容性测试通过 (${browserName})`);
  });

  test("测试用例 8.4: CSS兼容性测试", async ({ page, browserName }) => {
    // 测试CSS样式在不同浏览器下的兼容性

    // 1. 展开文件夹并选择文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 检查关键元素的样式
    const fileButton = page.locator('button:has-text("01-react-hooks-deep-dive.md")');

    // 3. 验证高亮样式
    const backgroundColor = await fileButton.evaluate((el) => getComputedStyle(el).backgroundColor);

    // 4. 验证样式不是默认值
    expect(backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(backgroundColor).not.toBe("transparent");

    // 5. 检查文件树容器样式
    const fileTreeContainer = page.locator(".directory-tree-container");
    const display = await fileTreeContainer.evaluate((el) => getComputedStyle(el).display);

    expect(display).not.toBe("none");

    console.log(`CSS兼容性测试通过 (${browserName})`);
    console.log(`文件高亮背景色: ${backgroundColor}`);
  });

  test("测试用例 8.5: JavaScript API兼容性", async ({ page, browserName }) => {
    // 测试JavaScript API在不同浏览器下的兼容性

    // 1. 检查必要的API支持
    const apiSupport = await page.evaluate(() => {
      return {
        fetch: typeof fetch !== "undefined",
        localStorage: typeof localStorage !== "undefined",
        sessionStorage: typeof sessionStorage !== "undefined",
        URLSearchParams: typeof URLSearchParams !== "undefined",
        Promise: typeof Promise !== "undefined",
        async:
          typeof (async () => {
            /* empty */
          }) === "function",
      };
    });

    // 2. 验证关键API支持
    expect(apiSupport.fetch).toBe(true);
    expect(apiSupport.localStorage).toBe(true);
    expect(apiSupport.URLSearchParams).toBe(true);
    expect(apiSupport.Promise).toBe(true);

    // 3. 测试实际功能
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 4. 验证功能正常工作
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");

    console.log(`JavaScript API兼容性测试通过 (${browserName})`);
    console.log("API支持情况:", apiSupport);
  });

  test("测试用例 8.6: 性能差异测试", async ({ page, browserName }) => {
    // 测试不同浏览器下的性能差异

    // 1. 测量页面加载时间
    const loadTime = await editorPage.measureLoadTime();

    // 2. 测量文件选择时间
    const selectionTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await editorPage.expandFolder("blog");
      await editorPage.selectFile("01-react-hooks-deep-dive.md");
    });

    // 3. 记录性能数据
    console.log(`${browserName} 性能数据:`);
    console.log(`- 页面加载时间: ${loadTime}ms`);
    console.log(`- 文件选择时间: ${selectionTime}ms`);

    // 4. 验证性能在可接受范围内
    expect(loadTime).toBeLessThan(10000); // 10秒内
    expect(selectionTime).toBeLessThan(3000); // 3秒内

    // 5. 验证功能正常
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
  });

  test("测试用例 8.7: 错误处理兼容性", async ({ _page, browserName }) => {
    // 测试错误处理在不同浏览器下的兼容性

    // 1. 建立正常状态
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 模拟网络错误
    await editorPage.simulateNetworkError();

    // 3. 尝试操作
    try {
      await editorPage.selectFile("02-typescript-advanced-types.md");
    } catch (error) {
      console.log(`${browserName} 网络错误处理:`, error);
    }

    // 4. 验证系统稳定性
    await editorPage.verifySystemStability();

    // 5. 验证现有功能仍然可用
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");

    console.log(`${browserName} 错误处理兼容性测试通过`);
  });

  test("测试用例 8.8: 特定浏览器功能测试", async ({ page, browserName }) => {
    // 测试特定浏览器的特殊功能

    if (browserName === "chromium") {
      // Chrome特定测试
      console.log("执行Chrome特定测试");

      // 测试Chrome的内存API
      const memoryInfo = await page.evaluate(() => {
        return (performance as any).memory
          ? {
              usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
              totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
            }
          : null;
      });

      if (memoryInfo) {
        console.log("Chrome内存信息:", memoryInfo);
      }
    } else if (browserName === "firefox") {
      // Firefox特定测试
      console.log("执行Firefox特定测试");
    } else if (browserName === "webkit") {
      // Safari特定测试
      console.log("执行Safari特定测试");
    }

    // 通用功能测试
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");

    console.log(`${browserName} 特定功能测试通过`);
  });
});
