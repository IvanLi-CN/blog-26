#!/usr/bin/env bun

import { type Browser, chromium, type Page } from "playwright";

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  duration: number;
}

class MemoE2ETest {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private baseUrl = "http://localhost:3000";
  private results: TestResult[] = [];

  async setup() {
    console.log("🚀 启动浏览器...");
    this.browser = await chromium.launch({
      headless: false, // 设置为 false 可以看到浏览器操作
      slowMo: 500, // 减慢操作速度，便于观察
    });
    this.page = await this.browser.newPage();

    // 设置视口大小
    await this.page.setViewportSize({ width: 1280, height: 720 });
  }

  async teardown() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async runTest(name: string, testFn: () => Promise<void>) {
    const startTime = Date.now();
    console.log(`\n🧪 运行测试: ${name}`);

    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name, success: true, duration });
      console.log(`✅ 测试通过: ${name} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.results.push({ name, success: false, error: errorMessage, duration });
      console.log(`❌ 测试失败: ${name} (${duration}ms)`);
      console.log(`   错误: ${errorMessage}`);
    }
  }

  async testMemoListPage() {
    await this.runTest("访问 memo 列表页", async () => {
      if (!this.page) throw new Error("页面未初始化");

      await this.page.goto(`${this.baseUrl}/memos`);
      await this.page.waitForLoadState("networkidle");

      // 检查页面标题
      const title = await this.page.title();
      if (!title.includes("Memos")) {
        throw new Error(`页面标题不正确: ${title}`);
      }

      // 检查是否有 memo 列表
      const memoCards = await this.page.locator(".memo-card").count();
      console.log(`   发现 ${memoCards} 个 memo 卡片`);

      // 检查搜索框
      const searchInput = this.page.locator('input[placeholder*="搜索"]');
      await searchInput.waitFor({ state: "visible" });

      // 检查标签过滤
      const tagFilter = this.page.locator('button:has-text("标签")');
      await tagFilter.waitFor({ state: "visible" });
    });
  }

  async testMemoSearch() {
    await this.runTest("测试 memo 搜索功能", async () => {
      if (!this.page) throw new Error("页面未初始化");

      // 在搜索框中输入关键词
      const searchInput = this.page.locator('input[placeholder*="搜索"]');
      await searchInput.fill("测试");
      await searchInput.press("Enter");

      // 等待搜索结果
      await this.page.waitForTimeout(1000);

      // 检查是否显示了搜索条件
      const searchBadge = this.page.locator('text="搜索: 测试"');
      await searchBadge.waitFor({ state: "visible", timeout: 5000 });

      console.log("   搜索功能正常工作");
    });
  }

  async testMemoDetail() {
    await this.runTest("测试 memo 详情页", async () => {
      if (!this.page) throw new Error("页面未初始化");

      // 点击第一个 memo 卡片
      const firstMemoCard = this.page.locator(".memo-card").first();
      await firstMemoCard.waitFor({ state: "visible" });

      // 获取 memo 标题用于验证
      const memoTitle = await firstMemoCard.locator("h3").first().textContent();

      await firstMemoCard.click();

      // 等待新页面加载
      await this.page.waitForLoadState("networkidle");

      // 检查是否在详情页
      const currentUrl = this.page.url();
      if (!currentUrl.includes("/memos/")) {
        throw new Error(`未跳转到详情页: ${currentUrl}`);
      }

      // 检查详情页内容
      if (memoTitle) {
        const detailTitle = this.page.locator("h1");
        await detailTitle.waitFor({ state: "visible" });
      }

      // 检查返回按钮
      const backButton = this.page.locator('button:has-text("返回")');
      await backButton.waitFor({ state: "visible" });

      console.log("   详情页功能正常");
    });
  }

  async testMemoNavigation() {
    await this.runTest("测试页面导航", async () => {
      if (!this.page) throw new Error("页面未初始化");

      // 点击返回按钮
      const backButton = this.page.locator('button:has-text("返回")');
      await backButton.click();

      // 等待返回列表页
      await this.page.waitForLoadState("networkidle");

      // 检查是否回到列表页
      const currentUrl = this.page.url();
      if (!currentUrl.endsWith("/memos")) {
        throw new Error(`未返回列表页: ${currentUrl}`);
      }

      console.log("   页面导航正常");
    });
  }

  async testResponsiveDesign() {
    await this.runTest("测试响应式设计", async () => {
      if (!this.page) throw new Error("页面未初始化");

      // 测试移动端视图
      await this.page.setViewportSize({ width: 375, height: 667 });
      await this.page.waitForTimeout(500);

      // 检查移动端布局
      const memoCards = this.page.locator(".memo-card");
      await memoCards.first().waitFor({ state: "visible" });

      // 测试平板视图
      await this.page.setViewportSize({ width: 768, height: 1024 });
      await this.page.waitForTimeout(500);

      // 测试桌面视图
      await this.page.setViewportSize({ width: 1280, height: 720 });
      await this.page.waitForTimeout(500);

      console.log("   响应式设计正常");
    });
  }

  async testAPIEndpoints() {
    await this.runTest("测试 API 端点", async () => {
      if (!this.page) throw new Error("页面未初始化");

      // 测试 memo 列表 API
      const response = await this.page.request.post(`${this.baseUrl}/api/trpc/memos.list`, {
        headers: {
          "Content-Type": "application/json",
        },
        data: JSON.stringify({
          json: {
            page: 1,
            limit: 5,
            publicOnly: true,
          },
        }),
      });

      if (!response.ok()) {
        throw new Error(`API 请求失败: ${response.status()}`);
      }

      const data = await response.json();
      if (!data.result?.data?.memos) {
        throw new Error("API 响应格式不正确");
      }

      console.log(`   API 返回 ${data.result.data.memos.length} 个 memo`);
    });
  }

  async testPerformance() {
    await this.runTest("测试页面性能", async () => {
      if (!this.page) throw new Error("页面未初始化");

      // 测量页面加载时间
      const startTime = Date.now();
      await this.page.goto(`${this.baseUrl}/memos`, { waitUntil: "networkidle" });
      const loadTime = Date.now() - startTime;

      console.log(`   页面加载时间: ${loadTime}ms`);

      if (loadTime > 5000) {
        throw new Error(`页面加载时间过长: ${loadTime}ms`);
      }

      // 检查 Core Web Vitals
      const metrics = await this.page.evaluate(() => {
        return new Promise((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            resolve(
              entries.map((entry) => ({
                name: entry.name,
                value: (entry as any).value || entry.duration,
              }))
            );
          }).observe({ entryTypes: ["navigation", "paint"] });

          // 如果没有性能数据，返回空数组
          setTimeout(() => resolve([]), 1000);
        });
      });

      console.log("   性能指标:", metrics);
    });
  }

  async runAllTests() {
    console.log("🎯 开始 Memo 功能端到端测试");

    try {
      await this.setup();

      // 运行所有测试
      await this.testMemoListPage();
      await this.testMemoSearch();
      await this.testMemoDetail();
      await this.testMemoNavigation();
      await this.testResponsiveDesign();
      await this.testAPIEndpoints();
      await this.testPerformance();
    } finally {
      await this.teardown();
    }

    // 输出测试结果
    this.printResults();
  }

  private printResults() {
    console.log("\n📊 测试结果汇总:");
    console.log("=".repeat(60));

    const passed = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);

    this.results.forEach((result) => {
      const status = result.success ? "✅" : "❌";
      const duration = `${result.duration}ms`;
      console.log(`${status} ${result.name.padEnd(30)} ${duration.padStart(8)}`);

      if (!result.success && result.error) {
        console.log(`   错误: ${result.error}`);
      }
    });

    console.log("=".repeat(60));
    console.log(`总计: ${this.results.length} 个测试`);
    console.log(`通过: ${passed} 个`);
    console.log(`失败: ${failed} 个`);
    console.log(`总耗时: ${totalTime}ms`);

    if (failed > 0) {
      console.log("\n❌ 部分测试失败，请检查上述错误信息");
      process.exit(1);
    } else {
      console.log("\n🎉 所有测试通过！");
    }
  }
}

// 运行测试
async function main() {
  const tester = new MemoE2ETest();
  await tester.runAllTests();
}

main().catch((error) => {
  console.error("测试运行失败:", error);
  process.exit(1);
});
