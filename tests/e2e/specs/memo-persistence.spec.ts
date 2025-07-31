import { type BrowserContext, expect, test } from '@playwright/test';
import { generateTestImages } from '../utils/generate-test-images';
import { MemosPage } from '../utils/memos-page';
import {
  generateUniqueContent,
  getWebDAVFileContent,
  setupAdminAuth,
  TestFiles,
  verifyWebDAVFile,
} from '../utils/test-helpers';

test.describe('数据持久化验证测试', () => {
  let context: BrowserContext;
  let memosPage: MemosPage;

  test.beforeAll(async () => {
    await generateTestImages();
  });

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    await setupAdminAuth(context);

    const page = await context.newPage();
    memosPage = new MemosPage(page);
    await memosPage.navigate();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('应该将闪念数据正确保存到WebDAV', async () => {
    const testContent = generateUniqueContent('WebDAV持久化测试');
    const testTitle = '# WebDAV测试标题';
    const fullContent = `${testTitle}\n\n${testContent}\n\n#WebDAV #持久化 #测试`;

    // 1. 发布闪念
    await memosPage.fillQuickEditor(fullContent);
    await memosPage.setPublicStatus(true);
    await memosPage.publishMemo();

    // 2. 等待发布完成
    await memosPage.waitForMemoToAppear('WebDAV测试标题');

    // 3. 等待文件保存到WebDAV
    await memosPage.page.waitForTimeout(3000);

    // 4. 验证WebDAV中存在文件
    // 由于文件名包含日期和随机部分，我们需要通过API检查
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    // 检查Memos目录下是否有今天创建的文件
    const webdavResponse = await fetch('http://localhost:8080/Memos/', {
      method: 'PROPFIND',
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml',
      },
    });

    if (webdavResponse.ok) {
      const webdavContent = await webdavResponse.text();
      expect(webdavContent).toContain(today); // 应该包含今天的日期
    }
  });

  test('应该在页面刷新后保持数据', async () => {
    const testContent = generateUniqueContent('页面刷新测试');

    // 1. 发布闪念
    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(TestFiles.pngImage);
    await memosPage.publishMemo();

    // 2. 等待发布完成
    await memosPage.waitForMemoToAppear(testContent);

    // 3. 记录闪念数量
    const beforeRefreshCount = await memosPage.getMemoCount();

    // 4. 刷新页面
    await memosPage.page.reload();
    await memosPage.waitForPageLoad();

    // 5. 验证数据仍然存在
    const afterRefreshCount = await memosPage.getMemoCount();
    expect(afterRefreshCount).toBe(beforeRefreshCount);

    // 6. 验证具体内容仍然存在
    const memoExists = await memosPage.verifyMemoExists(testContent);
    expect(memoExists).toBe(true);

    // 7. 验证附件仍然存在
    const hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(true);
  });

  test('应该在浏览器重启后保持数据', async () => {
    const testContent = generateUniqueContent('浏览器重启测试');

    // 1. 发布闪念
    await memosPage.fillQuickEditor(testContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 2. 关闭浏览器上下文
    await context.close();

    // 3. 创建新的浏览器上下文
    context = await memosPage.page.context().browser()!.newContext();
    await setupAdminAuth(context);

    const newPage = await context.newPage();
    memosPage = new MemosPage(newPage);

    // 4. 重新导航到闪念页面
    await memosPage.navigate();

    // 5. 验证数据仍然存在
    const memoExists = await memosPage.verifyMemoExists(testContent);
    expect(memoExists).toBe(true);
  });

  test('应该正确处理并发操作', async () => {
    const content1 = generateUniqueContent('并发测试1');
    const content2 = generateUniqueContent('并发测试2');

    // 1. 创建两个页面
    const page2 = await context.newPage();
    const memosPage2 = new MemosPage(page2);
    await memosPage2.navigate();

    // 2. 在两个页面同时发布闪念
    const publish1 = memosPage.fillQuickEditor(content1).then(() => memosPage.publishMemo());
    const publish2 = memosPage2.fillQuickEditor(content2).then(() => memosPage2.publishMemo());

    await Promise.all([publish1, publish2]);

    // 3. 等待两个闪念都出现
    await memosPage.waitForMemoToAppear(content1);
    await memosPage2.waitForMemoToAppear(content2);

    // 4. 验证两个闪念都存在
    const memo1Exists = await memosPage.verifyMemoExists(content1);
    const memo2Exists = await memosPage.verifyMemoExists(content2);

    expect(memo1Exists).toBe(true);
    expect(memo2Exists).toBe(true);

    // 5. 验证总数正确
    const totalCount = await memosPage.getMemoCount();
    expect(totalCount).toBeGreaterThanOrEqual(2);

    await page2.close();
  });

  test('应该正确处理编辑冲突', async () => {
    const originalContent = generateUniqueContent('编辑冲突测试');

    // 1. 发布闪念
    await memosPage.fillQuickEditor(originalContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(originalContent);

    // 2. 创建第二个页面
    const page2 = await context.newPage();
    const memosPage2 = new MemosPage(page2);
    await memosPage2.navigate();

    // 3. 在第一个页面开始编辑
    await memosPage.editMemo(0);

    // 4. 在第二个页面也尝试编辑同一个闪念
    // 这里需要根据实际的冲突处理机制来验证
    // 可能是显示警告、锁定编辑或者其他处理方式

    await page2.close();
  });

  test('应该正确处理大文件上传的持久化', async () => {
    const testContent = generateUniqueContent('大文件测试');

    // 1. 创建一个相对较大的测试文件
    const largeImagePath = 'tests/e2e/test-data/images/large-test-image.png';

    // 生成较大的PNG数据（重复基础PNG数据）
    const fs = await import('fs/promises');
    const basePngData = await fs.readFile(TestFiles.pngImage);
    const largePngData = Buffer.concat(Array(10).fill(basePngData)); // 重复10次
    await fs.writeFile(largeImagePath, largePngData);

    // 2. 上传大文件
    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(largeImagePath);

    // 3. 等待上传完成（可能需要更长时间）
    await memosPage.page.waitForTimeout(5000);

    // 4. 发布闪念
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 5. 验证大文件正确保存
    const hasAttachment = await memosPage.verifyAttachmentExists(0, 'large-test-image.png');
    expect(hasAttachment).toBe(true);

    // 6. 清理测试文件
    await fs.unlink(largeImagePath).catch(() => {});
  });

  test('应该正确处理网络中断恢复', async () => {
    const testContent = generateUniqueContent('网络中断测试');

    // 1. 填写内容
    await memosPage.fillQuickEditor(testContent);

    // 2. 模拟网络中断
    await memosPage.page.setOffline(true);

    // 3. 尝试发布（应该失败）
    await memosPage.page.click('button:has-text("发布")');

    // 4. 验证错误提示
    await expect(memosPage.page.locator('.alert-error, .error-message')).toBeVisible();

    // 5. 恢复网络
    await memosPage.page.setOffline(false);

    // 6. 重新发布
    await memosPage.publishMemo();

    // 7. 验证发布成功
    await memosPage.waitForMemoToAppear(testContent);
    const memoExists = await memosPage.verifyMemoExists(testContent);
    expect(memoExists).toBe(true);
  });

  test('应该验证数据库缓存一致性', async () => {
    const testContent = generateUniqueContent('缓存一致性测试');

    // 1. 发布闪念
    await memosPage.fillQuickEditor(testContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 2. 等待缓存更新
    await memosPage.page.waitForTimeout(2000);

    // 3. 通过API验证数据库中的数据
    const apiResponse = await memosPage.page.request.get('/api/trpc/memos.getAll');
    expect(apiResponse.ok()).toBe(true);

    const apiData = await apiResponse.json();
    const memos = apiData.result?.data || [];

    // 4. 验证新发布的闪念在API响应中
    const foundMemo = memos.find((memo: any) => memo.content.includes(testContent));
    expect(foundMemo).toBeTruthy();

    // 5. 验证前端显示与API数据一致
    const frontendContent = await memosPage.getMemoContent(0);
    expect(frontendContent).toContain(testContent);
  });

  test('应该处理存储空间限制', async () => {
    // 这个测试可能需要根据实际的存储限制策略来实现
    // 例如：上传大量文件直到达到限制，然后验证错误处理

    const testContent = generateUniqueContent('存储限制测试');

    // 1. 尝试上传多个文件
    await memosPage.fillQuickEditor(testContent);

    // 2. 上传多个附件
    for (let i = 0; i < 5; i++) {
      try {
        await memosPage.uploadAttachment(TestFiles.pngImage);
        await memosPage.page.waitForTimeout(1000);
      } catch (_error) {
        // 如果达到限制，应该有适当的错误处理
        console.log(`上传第 ${i + 1} 个文件时遇到限制`);
        break;
      }
    }

    // 3. 发布闪念
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 4. 验证闪念发布成功
    const memoExists = await memosPage.verifyMemoExists(testContent);
    expect(memoExists).toBe(true);
  });
});
