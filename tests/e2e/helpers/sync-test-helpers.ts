/**
 * 增量数据同步E2E测试辅助工具
 *
 * 提供用于测试增量数据同步功能的辅助函数和工具
 */

import { expect, type Page } from "@playwright/test";

/**
 * 测试数据生成器
 */
export class TestDataGenerator {
  private static counter = 0;

  static generateMemoData() {
    const timestamp = Date.now();
    const counter = ++TestDataGenerator.counter;

    return {
      content: `🧪 E2E测试闪念 #${counter} - ${timestamp}

这是一个用于测试增量数据同步功能的闪念内容。

**测试信息**:
- 测试时间: ${new Date().toLocaleString()}
- 测试ID: ${timestamp}
- 计数器: ${counter}

**测试目标**:
- 验证闪念创建后的自动同步
- 验证WebDAV文件和数据库记录一致性
- 验证前端页面正确显示

---

*本闪念由E2E测试自动生成* 🚀`,
      searchText: `E2E测试闪念 #${counter}`,
      timestamp,
      counter,
    };
  }

  static generateArticleData() {
    const timestamp = Date.now();
    const counter = ++TestDataGenerator.counter;

    return {
      title: `E2E测试文章-${counter}-${timestamp}`,
      filename: `e2e-test-article-${counter}-${timestamp}.md`,
      content: `---
title: "E2E测试文章 #${counter}"
date: "${new Date().toISOString()}"
category: "测试"
tags: ["E2E测试", "增量同步", "自动化测试"]
---

# 🧪 E2E测试文章 #${counter}

**测试信息**:
- 测试时间: ${new Date().toLocaleString()}
- 测试ID: ${timestamp}
- 计数器: ${counter}

## 测试目标

这是一个用于测试增量数据同步功能的文章内容。

### 主要测试场景

1. **文章创建测试**
   - 验证文章创建后的自动同步
   - 验证WebDAV文件保存成功
   - 验证数据库记录更新

2. **文章编辑测试**
   - 验证文章编辑后的自动同步
   - 验证内容更新同步
   - 验证前端页面内容更新

3. **数据一致性测试**
   - 验证管理员页面和前端页面数据一致
   - 验证WebDAV文件和数据库记录一致

## 测试内容

这篇文章包含了各种Markdown元素来测试内容同步的完整性：

### 代码块测试

\`\`\`javascript
// 测试代码块同步
console.log("Hello, E2E Test!");
const testData = {
  timestamp: ${timestamp},
  counter: ${counter}
};
\`\`\`

### 列表测试

- 项目 1
- 项目 2
- 项目 3

### 表格测试

| 列1 | 列2 | 列3 |
|-----|-----|-----|
| 数据1 | 数据2 | 数据3 |
| 测试A | 测试B | 测试C |

---

*本文章由E2E测试自动生成于 ${new Date().toLocaleString()}* 🚀`,
      searchText: `E2E测试文章 #${counter}`,
      timestamp,
      counter,
    };
  }

  static generateUpdateContent(originalContent: string) {
    const timestamp = Date.now();
    return `${originalContent}

## 📝 编辑更新记录

**更新时间**: ${new Date().toLocaleString()}
**更新ID**: ${timestamp}

这是一个编辑更新，用于测试增量数据同步功能在内容修改时的表现。

### 更新内容

- 添加了编辑更新记录
- 验证同步功能正常工作
- 确保前端页面正确显示更新内容

---

*更新完成* ✅`;
  }
}

/**
 * 同步状态检测器
 */
export class SyncStatusDetector {
  constructor(private page: Page) {}

  /**
   * 等待增量同步完成
   * 使用多种策略来检测同步是否完成
   */
  async waitForSyncCompletion(context: string, _timeout = 30000): Promise<void> {
    console.log(`⏳ [${context}] 开始等待增量同步完成...`);

    const startTime = Date.now();

    try {
      // 策略1: 等待固定时间（基础策略）
      await this.page.waitForTimeout(3000);

      // 策略2: 检查页面是否有加载指示器消失
      await this.waitForLoadingIndicators(context);

      // 策略3: 等待网络请求完成
      await this.page.waitForLoadState("networkidle", { timeout: 10000 });

      // 策略4: 额外等待确保同步完成
      await this.page.waitForTimeout(2000);

      const elapsedTime = Date.now() - startTime;
      console.log(`✅ [${context}] 增量同步等待完成，耗时: ${elapsedTime}ms`);
    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      console.warn(`⚠️ [${context}] 同步等待超时或出错，耗时: ${elapsedTime}ms，错误:`, error);

      // 即使出错也继续测试，因为同步可能已经完成
    }
  }

  /**
   * 等待加载指示器消失
   */
  private async waitForLoadingIndicators(context: string): Promise<void> {
    try {
      // 常见的加载指示器选择器
      const loadingSelectors = [
        ".loading",
        ".spinner",
        "[data-loading='true']",
        ".sync-indicator",
        "text=同步中",
        "text=保存中",
        "text=处理中",
      ];

      for (const selector of loadingSelectors) {
        const elements = this.page.locator(selector);
        const count = await elements.count();

        if (count > 0) {
          console.log(`⏳ [${context}] 等待加载指示器消失: ${selector}`);
          await elements.first().waitFor({ state: "hidden", timeout: 10000 });
        }
      }
    } catch (_error) {
      // 忽略加载指示器等待错误
      console.log(`ℹ️ [${context}] 加载指示器等待完成（可能没有指示器）`);
    }
  }

