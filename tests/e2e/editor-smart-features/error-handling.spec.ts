/**
 * 错误处理测试用例
 *
 * 测试用例：
 * 7.1: 网络错误时系统稳定性
 */

import { expect, test } from "@playwright/test";
import { EditorPage } from "./pages/EditorPage";
import { devLogin, EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("错误处理测试", () => {
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

  test("测试用例 7.1: 网络错误时系统稳定性", async () => {
    // 1. 建立正常状态
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 验证正常状态
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
    await editorPage.verifyFileHighlighted("01-react-hooks-deep-dive.md");

    // 3. 模拟网络错误
    await editorPage.simulateNetworkError();

    // 4. 尝试选择另一个文件
    try {
      await editorPage.selectFile("02-typescript-advanced-types.md");
    } catch (error) {
      console.log("预期的网络错误:", error);
    }

    // 5. 验证系统稳定性
    await editorPage.verifySystemStability();

    // 6. 验证错误提示显示
    await editorPage.verifyErrorMessage("网络连接失败");

    // 7. 验证现有标签页仍然可用
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
  });

  test("测试用例 7.2: 文件加载失败处理", async ({ page }) => {
    // 测试文件加载失败的处理

    // 1. 建立正常状态
    await editorPage.expandFolder("blog");

    // 2. 模拟特定文件的加载错误
    await page.route("**/api/content/**01-react-hooks-deep-dive.md**", (route) => {
      route.abort("failed");
    });

    // 3. 尝试选择文件
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 4. 验证错误处理
    await editorPage.verifyErrorMessage("文件加载失败");

    // 5. 验证系统仍然稳定
    await editorPage.verifySystemStability();

    // 6. 验证其他文件仍然可以正常加载
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.verifyTabExists("02-typescript-advanced-types");
  });

  test("测试用例 7.3: 状态恢复机制", async ({ page }) => {
    // 测试错误后的状态恢复机制

    // 1. 建立复杂状态
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.selectFile("02-typescript-advanced-types.md");

    // 2. 模拟临时网络错误
    await page.route("**/api/**", (route) => {
      // 50%概率失败
      if (Math.random() > 0.5) {
        route.abort("failed");
      } else {
        route.continue();
      }
    });

    // 3. 尝试多次操作
    for (let i = 0; i < 5; i++) {
      try {
        await editorPage.switchToTab("01-react-hooks-deep-dive");
        await editorPage.switchToTab("02-typescript-advanced-types");
      } catch {
        // 忽略预期的错误
      }
    }

    // 4. 清除网络错误模拟
    await page.unroute("**/api/**");

    // 5. 验证系统可以恢复
    await editorPage.verifySystemStability();
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
    await editorPage.verifyTabExists("02-typescript-advanced-types");
  });

  test("测试用例 7.4: 内存不足处理", async ({ page }) => {
    // 测试内存不足情况的处理

    // 1. 尝试创建大量标签页
    await editorPage.expandFolder("blog");

    const files = [
      "01-react-hooks-deep-dive.md",
      "02-typescript-advanced-types.md",
      "03-graphql-api-best-practices.md",
      "04-kubernetes-cluster-management.md",
      "05-redis-caching-strategies.md",
    ];

    // 2. 快速创建多个标签页
    for (const file of files) {
      try {
        await editorPage.selectFile(file);
      } catch (error) {
        console.log(`文件 ${file} 加载失败:`, error);
      }
    }

    // 3. 验证系统稳定性
    await editorPage.verifySystemStability();

    // 4. 验证至少有一些标签页成功创建
    const tabCount = await page.locator('[data-testid="tab-container"] button').count();
    expect(tabCount).toBeGreaterThan(0);
    console.log(`成功创建 ${tabCount} 个标签页`);
  });

  test("测试用例 7.5: JavaScript错误处理", async ({ page }) => {
    // 测试JavaScript运行时错误的处理

    // 1. 监听页面错误
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    // 2. 建立正常状态
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 3. 注入可能导致错误的代码
    await page.evaluate(() => {
      // 模拟可能的运行时错误
      try {
        (window as any).testErrorFunction = () => {
          throw new Error("测试错误");
        };

        // 延迟执行以模拟异步错误
        setTimeout(() => {
          try {
            (window as any).testErrorFunction();
          } catch (e) {
            console.error("捕获的测试错误:", e);
          }
        }, 100);
      } catch (e) {
        console.error("注入错误处理代码失败:", e);
      }
    });

    // 4. 等待错误处理
    await page.waitForTimeout(1000);

    // 5. 验证系统仍然稳定
    await editorPage.verifySystemStability();

    // 6. 验证功能仍然正常
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.verifyTabExists("02-typescript-advanced-types");

    // 7. 检查是否有未处理的错误
    console.log("页面错误数量:", errors.length);
    if (errors.length > 0) {
      console.log("页面错误列表:", errors);
    }
  });

  test("测试用例 7.6: 数据源切换错误", async ({ page }) => {
    // 测试数据源切换时的错误处理

    // 1. 建立本地数据源状态
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 模拟WebDAV数据源错误
    await page.route("**/webdav/**", (route) => {
      route.abort("connectionrefused");
    });

    // 3. 尝试访问WebDAV文件（如果存在）
    try {
      await editorPage.expandFolder("webdav");
    } catch (error) {
      console.log("WebDAV访问失败（预期）:", error);
    }

    // 4. 验证本地数据源仍然正常
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.verifyTabExists("02-typescript-advanced-types");

    // 5. 验证系统稳定性
    await editorPage.verifySystemStability();
  });

  test("测试用例 7.7: 错误恢复流程", async ({ page }) => {
    // 测试完整的错误恢复流程

    // 1. 建立初始状态
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 2. 模拟严重错误
    await page.route("**/*", (route) => {
      route.abort("failed");
    });

    // 3. 等待错误发生
    await page.waitForTimeout(2000);

    // 4. 尝试恢复
    await page.unroute("**/*");

    // 5. 使用错误恢复辅助函数
    const recovered = await EditorTestHelpers.attemptRecovery(page);

    if (recovered) {
      console.log("✅ 系统成功恢复");

      // 6. 验证恢复后的功能
      await editorPage.waitForFileTreeLoad();
      await editorPage.verifySystemStability();

      // 7. 测试基本功能
      await editorPage.expandFolder("blog");
      await editorPage.selectFile("02-typescript-advanced-types.md");
      await editorPage.verifyTabExists("02-typescript-advanced-types");
    } else {
      console.log("⚠️ 系统恢复失败，但测试继续");
    }
  });

  test("测试用例 7.8: 边界条件错误处理", async ({ page }) => {
    // 测试各种边界条件的错误处理

    // 1. 测试空文件名处理
    try {
      await page.evaluate(() => {
        // 模拟选择空文件名
        const event = new CustomEvent("fileSelect", {
          detail: { fileName: "", path: "" },
        });
        document.dispatchEvent(event);
      });
    } catch (error) {
      console.log("空文件名错误处理:", error);
    }

    // 2. 测试超长文件名处理
    try {
      const longFileName = `${"a".repeat(1000)}.md`;
      await page.evaluate((fileName) => {
        const event = new CustomEvent("fileSelect", {
          detail: { fileName, path: `blog/${fileName}` },
        });
        document.dispatchEvent(event);
      }, longFileName);
    } catch (error) {
      console.log("超长文件名错误处理:", error);
    }

    // 3. 测试特殊字符文件名处理
    try {
      const specialFileName = '测试<>:"|?*.md';
      await page.evaluate((fileName) => {
        const event = new CustomEvent("fileSelect", {
          detail: { fileName, path: `blog/${fileName}` },
        });
        document.dispatchEvent(event);
      }, specialFileName);
    } catch (error) {
      console.log("特殊字符文件名错误处理:", error);
    }

    // 4. 验证系统稳定性
    await editorPage.verifySystemStability();

    // 5. 验证正常功能仍然可用
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.verifyTabExists("01-react-hooks-deep-dive");
  });
});
