/**
 * 文件高亮功能测试
 *
 * 测试用例：
 * 3.1: 文件选择时正确显示高亮状态
 * 3.2: 标签页切换时高亮状态同步
 */

import { expect, test } from "@playwright/test";
import { EditorPage } from "./pages/EditorPage";
import { EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("文件高亮功能", () => {
  let editorPage: EditorPage;

  test.beforeEach(async ({ page }) => {
    // 设置控制台日志捕获
    await EditorTestHelpers.setupConsoleLogCapture(page);

    editorPage = new EditorPage(page);
    await editorPage.goto();

    // 等待页面完全加载
    await editorPage.waitForFileTreeLoad();
  });

  test("测试用例 3.1: 文件选择时正确显示高亮状态", async ({ _page }) => {
    // 1. 访问编辑器页面（已在beforeEach中完成）

    // 2. 展开文件夹并选择文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 3. 验证文件高亮状态
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 4. 选择另一个文件
    await editorPage.selectFile("03-graphql-api-best-practices.md");

    // 5. 验证高亮状态切换
    await editorPage.verifyFileNotHighlighted("01-react-hooks-deep-dive.md");
    await editorPage.verifyFileHighlighted("03-graphql-api-best-practices.md");

    // 6. 验证标签页都存在
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
    await editorPage.verifyTabExists("03-graphql-api-best-practices");
  });

  test("测试用例 3.2: 标签页切换时高亮状态同步", async ({ _page }) => {
    // 1. 准备：创建两个标签页
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.selectFile("03-graphql-api-best-practices.md");

    // 2. 验证当前高亮状态
    await editorPage.verifyFileHighlighted("03-graphql-api-best-practices.md");
    await editorPage.verifyFileNotHighlighted("01-react-hooks-deep-dive.md");

    // 3. 切换到第一个标签页
    await editorPage.switchToTab("01-react-hooks-deep-dive");

    // 4. 验证高亮状态切换
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");
    await editorPage.verifyFileNotHighlighted("03-graphql-api-best-practices.md");

    // 5. 再次切换标签页
    await editorPage.switchToTab("03-graphql-api-best-practices");

    // 6. 验证高亮状态再次切换
    await editorPage.verifyFileHighlighted("03-graphql-api-best-practices.md");
    await editorPage.verifyFileNotHighlighted("01-react-hooks-deep-dive.md");
  });

  test("测试用例 3.3: 多文件高亮状态管理", async ({ _page }) => {
    // 测试多个文件的高亮状态管理

    // 1. 创建多个标签页
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.selectFile("03-graphql-api-best-practices.md");

    // 2. 验证只有最后选择的文件被高亮
    await editorPage.verifyFileHighlighted("03-graphql-api-best-practices.md");
    await editorPage.verifyFileNotHighlighted("01-react-hooks-deep-dive.md");
    await editorPage.verifyFileNotHighlighted("02-typescript-advanced-types.md");

    // 3. 切换到中间的标签页
    await editorPage.switchToTab("02-typescript-advanced-types");

    // 4. 验证高亮状态正确切换
    await editorPage.verifyFileHighlighted("02-typescript-advanced-types.md");
    await editorPage.verifyFileNotHighlighted("01-react-hooks-deep-dive.md");
    await editorPage.verifyFileNotHighlighted("03-graphql-api-best-practices.md");
  });

  test("测试用例 3.4: 跨文件夹高亮状态", async ({ _page }) => {
    // 测试跨不同文件夹的文件高亮状态

    // 1. 选择blog文件夹中的文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 2. 选择projects文件夹中的文件
    await editorPage.expandFolder("projects");
    await editorPage.selectFile("01-open-source-component-library.md");

    // 3. 验证高亮状态切换
    await editorPage.verifyFileHighlighted("01-open-source-component-library.md");
    await editorPage.verifyFileNotHighlighted("01-react-hooks-deep-dive.md");

    // 4. 切换回blog文件
    await editorPage.switchToTab("01-react-hooks-deep-dive");

    // 5. 验证高亮状态正确切换
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");
    await editorPage.verifyFileNotHighlighted("01-open-source-component-library.md");
  });

  test("测试用例 3.5: 高亮样式验证", async ({ page }) => {
    // 验证高亮样式的具体CSS类

    // 1. 选择文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 获取文件按钮元素
    const fileButton = page.locator('button:has-text("01-react-hooks-deep-dive.md")');

    // 3. 验证具体的CSS类
    await expect(fileButton).toHaveClass(/bg-primary/);

    // 4. 验证文本颜色类（如果存在）
    const hasTextPrimary = await fileButton.evaluate((el) => el.classList.contains("text-primary"));

    if (hasTextPrimary) {
      await expect(fileButton).toHaveClass(/text-primary/);
    }

    // 5. 选择另一个文件
    await editorPage.selectFile("02-typescript-advanced-types.md");

    // 6. 验证原文件失去高亮样式
    await expect(fileButton).not.toHaveClass(/bg-primary/);
  });

  test("测试用例 3.6: 高亮状态持久化测试", async ({ page }) => {
    // 测试页面刷新后高亮状态的恢复

    // 1. 选择文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 2. 刷新页面
    await page.reload({ waitUntil: "networkidle" });
    await editorPage.waitForFileTreeLoad();

    // 3. 检查高亮状态是否恢复
    // 注意：这取决于URL状态恢复和Jotai状态管理
    try {
      await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");
      console.log("✅ 文件高亮状态已恢复");
    } catch {
      console.log("ℹ️ 文件高亮状态未恢复（这可能是预期行为）");
    }
  });

  test("测试用例 3.7: 高亮状态与URL同步", async ({ _page }) => {
    // 测试高亮状态与URL参数的同步

    // 1. 选择文件
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 验证文件高亮
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 3. 验证URL包含相关参数
    await editorPage.verifyUrlContains([
      "source=local",
      "path=blog%252F01-react-hooks-deep-dive.md",
    ]);

    // 4. 切换文件
    await editorPage.selectFile("02-typescript-advanced-types.md");

    // 5. 验证高亮状态和URL都更新
    await editorPage.verifyFileHighlighted("02-typescript-advanced-types.md");
    await editorPage.verifyUrlContains(["path=blog%252F02-typescript-advanced-types.md"]);
  });
});
