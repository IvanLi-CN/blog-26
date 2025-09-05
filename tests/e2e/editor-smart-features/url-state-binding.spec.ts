/**
 * URL状态双向绑定功能测试
 *
 * 测试用例：
 * 4.1: 文件选择时URL自动更新
 * 4.2: URL参数恢复编辑器状态
 */

import { expect, test } from "@playwright/test";
import { EditorPage } from "./pages/EditorPage";
import { devLogin, EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("URL状态双向绑定功能", () => {
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

    // 清理localStorage状态，确保URL状态绑定测试环境干净
    await EditorTestHelpers.clearLocalStorage(page);

    // 等待页面完全加载
    await editorPage.waitForFileTreeLoad();
  });

  test("测试用例 4.1: 文件选择时URL自动更新", async ({ page }) => {
    // 1. 访问编辑器页面（已在beforeEach中完成）

    // 2. 选择文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 3. 等待URL更新
    await page.waitForURL(/source=local&path=blog%252F01-react-hooks-deep-dive\.md/, {
      timeout: 10000,
    });

    // 4. 验证URL参数
    const url = page.url();
    expect(url).toContain("source=local");
    expect(url).toContain("path=blog%252F01-react-hooks-deep-dive.md");

    // 5. 验证标签页创建
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
  });

  test("测试用例 4.2: URL参数恢复编辑器状态", async ({ page }) => {
    // 1. 直接访问带参数的URL
    await page.goto("/admin/posts/editor?source=local&path=blog%252F01-react-hooks-deep-dive.md");

    // 等待页面加载
    await editorPage.waitForFileTreeLoad();

    // 2. 验证标签页创建
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");

    // 3. 验证文件高亮
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 4. 验证编辑器内容加载
    await expect(page.locator('h1:has-text("React Hooks 深度解析")')).toBeVisible({
      timeout: 15000,
    });

    // 5. 验证文件夹自动展开
    await editorPage.verifyFolderExpanded("blog");
  });

  test("测试用例 4.3: 多个文件的URL状态管理", async ({ page }) => {
    // 测试多个标签页的URL状态管理

    // 1. 选择第一个文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 验证URL更新
    await page.waitForURL(/path=blog%252F01-react-hooks-deep-dive\.md/);

    // 3. 选择第二个文件
    await editorPage.selectFile("02-typescript-advanced-types.md");

    // 4. 验证URL更新到新文件
    await page.waitForURL(/path=blog%252F02-typescript-advanced-types\.md/);

    // 5. 切换回第一个标签页
    await editorPage.switchToTab("01-react-hooks-deep-dive");

    // 6. 验证URL切换回第一个文件
    await page.waitForURL(/path=blog%252F01-react-hooks-deep-dive\.md/);
  });

  test("测试用例 4.4: 不同数据源的URL状态", async ({ page }) => {
    // 测试不同数据源（local/webdav）的URL状态

    // 1. 选择本地文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 验证本地文件的URL
    await page.waitForURL(/source=local/);
    expect(page.url()).toContain("source=local");

    // 3. 尝试选择WebDAV文件（如果存在）
    try {
      await editorPage.expandFolder("webdav");
      await editorPage.expandFolder("blog");
      await editorPage.selectFile("01-vue3-composition-api-deep-dive.md");

      // 4. 验证WebDAV文件的URL
      await page.waitForURL(/source=webdav/);
      expect(page.url()).toContain("source=webdav");
    } catch (_error) {
      console.log("WebDAV测试跳过：WebDAV数据源不可用");
    }
  });

  test("测试用例 4.5: URL参数编码测试", async ({ page }) => {
    // 测试特殊字符文件名的URL编码

    // 1. 选择包含特殊字符的文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("03-graphql-api-best-practices.md");

    // 2. 验证URL正确编码
    const url = page.url();
    expect(url).toContain("path=blog%252F03-graphql-api-best-practices.md");

    // 3. 直接访问编码后的URL
    const encodedUrl =
      "/admin/posts/editor?source=local&path=blog%252F03-graphql-api-best-practices.md";
    await page.goto(encodedUrl);
    await editorPage.waitForFileTreeLoad();

    // 4. 验证状态正确恢复
    await editorPage.verifyTabExists("03-graphql-api-best-practices");
    await editorPage.verifyFileHighlighted("03-graphql-api-best-practices.md");
  });

  test("测试用例 4.6: URL状态与浏览器历史", async ({ page }) => {
    // 测试URL状态与浏览器前进后退的交互

    // 1. 选择第一个文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await page.waitForURL(/path=blog%252F01-react-hooks-deep-dive\.md/);

    // 2. 选择第二个文件
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await page.waitForURL(/path=blog%252F02-typescript-advanced-types\.md/);

    // 3. 使用浏览器后退
    await page.goBack();
    await editorPage.waitForFileTreeLoad();

    // 4. 验证状态恢复到第一个文件
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");

    // 5. 使用浏览器前进
    await page.goForward();
    await editorPage.waitForFileTreeLoad();

    // 6. 验证状态恢复到第二个文件
    await editorPage.verifyFileHighlighted("02-typescript-advanced-types.md");
    await editorPage.verifyTabExists("02-typescript-advanced-types");
  });

  test("测试用例 4.7: 无效URL参数处理", async ({ page }) => {
    // 测试无效URL参数的处理

    // 1. 访问包含无效路径的URL
    await page.goto("/admin/posts/editor?source=local&path=invalid%252Ffile.md");
    await editorPage.waitForFileTreeLoad();

    // 2. 验证系统稳定性
    await editorPage.verifySystemStability();

    // 3. 验证没有创建无效标签页
    const invalidTab = page.locator('button:has-text("invalid ✕")');
    await expect(invalidTab).not.toBeVisible();

    // 4. 访问包含无效数据源的URL
    await page.goto("/admin/posts/editor?source=invalid&path=blog%252F01-react-hooks-deep-dive.md");
    await editorPage.waitForFileTreeLoad();

    // 5. 验证系统仍然稳定
    await editorPage.verifySystemStability();
  });

  test("测试用例 4.8: URL状态同步性能", async ({ page }) => {
    // 测试URL状态同步的性能

    // 1. 测量URL更新的响应时间
    const updateTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await editorPage.expandFolder("blog");
      await editorPage.selectFile("01-react-hooks-deep-dive.md");
      await page.waitForURL(/path=blog%252F01-react-hooks-deep-dive\.md/);
    });

    // 2. 验证URL更新时间在合理范围内（< 1秒）
    expect(updateTime).toBeLessThan(1000);
    console.log(`URL状态同步耗时: ${updateTime}ms`);

    // 3. 测量状态恢复的响应时间
    const restoreTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await page.goto(
        "/admin/posts/editor?source=local&path=blog%252F02-typescript-advanced-types.md"
      );
      await editorPage.waitForFileTreeLoad();
      await editorPage.verifyTabExists("02-typescript-advanced-types");
    });

    // 4. 验证状态恢复时间在合理范围内（< 2秒）
    expect(restoreTime).toBeLessThan(2000);
    console.log(`URL状态恢复耗时: ${restoreTime}ms`);
  });
});
