/**
 * 性能测试用例
 *
 * 测试用例：
 * 6.1: 大量文件加载时性能表现
 */

import { expect, test } from "@playwright/test";
import { EditorPage } from "./pages/EditorPage";
import { EditorTestHelpers } from "./utils/editor-test-helpers";

test.describe("性能测试", () => {
  let editorPage: EditorPage;

  test.beforeEach(async ({ page }) => {
    // 设置控制台日志捕获
    await EditorTestHelpers.setupConsoleLogCapture(page);

    editorPage = new EditorPage(page);
  });

  test("测试用例 6.1: 大量文件加载时性能表现", async ({ page }) => {
    // 1. 记录开始时间并访问编辑器页面
    const loadTime = await editorPage.measureLoadTime();

    // 2. 等待页面完全加载
    await editorPage.waitForFileTreeLoad();

    // 3. 记录文件树展开时间
    const expansionTime = await EditorTestHelpers.measurePerformance(page, async () => {
      // 展开所有文件夹
      await editorPage.expandFolder("local");
      await editorPage.expandFolder("blog");
      await editorPage.expandFolder("projects");

      // 等待所有文件加载完成
      await page.waitForSelector('button:has-text("01-react-hooks-deep-dive.md")', {
        timeout: 10000,
      });
    });

    // 4. 验证页面加载时间在合理范围内（< 5秒）
    expect(loadTime).toBeLessThan(5000);
    console.log(`页面加载耗时: ${loadTime}ms`);

    // 5. 验证文件树展开时间在合理范围内（< 2秒）
    expect(expansionTime).toBeLessThan(2000);
    console.log(`文件树展开耗时: ${expansionTime}ms`);

    // 6. 验证系统响应性
    await editorPage.verifySystemStability();
  });

  test("测试用例 6.2: 文件选择响应性能", async ({ page }) => {
    // 测试文件选择操作的响应性能

    await editorPage.goto();
    await editorPage.waitForFileTreeLoad();

    // 1. 展开文件夹
    await editorPage.expandFolder("blog");

    // 2. 测量文件选择响应时间
    const selectionTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await editorPage.selectFile("01-react-hooks-deep-dive.md");
    });

    // 3. 验证文件选择时间在合理范围内（< 1秒）
    expect(selectionTime).toBeLessThan(1000);
    console.log(`文件选择响应耗时: ${selectionTime}ms`);

    // 4. 测量标签页切换性能
    await editorPage.selectFile("02-typescript-advanced-types.md");

    const switchTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await editorPage.switchToTab("01-react-hooks-deep-dive");
    });

    // 5. 验证标签页切换时间在合理范围内（< 500ms）
    expect(switchTime).toBeLessThan(500);
    console.log(`标签页切换耗时: ${switchTime}ms`);
  });

  test("测试用例 6.3: 滚动性能测试", async ({ page }) => {
    // 测试滚动操作的性能

    await editorPage.goto();
    await editorPage.waitForFileTreeLoad();

    // 1. 展开所有文件夹创建长列表
    await editorPage.expandFolder("blog");
    await editorPage.expandFolder("projects");

    // 2. 测量滚动性能
    const scrollTime = await EditorTestHelpers.measurePerformance(page, async () => {
      await editorPage.scrollFileTreeToTop();
      await editorPage.selectFile("05-redis-caching-strategies.md");
      await editorPage.verifyFileInViewport("05-redis-caching-strategies.md");
    });

    // 3. 验证滚动时间在合理范围内（< 1秒）
    expect(scrollTime).toBeLessThan(1000);
    console.log(`滚动定位耗时: ${scrollTime}ms`);
  });

  test("测试用例 6.4: 内存使用性能", async ({ page }) => {
    // 测试内存使用情况

    await editorPage.goto();
    await editorPage.waitForFileTreeLoad();

    // 1. 获取初始内存使用情况
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory
        ? {
            usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
            totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          }
        : null;
    });

    // 2. 执行大量操作
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");
    await editorPage.selectFile("02-typescript-advanced-types.md");
    await editorPage.selectFile("03-graphql-api-best-practices.md");
    await editorPage.selectFile("04-kubernetes-cluster-management.md");
    await editorPage.selectFile("05-redis-caching-strategies.md");

    // 3. 执行多次标签页切换
    for (let i = 0; i < 5; i++) {
      await editorPage.switchToTab("01-react-hooks-deep-dive");
      await editorPage.switchToTab("03-graphql-api-best-practices");
      await editorPage.switchToTab("05-redis-caching-strategies");
    }

    // 4. 获取操作后内存使用情况
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory
        ? {
            usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
            totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
          }
        : null;
    });

    // 5. 分析内存使用情况
    if (initialMemory && finalMemory) {
      const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
      const memoryIncreaseMB = memoryIncrease / (1024 * 1024);

      console.log(`内存使用增加: ${memoryIncreaseMB.toFixed(2)}MB`);

      // 验证内存增长在合理范围内（< 50MB）
      expect(memoryIncreaseMB).toBeLessThan(50);
    } else {
      console.log("浏览器不支持内存监控API，跳过内存测试");
    }
  });

  test("测试用例 6.5: 网络请求性能", async ({ page }) => {
    // 测试网络请求的性能

    // 1. 捕获网络请求
    const requests = await EditorTestHelpers.captureNetworkRequests(page);

    // 2. 访问编辑器页面
    await editorPage.goto();
    await editorPage.waitForFileTreeLoad();

    // 3. 执行文件操作
    await editorPage.expandFolder("blog");
    await editorPage.selectFile("01-react-hooks-deep-dive.md");

    // 4. 等待一段时间收集请求
    await page.waitForTimeout(2000);

    // 5. 分析网络请求
    const apiRequests = requests.filter((req) => req.includes("/api/"));
    console.log(`API请求数量: ${apiRequests.length}`);
    console.log("API请求列表:", apiRequests);

    // 6. 验证API请求数量在合理范围内
    expect(apiRequests.length).toBeLessThan(20);
  });

  test("测试用例 6.6: 并发操作性能", async ({ page }) => {
    // 测试并发操作的性能

    await editorPage.goto();
    await editorPage.waitForFileTreeLoad();

    // 1. 测量并发文件选择的性能
    const concurrentTime = await EditorTestHelpers.measurePerformance(page, async () => {
      // 快速连续选择多个文件
      await editorPage.expandFolder("blog");

      const files = [
        "01-react-hooks-deep-dive.md",
        "02-typescript-advanced-types.md",
        "03-graphql-api-best-practices.md",
      ];

      // 并发选择文件（不等待前一个完成）
      const promises = files.map((file) =>
        editorPage.selectFile(file).catch(() => {
          // 忽略可能的并发错误
        })
      );

      await Promise.allSettled(promises);
    });

    // 2. 验证并发操作时间在合理范围内（< 3秒）
    expect(concurrentTime).toBeLessThan(3000);
    console.log(`并发操作耗时: ${concurrentTime}ms`);

    // 3. 验证系统稳定性
    await editorPage.verifySystemStability();
  });

  test("测试用例 6.7: 长时间运行稳定性", async ({ _page }) => {
    // 测试长时间运行的稳定性

    await editorPage.goto();
    await editorPage.waitForFileTreeLoad();

    // 1. 执行长时间的重复操作
    const iterations = 10;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      await editorPage.expandFolder("blog");
      await editorPage.selectFile("01-react-hooks-deep-dive.md");
      await editorPage.selectFile("02-typescript-advanced-types.md");
      await editorPage.switchToTab("01-react-hooks-deep-dive");
      await editorPage.collapseFolder("blog");

      // 每5次操作检查一次稳定性
      if (i % 5 === 0) {
        await editorPage.verifySystemStability();
      }
    }

    const totalTime = Date.now() - startTime;
    const averageTime = totalTime / iterations;

    // 2. 验证平均操作时间稳定
    expect(averageTime).toBeLessThan(2000);
    console.log(`${iterations}次操作总耗时: ${totalTime}ms`);
    console.log(`平均每次操作耗时: ${averageTime.toFixed(2)}ms`);

    // 3. 最终稳定性检查
    await editorPage.verifySystemStability();
  });
});
