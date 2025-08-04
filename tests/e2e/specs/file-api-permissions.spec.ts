import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { clearAuthState, createNonAdminContext } from '../utils/non-admin-context';

// 测试数据
const TEST_FILE_CONTENT = '权限测试文件内容';
const TEST_FILE_PATH = 'local/permission-test.txt';
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

test.describe('文件 API 权限控制测试', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    // 使用专门的非管理员上下文
    context = await createNonAdminContext(browser);
    page = await context.newPage();

    // 确保清除所有认证状态
    await clearAuthState(context);

    // 导航到测试页面
    await page.goto('/admin/file-api-test');
    await page.waitForLoadState('networkidle');

    // 等待页面初始化
    await expect(page.locator('#status-content')).toContainText('页面加载完成');
  });

  test.afterEach(async () => {
    await context.close();
  });

  test.describe('非管理员模式权限测试', () => {
    test('应该拒绝非管理员创建文件', async () => {
      // 设置测试数据
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);

      // 尝试创建文件
      await page.click('#test-admin-create');

      // 等待结果
      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证被拒绝
      expect(result).toContain('响应状态: 403');
      expect(result).toContain('Admin access required');
      expect(page.locator('#status-content')).toContainText('管理员文件创建测试失败');
    });

    test('应该拒绝非管理员读取文件', async () => {
      // 设置测试数据
      await page.fill('#admin-file-path', TEST_FILE_PATH);

      // 尝试读取文件
      await page.click('#test-admin-read');

      // 等待结果
      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证被拒绝
      expect(result).toContain('响应状态: 403');
      expect(result).toContain('Admin access required');
      expect(page.locator('#status-content')).toContainText('管理员文件读取测试失败');
    });

    test('应该拒绝非管理员更新文件', async () => {
      // 设置测试数据
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);

      // 尝试更新文件
      await page.click('#test-admin-update');

      // 等待结果
      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证被拒绝
      expect(result).toContain('响应状态: 403');
      expect(result).toContain('Admin access required');
      expect(page.locator('#status-content')).toContainText('管理员文件更新测试失败');
    });

    test('应该拒绝非管理员删除文件', async () => {
      // 设置测试数据
      await page.fill('#admin-file-path', TEST_FILE_PATH);

      // 尝试删除文件
      await page.click('#test-admin-delete');

      // 等待结果
      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证被拒绝
      expect(result).toContain('响应状态: 403');
      expect(result).toContain('Admin access required');
      expect(page.locator('#status-content')).toContainText('管理员文件删除测试失败');
    });

    test('应该允许非管理员访问公开文件', async () => {
      // 设置公开文件路径
      await page.fill('#public-file-path', PUBLIC_TEST_FILE_PATH);

      // 测试读取公开文件
      await page.click('#test-public-read');
      const result = await waitForTestResult(page, 'public-test-result');

      // 验证可以访问（不管文件是否存在，但不应该是权限错误）
      expect(result).toMatch(/响应状态: (200|404)/);
      expect(result).not.toContain('403');
      expect(result).not.toContain('Admin access required');
    });

    test('权限控制测试应该显示正常', async () => {
      // 运行权限控制测试
      await page.click('#test-permission-check');

      // 等待结果
      const result = await waitForTestResult(page, 'permission-test-result');

      // 验证权限控制正常工作
      expect(result).toContain('响应状态: 403');
      expect(result).toContain('权限控制正常：未授权访问被拒绝');
      expect(page.locator('#status-content')).toContainText('权限控制测试成功');
    });

    test('所有管理员 API 操作都应该被拒绝', async () => {
      const operations = [
        { name: '创建', button: '#test-admin-create' },
        { name: '读取', button: '#test-admin-read' },
        { name: '更新', button: '#test-admin-update' },
        { name: '删除', button: '#test-admin-delete' },
      ];

      // 设置测试数据
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);

      for (const operation of operations) {
        await clearTestResults(page);

        // 执行操作
        await page.click(operation.button);

        // 等待结果
        const result = await waitForTestResult(page, 'admin-test-result');

        // 验证被拒绝
        expect(result).toContain('响应状态: 403');
        expect(result).toContain('Admin access required');

        console.log(`✓ ${operation.name}操作正确被拒绝`);
      }
    });
  });

  test.describe('API 端点差异测试', () => {
    test('管理员 API 和公开 API 应该有不同的行为', async () => {
      const testPath = 'webdav/api-diff-test.txt';

      // 测试管理员 API - 应该被拒绝
      await page.fill('#admin-file-path', `local/${testPath}`);
      await page.click('#test-admin-read');
      const adminResult = await waitForTestResult(page, 'admin-test-result');
      expect(adminResult).toContain('响应状态: 403');

      // 清除结果
      await clearTestResults(page);

      // 测试公开 API - 应该可以访问（即使文件不存在）
      await page.fill('#public-file-path', testPath);
      await page.click('#test-public-read');
      const publicResult = await waitForTestResult(page, 'public-test-result');
      expect(publicResult).toMatch(/响应状态: (200|404)/);
      expect(publicResult).not.toContain('403');
    });
  });

  test.describe('错误消息验证', () => {
    test('应该返回正确的错误消息格式', async () => {
      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);
      await page.click('#test-admin-create');

      const result = await waitForTestResult(page, 'admin-test-result');

      // 验证错误消息格式
      expect(result).toContain('响应状态: 403');
      // API 返回的是 JSON 格式的错误消息
      expect(result).toMatch(/错误: .*Admin access required/);
    });

    test('不同操作应该返回一致的权限错误', async () => {
      const operations = ['#test-admin-create', '#test-admin-read', '#test-admin-update', '#test-admin-delete'];

      await page.fill('#admin-file-path', TEST_FILE_PATH);
      await page.fill('#admin-file-content', TEST_FILE_CONTENT);

      for (const operation of operations) {
        await clearTestResults(page);
        await page.click(operation);

        const result = await waitForTestResult(page, 'admin-test-result');

        // 所有操作都应该返回相同的权限错误
        expect(result).toContain('响应状态: 403');
        expect(result).toContain('Admin access required');
      }
    });
  });
});
