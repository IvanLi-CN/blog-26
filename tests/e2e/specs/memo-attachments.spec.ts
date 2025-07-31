import { type BrowserContext, expect, test } from '@playwright/test';
import { generateTestImages } from '../utils/generate-test-images';
import { MemosPage } from '../utils/memos-page';
import { generateUniqueContent, setupAdminAuth, TestFiles } from '../utils/test-helpers';

test.describe('闪念附件上传测试', () => {
  let context: BrowserContext;
  let memosPage: MemosPage;

  test.beforeAll(async () => {
    // 生成测试图片
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

  test('应该能够上传PNG图片', async () => {
    const testContent = generateUniqueContent('PNG图片测试');

    // 1. 填写文本内容
    await memosPage.fillQuickEditor(testContent);

    // 2. 上传PNG图片
    await memosPage.uploadAttachment(TestFiles.pngImage);

    // 3. 验证附件预览显示
    await expect(memosPage.page.locator('.attachment-grid')).toBeVisible();
    await expect(memosPage.page.locator('.attachment-grid img')).toBeVisible();

    // 4. 发布闪念
    await memosPage.publishMemo();

    // 5. 验证闪念和附件都正确显示
    await memosPage.waitForMemoToAppear(testContent);
    const hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(true);
  });

  test('应该能够上传JPG图片', async () => {
    const testContent = generateUniqueContent('JPG图片测试');

    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(TestFiles.jpgImage);

    // 验证附件预览
    await expect(memosPage.page.locator('.attachment-grid')).toBeVisible();

    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    const hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.jpg');
    expect(hasAttachment).toBe(true);
  });

  test('应该能够上传GIF图片', async () => {
    const testContent = generateUniqueContent('GIF图片测试');

    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(TestFiles.gifImage);

    await expect(memosPage.page.locator('.attachment-grid')).toBeVisible();

    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    const hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.gif');
    expect(hasAttachment).toBe(true);
  });

  test('应该能够上传多个附件', async () => {
    const testContent = generateUniqueContent('多附件测试');

    await memosPage.fillQuickEditor(testContent);

    // 上传多个文件
    await memosPage.uploadAttachment(TestFiles.pngImage);
    await memosPage.page.waitForTimeout(1000); // 等待第一个文件上传完成

    await memosPage.uploadAttachment(TestFiles.jpgImage);
    await memosPage.page.waitForTimeout(1000);

    await memosPage.uploadAttachment(TestFiles.gifImage);

    // 验证多个附件都显示
    const attachmentItems = memosPage.page.locator('.attachment-grid .attachment-item');
    await expect(attachmentItems).toHaveCount(3);

    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 验证所有附件都保存
    const hasPng = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    const hasJpg = await memosPage.verifyAttachmentExists(0, 'test-image.jpg');
    const hasGif = await memosPage.verifyAttachmentExists(0, 'test-image.gif');

    expect(hasPng).toBe(true);
    expect(hasJpg).toBe(true);
    expect(hasGif).toBe(true);
  });

  test('应该支持拖拽上传', async () => {
    const testContent = generateUniqueContent('拖拽上传测试');

    await memosPage.fillQuickEditor(testContent);

    // 拖拽文件到编辑器
    await memosPage.dragAndDropFileToEditor(TestFiles.pngImage);

    // 验证附件显示
    await expect(memosPage.page.locator('.attachment-grid')).toBeVisible();

    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    const hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(true);
  });

  test('应该显示附件信息', async () => {
    const testContent = generateUniqueContent('附件信息测试');

    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(TestFiles.pngImage);

    // 验证附件信息显示
    const attachmentItem = memosPage.page.locator('.attachment-item').first();

    // 验证文件名显示
    await expect(attachmentItem).toContainText('test-image.png');

    // 验证文件大小显示
    await expect(attachmentItem.locator('.text-xs')).toBeVisible();

    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);
  });

  test('应该能够删除附件', async () => {
    const testContent = generateUniqueContent('删除附件测试');

    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(TestFiles.pngImage);

    // 验证附件存在
    await expect(memosPage.page.locator('.attachment-grid')).toBeVisible();

    // 删除附件
    const deleteButton = memosPage.page.locator('.attachment-item .btn-error').first();
    await deleteButton.click();

    // 验证附件被删除
    await expect(memosPage.page.locator('.attachment-grid')).not.toBeVisible();

    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 验证发布的闪念没有附件
    const hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(false);
  });

  test('应该处理文件上传错误', async () => {
    const testContent = generateUniqueContent('上传错误测试');

    await memosPage.fillQuickEditor(testContent);

    // 模拟上传失败
    await memosPage.page.route('**/api/trpc/memos.uploadAttachment*', (route) => {
      route.abort('failed');
    });

    // 尝试上传文件
    await memosPage.page.click('button:has-text("📎")');

    // 这里需要根据实际的错误处理逻辑来验证
    // 可能显示错误消息或者上传失败提示
  });

  test('应该支持图片点击放大', async () => {
    const testContent = generateUniqueContent('图片放大测试');

    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(TestFiles.pngImage);
    await memosPage.publishMemo();

    await memosPage.waitForMemoToAppear(testContent);

    // 点击图片
    const image = memosPage.page.locator('[data-testid="memo-item"]').first().locator('img').first();
    await image.click();

    // 验证放大视图显示（根据实际实现调整选择器）
    // await expect(memosPage.page.locator('.image-modal, .lightbox')).toBeVisible();
  });

  test('应该正确处理附件文件路径', async () => {
    const testContent = generateUniqueContent('文件路径测试');

    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(TestFiles.pngImage);
    await memosPage.publishMemo();

    await memosPage.waitForMemoToAppear(testContent);

    // 验证图片能够正确加载（检查src属性）
    const image = memosPage.page.locator('[data-testid="memo-item"]').first().locator('img').first();
    const src = await image.getAttribute('src');

    expect(src).toBeTruthy();
    expect(src).toContain('/assets/');

    // 验证图片实际可访问
    const response = await memosPage.page.request.get(src!);
    expect(response.ok()).toBe(true);
  });
});
