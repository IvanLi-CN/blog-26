import { type BrowserContext, expect, test } from '@playwright/test';
import { generateTestImages } from '../utils/generate-test-images';
import { MemosPage } from '../utils/memos-page';
import { generateUniqueContent, setupAdminAuth, TestFiles, verifyWebDAVFile } from '../utils/test-helpers';

test.describe('闪念编辑功能测试', () => {
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

  test('应该能够编辑现有闪念的文本内容', async () => {
    const originalContent = generateUniqueContent('原始内容');
    const editedContent = generateUniqueContent('编辑后的内容');

    // 1. 创建一个闪念
    await memosPage.fillQuickEditor(originalContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(originalContent);

    // 2. 编辑闪念
    await memosPage.editMemo(0);

    // 3. 修改内容
    await memosPage.fillEditDrawer(editedContent);

    // 4. 保存更改
    await memosPage.saveEdit();

    // 5. 验证更改生效
    await memosPage.waitForMemoToAppear(editedContent);
    const memoExists = await memosPage.verifyMemoExists(editedContent);
    expect(memoExists).toBe(true);

    // 6. 验证原内容不再存在
    const originalExists = await memosPage.verifyMemoExists(originalContent);
    expect(originalExists).toBe(false);
  });

  test('应该能够编辑闪念的公开/私有状态', async () => {
    const testContent = generateUniqueContent('状态切换测试');

    // 1. 创建公开闪念
    await memosPage.fillQuickEditor(testContent);
    await memosPage.setPublicStatus(true);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 2. 验证初始状态为公开
    let isPublic = await memosPage.isMemoPublic(0);
    expect(isPublic).toBe(true);

    // 3. 编辑闪念，改为私有
    await memosPage.editMemo(0);
    await memosPage.page.locator('.drawer-open input[type="checkbox"]').uncheck();
    await memosPage.saveEdit();

    // 4. 验证状态已改为私有
    isPublic = await memosPage.isMemoPublic(0);
    expect(isPublic).toBe(false);
  });

  test('应该能够在编辑时添加附件', async () => {
    const testContent = generateUniqueContent('添加附件测试');

    // 1. 创建不带附件的闪念
    await memosPage.fillQuickEditor(testContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 2. 验证初始没有附件
    let hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(false);

    // 3. 编辑闪念，添加附件
    await memosPage.editMemo(0);

    // 在编辑抽屉中上传附件
    await memosPage.page.click('.drawer-open button:has-text("📎")');
    const fileInput = memosPage.page.locator('.drawer-open input[type="file"]');
    await fileInput.setInputFiles(TestFiles.pngImage);

    // 等待上传完成
    await memosPage.page.waitForTimeout(2000);

    await memosPage.saveEdit();

    // 4. 验证附件已添加
    hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(true);
  });

  test('应该能够在编辑时删除附件', async () => {
    const testContent = generateUniqueContent('删除附件测试');

    // 1. 创建带附件的闪念
    await memosPage.fillQuickEditor(testContent);
    await memosPage.uploadAttachment(TestFiles.pngImage);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 2. 验证初始有附件
    let hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(true);

    // 3. 编辑闪念，删除附件
    await memosPage.editMemo(0);

    // 在编辑抽屉中删除附件
    const deleteButton = memosPage.page.locator('.drawer-open .attachment-item .btn-error').first();
    await deleteButton.click();

    await memosPage.saveEdit();

    // 4. 验证附件已删除
    hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(false);
  });

  test('应该能够取消编辑操作', async () => {
    const originalContent = generateUniqueContent('取消编辑测试');
    const modifiedContent = generateUniqueContent('修改的内容');

    // 1. 创建闪念
    await memosPage.fillQuickEditor(originalContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(originalContent);

    // 2. 开始编辑
    await memosPage.editMemo(0);

    // 3. 修改内容但不保存
    await memosPage.fillEditDrawer(modifiedContent);

    // 4. 取消编辑
    await memosPage.cancelEdit();

    // 5. 验证原内容保持不变
    const originalExists = await memosPage.verifyMemoExists(originalContent);
    expect(originalExists).toBe(true);

    const modifiedExists = await memosPage.verifyMemoExists(modifiedContent);
    expect(modifiedExists).toBe(false);
  });

  test('应该能够编辑包含复杂Markdown的闪念', async () => {
    const originalMarkdown = `# 原始标题

## 原始内容
- 原始列表项1
- 原始列表项2

\`\`\`javascript
// 原始代码
console.log('original');
\`\`\`

#原始标签`;

    const editedMarkdown = `# 编辑后标题

## 编辑后内容
- 编辑后列表项1
- 编辑后列表项2
- 新增列表项3

\`\`\`typescript
// 编辑后代码
console.log('edited');
interface NewType {
  id: number;
}
\`\`\`

> 新增的引用块

#编辑后标签 #新标签`;

    // 1. 创建包含Markdown的闪念
    await memosPage.fillQuickEditor(originalMarkdown);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear('原始标题');

    // 2. 编辑Markdown内容
    await memosPage.editMemo(0);
    await memosPage.fillEditDrawer(editedMarkdown);
    await memosPage.saveEdit();

    // 3. 验证编辑后的Markdown正确渲染
    await memosPage.waitForMemoToAppear('编辑后标题');

    const memoContent = memosPage.page.locator('[data-testid="memo-item"]').first().locator('.prose');

    // 验证标题更新
    await expect(memoContent.locator('h1')).toContainText('编辑后标题');

    // 验证列表更新
    await expect(memoContent.locator('li')).toHaveCount(3);

    // 验证代码块更新
    await expect(memoContent.locator('pre code')).toContainText('edited');
    await expect(memoContent.locator('pre code')).toContainText('interface NewType');

    // 验证新增的引用块
    await expect(memoContent.locator('blockquote')).toContainText('新增的引用块');

    // 4. 验证标签更新
    const tags = await memosPage.getMemoTags(0);
    expect(tags).toContain('编辑后标签');
    expect(tags).toContain('新标签');
    expect(tags).not.toContain('原始标签');
  });

  test('应该能够删除闪念', async () => {
    const testContent = generateUniqueContent('删除测试');

    // 1. 创建闪念
    await memosPage.fillQuickEditor(testContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 2. 记录初始闪念数量
    const initialCount = await memosPage.getMemoCount();

    // 3. 删除闪念
    await memosPage.deleteMemo(0);

    // 4. 验证闪念已删除
    const finalCount = await memosPage.getMemoCount();
    expect(finalCount).toBe(initialCount - 1);

    // 5. 验证内容不再存在
    const memoExists = await memosPage.verifyMemoExists(testContent);
    expect(memoExists).toBe(false);
  });

  test('应该处理编辑时的验证错误', async () => {
    const testContent = generateUniqueContent('验证错误测试');

    // 1. 创建闪念
    await memosPage.fillQuickEditor(testContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(testContent);

    // 2. 编辑闪念
    await memosPage.editMemo(0);

    // 3. 清空内容（应该触发验证错误）
    await memosPage.fillEditDrawer('');

    // 4. 尝试保存
    await memosPage.page.click('.drawer-open button:has-text("保存")');

    // 5. 验证错误提示显示
    await expect(memosPage.page.locator('.alert-error, .error-message')).toBeVisible();

    // 6. 验证编辑抽屉仍然打开
    await expect(memosPage.page.locator('.drawer-open')).toBeVisible();
  });

  test('应该保持编辑历史和时间戳', async () => {
    const originalContent = generateUniqueContent('时间戳测试');
    const editedContent = generateUniqueContent('编辑后内容');

    // 1. 创建闪念
    await memosPage.fillQuickEditor(originalContent);
    await memosPage.publishMemo();
    await memosPage.waitForMemoToAppear(originalContent);

    // 2. 记录创建时间
    const originalTime = await memosPage.page
      .locator('[data-testid="memo-item"]')
      .first()
      .locator('.text-xs')
      .textContent();

    // 3. 等待一段时间后编辑
    await memosPage.page.waitForTimeout(2000);

    // 4. 编辑内容
    await memosPage.editMemo(0);
    await memosPage.fillEditDrawer(editedContent);
    await memosPage.saveEdit();

    // 5. 验证更新时间发生变化
    await memosPage.waitForMemoToAppear(editedContent);
    const updatedTime = await memosPage.page
      .locator('[data-testid="memo-item"]')
      .first()
      .locator('.text-xs')
      .textContent();

    // 时间应该不同（实际实现可能需要更精确的时间比较）
    expect(updatedTime).not.toBe(originalTime);
  });
});
