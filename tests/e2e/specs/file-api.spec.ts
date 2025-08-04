import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { setupAdminAuth } from '../utils/test-helpers';

// 测试数据
const TEST_FILE_CONTENT = '这是文件 API 测试内容';
const UPDATED_FILE_CONTENT = '这是更新后的文件内容';
const TEST_FILE_PATH = 'local/file-api-test.txt';
const PUBLIC_TEST_FILE_PATH = 'webdav/test.txt';

// 工具函数
async function waitForTestResult(page: Page, resultId: string, timeout = 15000): Promise<string> {
  // 等待至少有一个包含"响应状态"的结果出现
  await page.waitForFunction(
    (id) => {
      const element = document.getElementById(id);
      if (!element) return false;
      const text = element.textContent || '';
      return text.includes('响应状态:') || text.includes('网络错误:') || text.includes('请输入');
    },
    resultId,
    { timeout }
  );

  const result = await page.locator(`#${resultId}`).textContent();
  return result || '';
}

async function clearTestResults(page: Page) {
  await page.click('#clear-results');
  await page.waitForTimeout(500);
}

test.describe('文件 API E2E 测试', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();

    // 设置管理员认证，确保测试在管理员模式下运行
    await setupAdminAuth(context);

    page = await context.newPage();

    // 导航到测试页面
    await page.goto('/admin/file-api-test');
    await page.waitForLoadState('networkidle');

    // 等待页面初始化
    await expect(page.locator('#status-content')).toContainText('页面加载完成');
  });

  test.afterEach(async () => {
    await context.close();
  });

  test.describe('管理员模式测试', () => {
    test('应该能够创建文件 (POST)', async () => {
      // 设置测试数据
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);

      // 点击创建按钮
      await page.click('#test-admin-create');

      // 等待结果
      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证结果
      expect(result).toContain('响应状态: 201');
      expect(result).toContain('创建成功');
      expect(page.locator('#status-content')).toContainText('管理员文件创建测试成功');
    });

    test('应该能够读取文件 (GET)', async () => {
      // 先创建文件
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);
      await page.click('#test-admin-create');
      await waitForTestResult(page, 'admin-test-result');

      // 清除结果
      await clearTestResults(page);

      // 读取文件
      await page.click('#test-admin-read');
      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证结果
      expect(result).toContain('响应状态: 200');
      expect(result).toContain(TEST_FILE_CONTENT);
      expect(page.locator('#status-content')).toContainText('管理员文件读取测试成功');
    });

    test('应该能够更新文件 (PUT)', async () => {
      // 先创建文件
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);
      await page.click('#test-admin-create');
      await waitForTestResult(page, 'admin-test-result');

      // 清除结果
      await clearTestResults(page);

      // 更新文件内容
      await page.fill('#admin-file-content', UPDATED_FILE_CONTENT);
      await page.click('#test-admin-update');
      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证结果
      expect(result).toContain('响应状态: 200');
      expect(result).toContain('更新成功');
      expect(page.locator('#status-content')).toContainText('管理员文件更新测试成功');

      // 验证文件内容确实被更新
      await clearTestResults(page);
      await page.click('#test-admin-read');
      const readResult = await waitForTestResult(page, 'admin-test-result');
      expect(readResult).toContain(UPDATED_FILE_CONTENT);
    });

    test('应该能够删除文件 (DELETE)', async () => {
      // 先创建文件
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);
      await page.click('#test-admin-create');
      await waitForTestResult(page, 'admin-test-result');

      // 清除结果
      await clearTestResults(page);

      // 删除文件
      await page.click('#test-admin-delete');
      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证结果
      expect(result).toContain('响应状态: 200');
      expect(result).toContain('删除成功');
      expect(page.locator('#status-content')).toContainText('管理员文件删除测试成功');

      // 验证文件确实被删除
      await clearTestResults(page);
      await page.click('#test-admin-read');
      const readResult = await waitForTestResult(page, 'admin-test-result');
      expect(readResult).toContain('响应状态: 404');
    });

    test('应该支持完整的 CRUD 流程', async () => {
      const testPath = 'local/crud-test.txt';
      const originalContent = 'CRUD 测试原始内容';
      const updatedContent = 'CRUD 测试更新内容';

      // 设置测试路径
      await page.fill('#admin-file-path', testPath);

      // 1. 创建 (CREATE)
      await page.fill('#admin-file-content', originalContent);
      await page.click('#test-admin-create');
      let result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain('响应状态: 201');

      // 2. 读取 (READ)
      await clearTestResults(page);
      await page.click('#test-admin-read');
      result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain('响应状态: 200');
      expect(result).toContain(originalContent);

      // 3. 更新 (UPDATE)
      await clearTestResults(page);
      await page.fill('#admin-file-content', updatedContent);
      await page.click('#test-admin-update');
      result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain('响应状态: 200');

      // 验证更新
      await clearTestResults(page);
      await page.click('#test-admin-read');
      result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain(updatedContent);

      // 4. 删除 (DELETE)
      await clearTestResults(page);
      await page.click('#test-admin-delete');
      result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain('响应状态: 200');

      // 验证删除
      await clearTestResults(page);
      await page.click('#test-admin-read');
      result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain('响应状态: 404');
    });
  });

  test.describe('公开文件访问测试', () => {
    test('应该能够读取公开文件', async () => {
      // 设置公开文件路径
      await page.fill('#public-file-path', PUBLIC_TEST_FILE_PATH);

      // 测试读取
      await page.click('#test-public-read');
      const result = await waitForTestResult(page, 'public-test-result');

      // 验证结果（文件可能存在也可能不存在，但应该有响应）
      expect(result).toMatch(/响应状态: (200|404)/);

      if (result.includes('响应状态: 200')) {
        expect(page.locator('#status-content')).toContainText('公开文件读取测试成功');
      }
    });

    test('应该支持不同的数据源', async () => {
      const sources = ['local', 'webdav'];

      for (const source of sources) {
        await clearTestResults(page);
        await page.fill('#public-file-path', `${source}/test.txt`);
        await page.click('#test-public-read');

        const result = await waitForTestResult(page, 'public-test-result');

        // 验证请求被正确处理（不管文件是否存在）
        expect(result).toMatch(/响应状态: (200|404)/);
        expect(result).toContain(`开始测试公开文件读取: ${source}/test.txt`);
      }
    });
  });

  test.describe('路径安全测试', () => {
    test('应该拒绝危险路径', async () => {
      const dangerousPaths = ['../../../etc/passwd', 'local/../../../etc/passwd', 'local//etc/passwd', '/etc/passwd'];

      for (const dangerousPath of dangerousPaths) {
        await clearTestResults(page);
        await page.fill('#admin-file-path', dangerousPath);
        await page.fill('#admin-file-content', 'test');
        await page.click('#test-admin-create');

        const result = await waitForTestResult(page, 'admin-test-result');

        // 根据实际 API 行为，危险路径可能返回 400 或 404
        // 400: 路径验证失败
        // 404: 路径被解析为页面路由而不是 API 路由
        expect(result).toMatch(/响应状态: (400|404)/);

        // 确保不是成功状态
        expect(result).not.toContain('响应状态: 200');
        expect(result).not.toContain('响应状态: 201');
        expect(result).not.toContain('创建成功');
      }
    });
  });

  test.describe('错误处理测试', () => {
    test('应该正确处理不存在的文件', async () => {
      await page.fill('#admin-file-path', 'local/non-existent-file.txt');
      await page.click('#test-admin-read');

      const result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain('响应状态: 404');
    });

    test('应该正确处理无效的数据源', async () => {
      await page.fill('#admin-file-path', 'invalid-source/test.txt');
      await page.fill('#admin-file-content', 'test');
      await page.click('#test-admin-create');

      const result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain('响应状态: 400');
      expect(result).toContain('Unsupported source');
    });

    test('应该正确处理空路径', async () => {
      await page.fill('#admin-file-path', '');
      await page.fill('#admin-file-content', 'test');
      await page.click('#test-admin-create');

      const result = await waitForTestResult(page, 'admin-test-result');
      expect(result).toContain('请输入文件路径');
    });
  });

  test.describe('批量测试', () => {
    test('应该能够运行所有测试', async () => {
      // 设置测试数据
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);

      // 运行所有测试
      await page.click('#run-all-tests');

      // 等待所有测试完成
      await page.waitForFunction(
        () => {
          const element = document.getElementById('batch-test-result');
          return element && element.textContent && element.textContent.includes('所有测试完成');
        },
        { timeout: 30000 }
      );

      const result = await page.locator('#batch-test-result').textContent();

      // 验证所有测试都被执行
      expect(result).toContain('开始测试: 公开文件读取');
      expect(result).toContain('开始测试: 管理员文件创建');
      expect(result).toContain('开始测试: 管理员文件读取');
      expect(result).toContain('开始测试: 管理员文件更新');
      expect(result).toContain('开始测试: 管理员文件删除');
      expect(result).toContain('开始测试: 权限控制');
      expect(result).toContain('所有测试完成');
    });
  });
});