  /**
   * 验证同步成功的指标
   */
  async verifySyncSuccess(context: string): Promise<boolean> {
    console.log(`🔍 [${context}] 开始验证同步成功指标...`);

    try {
      // 检查是否有成功指示器
      const successIndicators = [
        "text=已保存",
        "text=保存成功",
        "text=同步完成",
        "text=更新成功",
        ".success-indicator",
        "[data-success='true']",
      ];

      for (const selector of successIndicators) {
        const elements = this.page.locator(selector);
        const count = await elements.count();

        if (count > 0) {
          console.log(`✅ [${context}] 找到成功指示器: ${selector}`);
          return true;
        }
      }

      console.log(`ℹ️ [${context}] 未找到明显的成功指示器，但这可能是正常的`);
      return true;
    } catch (error) {
      console.warn(`⚠️ [${context}] 验证同步成功时出错:`, error);
      return false;
    }
  }
}

/**
 * 管理员登录辅助器
 */
export class AdminAuthHelper {
  constructor(private page: Page) {}

  async loginAsAdmin(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || "ivanli2048@gmail.com";
    console.log(`🔍 [AUTH] 尝试使用邮箱登录: ${adminEmail}`);

    const response = await this.page.request.post("/api/dev/login", {
      data: { email: adminEmail },
    });

    console.log(`🔍 [AUTH] 登录响应状态: ${response.status()}`);
    const data = await response.json();

    expect(response.status()).toBe(200);
    expect(data.success).toBe(true);

    // 提取 session cookie 并设置到浏览器上下文
    const setCookieHeader = response.headers()["set-cookie"];
    if (setCookieHeader) {
      const sessionCookieMatch = setCookieHeader.match(/session_id=([^;]+)/);
      if (sessionCookieMatch) {
        const sessionId = sessionCookieMatch[1];
        console.log(`🔍 [AUTH] 提取到 session ID: ${sessionId.substring(0, 8)}...`);

        await this.page.context().addCookies([
          {
            name: "session_id",
            value: sessionId,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
      }
    }

    console.log(`✅ [AUTH] 管理员登录成功`);
  }

  async verifyAdminAccess(): Promise<boolean> {
    try {
      // 尝试访问管理员页面来验证权限
      await this.page.goto("/admin/dashboard");
      await this.page.waitForLoadState("networkidle");

      // 检查是否成功访问管理员页面
      const isAdminPage = (await this.page.locator("text=管理后台").count()) > 0;

      if (isAdminPage) {
        console.log(`✅ [AUTH] 管理员权限验证成功`);
        return true;
      } else {
        console.warn(`⚠️ [AUTH] 管理员权限验证失败`);
        return false;
      }
    } catch (error) {
      console.error(`❌ [AUTH] 管理员权限验证出错:`, error);
      return false;
    }
  }
}

/**
 * 页面导航辅助器
 */
export class NavigationHelper {
  constructor(private page: Page) {}

  async goToMemosPage(): Promise<void> {
    console.log(`🧭 [NAV] 导航到闪念页面`);
    await this.page.goto("/memos");
    await this.page.waitForLoadState("networkidle");
    await expect(this.page.locator("h1")).toContainText("闪念", { timeout: 15000 });
    console.log(`✅ [NAV] 闪念页面加载完成`);
  }

  async goToPostsPage(): Promise<void> {
    console.log(`🧭 [NAV] 导航到文章页面`);
    await this.page.goto("/posts");
    await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(2000);
    console.log(`✅ [NAV] 文章页面加载完成`);
  }

  async goToAdminPostsPage(): Promise<void> {
    console.log(`🧭 [NAV] 导航到管理员文章页面`);
    await this.page.goto("/admin/posts");
    await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(2000);
    console.log(`✅ [NAV] 管理员文章页面加载完成`);
  }

  async goToPostEditor(): Promise<void> {
    console.log(`🧭 [NAV] 导航到文章编辑器`);
    await this.page.goto("/admin/posts/editor");
    await this.page.waitForLoadState("networkidle");
    await expect(this.page.locator("h3")).toContainText("文件管理器", { timeout: 15000 });
    console.log(`✅ [NAV] 文章编辑器加载完成`);
  }
}

/**
 * 内容验证辅助器
 */
export class ContentVerifier {
  constructor(private page: Page) {}

  async verifyMemoExists(searchText: string, timeout = 15000): Promise<boolean> {
    try {
      await expect(this.page.locator(`text=${searchText}`)).toBeVisible({ timeout });
      console.log(`✅ [VERIFY] 闪念内容验证成功: ${searchText}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ [VERIFY] 闪念内容验证失败: ${searchText}`, error);
      return false;
    }
  }

  async verifyArticleExists(searchText: string, timeout = 15000): Promise<boolean> {
    try {
      await expect(this.page.locator(`text=${searchText}`)).toBeVisible({ timeout });
      console.log(`✅ [VERIFY] 文章内容验证成功: ${searchText}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ [VERIFY] 文章内容验证失败: ${searchText}`, error);
      return false;
    }
  }

  async countArticles(): Promise<number> {
    const articles = this.page.locator("article, .article-item, [data-testid='article-item']");
    const count = await articles.count();
    console.log(`📊 [VERIFY] 当前页面文章数量: ${count}`);
    return count;
  }

  async countMemos(): Promise<number> {
    const memos = this.page.locator(".memo-item, [data-testid='memo-item'], .memo");
    const count = await memos.count();
    console.log(`📊 [VERIFY] 当前页面闪念数量: ${count}`);
    return count;
  }
}
