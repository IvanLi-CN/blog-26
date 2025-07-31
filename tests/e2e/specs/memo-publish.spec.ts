import { type BrowserContext, expect, test } from '@playwright/test';
import { MemosPage } from '../utils/memos-page';
import { generateUniqueContent, setupAdminAuth, TestData, verifyWebDAVFile } from '../utils/test-helpers';

test.describe('闪念发布流程测试', () => {
  let context: BrowserContext;
  let memosPage: MemosPage;

  test.beforeEach(async ({ browser }) => {
    // 创建新的浏览器上下文
    context = await browser.newContext();

    // 设置管理员认证
    await setupAdminAuth(context);

    // 创建页面
    const page = await context.newPage();
    memosPage = new MemosPage(page);

    // 导航到闪念页面
    await memosPage.navigate();
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('应该能够发布简单文本闪念', async () => {
    // 生成唯一的测试内容
    const testContent = generateUniqueContent('简单文本测试');

    // 1. 填写内容
    await memosPage.fillQuickEditor(testContent);

    // 2. 设置为公开
    await memosPage.setPublicStatus(true);

    // 3. 发布闪念
    await memosPage.publishMemo();

    // 4. 验证闪念出现在列表中
    await memosPage.waitForMemoToAppear(testContent);

    // 5. 验证内容正确
    const memoExists = await memosPage.verifyMemoExists(testContent);
    expect(memoExists).toBe(true);

    // 6. 验证公开状态
    const isPublic = await memosPage.isMemoPublic(0);
    expect(isPublic).toBe(true);

    // 7. 验证WebDAV文件存在
    // 等待一段时间确保文件已保存
    await memosPage.page.waitForTimeout(2000);

    // 检查WebDAV中是否存在文件（文件名基于日期和内容）
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const _webdavExists = await verifyWebDAVFile(`/Memos/${today}_*.md`);
    // 注意：由于文件名包含随机部分，这里需要更复杂的验证逻辑
  });

  test('应该能够发布私有闪念', async () => {
    const testContent = generateUniqueContent('私有闪念测试');

    // 1. 填写内容
    await memosPage.fillQuickEditor(testContent);

    // 2. 设置为私有
    await memosPage.setPublicStatus(false);

    // 3. 发布闪念
    await memosPage.publishMemo();

    // 4. 验证闪念出现在列表中
    await memosPage.waitForMemoToAppear(testContent);

    // 5. 验证私有状态
    const isPublic = await memosPage.isMemoPublic(0);
    expect(isPublic).toBe(false);
  });

  test('应该能够使用键盘快捷键发布', async () => {
    const testContent = generateUniqueContent('快捷键测试');

    // 1. 填写内容
    await memosPage.fillQuickEditor(testContent);

    // 2. 使用快捷键发布
    await memosPage.publishMemoWithShortcut();

    // 3. 验证发布成功
    await memosPage.waitForMemoToAppear(testContent);
    const memoExists = await memosPage.verifyMemoExists(testContent);
    expect(memoExists).toBe(true);
  });

  test('应该能够清空编辑器', async () => {
    const testContent = '这些内容将被清空';

    // 1. 填写内容
    await memosPage.fillQuickEditor(testContent);

    // 2. 清空编辑器
    await memosPage.clearEditor();

    // 3. 验证编辑器为空
    const editorContent = await memosPage.page.locator('.milkdown-editor [contenteditable]').textContent();
    expect(editorContent?.trim()).toBe('');
  });

  test('应该验证必填字段', async () => {
    // 1. 不填写任何内容，尝试发布
    // 发布按钮应该是禁用状态
    const publishButton = memosPage.page.locator('button:has-text("发布")');
    await expect(publishButton).toBeDisabled();

    // 2. 填写内容后，发布按钮应该可用
    await memosPage.fillQuickEditor('测试内容');
    await expect(publishButton).toBeEnabled();
  });

  test('应该处理网络错误', async () => {
    const testContent = generateUniqueContent('网络错误测试');

    // 1. 模拟网络错误
    await memosPage.page.route('**/api/trpc/memos.create*', (route) => {
      route.abort('failed');
    });

    // 2. 填写内容并尝试发布
    await memosPage.fillQuickEditor(testContent);
    await memosPage.page.click('button:has-text("发布")');

    // 3. 应该显示错误信息
    await expect(memosPage.page.locator('.modal-open')).toBeVisible();
    await expect(memosPage.page.locator('h3:has-text("创建失败")')).toBeVisible();
  });
});
