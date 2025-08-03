import { type BrowserContext, expect, test } from '@playwright/test';
import { MemosPage } from '../utils/memos-page';
import { generateUniqueContent, setupAdminAuth } from '../utils/test-helpers';
import { createIsolatedContext, TestIsolation, waitForAsyncOperations } from '../utils/test-isolation';

/**
 * Milkdown编辑器HTML转义处理E2E测试
 *
 * 这个测试套件专门测试我们修复的Milkdown编辑器HTML转义问题，包括：
 * 1. 标题转义处理 (\# → #)
 * 2. 图片转义处理 (!\[alt]\(url) → ![alt](url))
 * 3. 代码转义处理 (\` → `)
 * 4. 粗体/斜体转义处理 (\* → *, \_ → _)
 * 5. HTML换行转换 (<br /> → \n\n)
 */
test.describe('Milkdown编辑器转义处理测试', () => {
  let context: BrowserContext;
  let memosPage: MemosPage;
  let testIsolation: TestIsolation;

  test.beforeEach(async ({ browser }) => {
    // 创建测试隔离实例
    testIsolation = new TestIsolation();

    // 测试前清理
    await testIsolation.beforeTest();

    // 创建隔离的浏览器上下文
    context = await createIsolatedContext(browser);
    await setupAdminAuth(context);

    const page = await context.newPage();
    memosPage = new MemosPage(page);
    await memosPage.navigate();

    // 等待页面完全加载
    await waitForAsyncOperations(page);
  });

  test.afterEach(async () => {
    // 测试后清理
    await testIsolation.afterTest();

    if (context) {
      await context.close();
    }
  });

  test('应该正确处理标题转义', async () => {
    console.log('📝 开始标题转义处理测试...');

    // 模拟Milkdown输出的转义标题内容
    const contentWithEscapedHeading = generateUniqueContent(`\\# 转义标题测试

这是一个测试转义标题的内容。

\\## 二级转义标题

\\### 三级转义标题

正常内容应该正确显示。

#转义测试 #标题`);

    try {
      // 1. 填写包含转义标题的内容
      console.log('📝 填写包含转义标题的内容...');
      await memosPage.fillQuickEditor(contentWithEscapedHeading);

      // 2. 测试预览模式
      console.log('👁️ 测试预览模式中的标题转义处理...');
      const previewButton = memosPage.page.locator('[data-testid="preview-button"]');
      await previewButton.click();
      await memosPage.page.waitForTimeout(1000);

      // 验证预览模式中标题正确显示
      const previewArea = memosPage.page.locator('[data-testid="content-input"]').first();

      // 验证一级标题
      const h1 = previewArea.locator('h1');
      await expect(h1.first()).toBeVisible({ timeout: 5000 });
      const h1Text = await h1.first().textContent();
      expect(h1Text).toContain('转义标题测试');
      console.log('✅ 预览模式中一级标题正确显示');

      // 验证二级标题
      const h2 = previewArea.locator('h2');
      await expect(h2.first()).toBeVisible();
      const h2Text = await h2.first().textContent();
      expect(h2Text).toContain('二级转义标题');
      console.log('✅ 预览模式中二级标题正确显示');

      // 验证三级标题
      const h3 = previewArea.locator('h3');
      await expect(h3.first()).toBeVisible();
      const h3Text = await h3.first().textContent();
      expect(h3Text).toContain('三级转义标题');
      console.log('✅ 预览模式中三级标题正确显示');

      // 3. 发布并验证
      console.log('📤 发布并验证标题转义处理...');
      const editButton = memosPage.page.locator('[data-testid="edit-button"]');
      await editButton.click();
      await memosPage.page.waitForTimeout(500);

      await memosPage.publishMemo();
      await memosPage.waitForMemoToAppear('转义标题测试');

      // 验证发布后的标题
      const publishedMemo = memosPage.page.locator('[data-testid="memo-item"]').first();

      const publishedH1 = publishedMemo.locator('h1');
      await expect(publishedH1.first()).toBeVisible();
      const publishedH1Text = await publishedH1.first().textContent();
      expect(publishedH1Text).toContain('转义标题测试');
      console.log('✅ 发布后一级标题正确显示');

      console.log('🎉 标题转义处理测试成功');
    } catch (error) {
      console.error('❌ 标题转义处理测试失败:', error);
      throw error;
    }
  });

  test('应该正确处理文本格式转义', async () => {
    console.log('📝 开始文本格式转义处理测试...');

    // 模拟Milkdown输出的转义文本格式
    const contentWithEscapedFormat = generateUniqueContent(
      '# 文本格式转义测试\n\n这是 \\*\\*转义粗体\\*\\* 文本。\n\n这是 \\_转义斜体\\_ 文本。\n\n这是 \\`转义代码\\` 文本。\n\n这是 \\~\\~转义删除线\\~\\~ 文本。\n\n正常的**粗体**和*斜体*应该也能正常显示。\n\n#格式转义 #测试'
    );

    try {
      // 1. 填写内容
      console.log('📝 填写包含转义格式的内容...');
      await memosPage.fillQuickEditor(contentWithEscapedFormat);

      // 2. 测试预览模式
      console.log('👁️ 测试预览模式中的格式转义处理...');
      const previewButton = memosPage.page.locator('[data-testid="preview-button"]');
      await previewButton.click();
      await memosPage.page.waitForTimeout(1000);

      const previewArea = memosPage.page.locator('[data-testid="content-input"]').first();

      // 验证粗体文本
      const boldText = previewArea.locator('strong');
      const boldCount = await boldText.count();
      expect(boldCount).toBeGreaterThanOrEqual(1);

      const firstBoldText = await boldText.first().textContent();
      expect(firstBoldText).toContain('转义粗体');
      console.log('✅ 预览模式中转义粗体正确显示');

      // 验证斜体文本
      const italicText = previewArea.locator('em');
      const italicCount = await italicText.count();
      expect(italicCount).toBeGreaterThanOrEqual(1);

      const firstItalicText = await italicText.first().textContent();
      expect(firstItalicText).toContain('转义斜体');
      console.log('✅ 预览模式中转义斜体正确显示');

      // 验证代码文本
      const codeText = previewArea.locator('code');
      const codeCount = await codeText.count();
      expect(codeCount).toBeGreaterThanOrEqual(1);

      const firstCodeText = await codeText.first().textContent();
      expect(firstCodeText).toContain('转义代码');
      console.log('✅ 预览模式中转义代码正确显示');

      // 3. 发布并验证
      console.log('📤 发布并验证格式转义处理...');
      const editButton = memosPage.page.locator('[data-testid="edit-button"]');
      await editButton.click();
      await memosPage.page.waitForTimeout(500);

      await memosPage.publishMemo();
      await memosPage.waitForMemoToAppear('文本格式转义测试');

      // 验证发布后的格式
      const publishedMemo = memosPage.page.locator('[data-testid="memo-item"]').first();

      const publishedBold = publishedMemo.locator('strong');
      await expect(publishedBold.first()).toBeVisible();
      console.log('✅ 发布后转义粗体正确显示');

      const publishedItalic = publishedMemo.locator('em');
      await expect(publishedItalic.first()).toBeVisible();
      console.log('✅ 发布后转义斜体正确显示');

      const publishedCode = publishedMemo.locator('code');
      await expect(publishedCode.first()).toBeVisible();
      console.log('✅ 发布后转义代码正确显示');

      console.log('🎉 文本格式转义处理测试成功');
    } catch (error) {
      console.error('❌ 文本格式转义处理测试失败:', error);
      throw error;
    }
  });

  test('应该正确处理HTML换行转换', async () => {
    console.log('📝 开始HTML换行转换测试...');

    // 模拟Milkdown输出的HTML换行
    const contentWithHTMLBreaks = generateUniqueContent(`# HTML换行转换测试

第一行内容<br />第二行内容

第三行内容<br/>第四行内容

第五行内容<BR>第六行内容

正常的换行

应该也能正确显示。

#HTML换行 #转换测试`);

    try {
      // 1. 填写内容
      console.log('📝 填写包含HTML换行的内容...');
      await memosPage.fillQuickEditor(contentWithHTMLBreaks);

      // 2. 测试预览模式
      console.log('👁️ 测试预览模式中的HTML换行转换...');
      const previewButton = memosPage.page.locator('[data-testid="preview-button"]');
      await previewButton.click();
      await memosPage.page.waitForTimeout(1000);

      const previewArea = memosPage.page.locator('[data-testid="content-input"]').first();

      // 验证内容正确显示（HTML换行应该被转换为段落分隔）
      const paragraphs = previewArea.locator('p');
      const paragraphCount = await paragraphs.count();
      expect(paragraphCount).toBeGreaterThanOrEqual(3);
      console.log(`✅ 预览模式中找到 ${paragraphCount} 个段落`);

      // 验证内容包含预期文本
      const previewText = await previewArea.textContent();
      expect(previewText).toContain('第一行内容');
      expect(previewText).toContain('第二行内容');
      expect(previewText).toContain('第三行内容');
      expect(previewText).toContain('第四行内容');
      console.log('✅ 预览模式中HTML换行转换正确');

      // 3. 发布并验证
      console.log('📤 发布并验证HTML换行转换...');
      const editButton = memosPage.page.locator('[data-testid="edit-button"]');
      await editButton.click();
      await memosPage.page.waitForTimeout(500);

      await memosPage.publishMemo();
      await memosPage.waitForMemoToAppear('HTML换行转换测试');

      // 验证发布后的内容
      const publishedMemo = memosPage.page.locator('[data-testid="memo-item"]').first();
      const publishedText = await publishedMemo.textContent();

      expect(publishedText).toContain('第一行内容');
      expect(publishedText).toContain('第二行内容');
      console.log('✅ 发布后HTML换行转换正确');

      console.log('🎉 HTML换行转换测试成功');
    } catch (error) {
      console.error('❌ HTML换行转换测试失败:', error);
      throw error;
    }
  });

  test('应该正确处理混合转义内容', async () => {
    console.log('📝 开始混合转义内容测试...');

    const base64Image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    // 模拟Milkdown输出的混合转义内容
    const mixedEscapedContent = generateUniqueContent(
      '\\# 混合转义内容测试\n\n这是一个包含多种转义的复杂测试：\n\n\\## 文本格式\n- \\*\\*转义粗体\\*\\*\n- \\_转义斜体\\_\n- \\`转义代码\\`\n\n\\## 图片测试\n!\[转义图片]\(' +
        base64Image +
        ")\n\n<br />\n\n\\## 代码块\n\\`\\`\\`javascript\nconsole.log('转义代码块');\n\\`\\`\\`\n\n正常内容和**正常粗体**也应该正确显示。\n\n#混合转义 #复杂测试 #E2E"
    );

    try {
      // 1. 填写混合转义内容
      console.log('📝 填写混合转义内容...');
      await memosPage.fillQuickEditor(mixedEscapedContent);

      // 2. 测试预览模式
      console.log('👁️ 测试预览模式中的混合转义处理...');
      const previewButton = memosPage.page.locator('[data-testid="preview-button"]');
      await previewButton.click();
      await memosPage.page.waitForTimeout(1000);

      const previewArea = memosPage.page.locator('[data-testid="content-input"]').first();

      // 验证标题
      const h1 = previewArea.locator('h1');
      await expect(h1.first()).toBeVisible();
      const h1Text = await h1.first().textContent();
      expect(h1Text).toContain('混合转义内容测试');
      console.log('✅ 预览模式中转义标题正确显示');

      // 验证二级标题
      const h2 = previewArea.locator('h2');
      await expect(h2.first()).toBeVisible();
      console.log('✅ 预览模式中转义二级标题正确显示');

      // 验证Base64图片
      const base64Img = previewArea.locator('img[src^="data:image/"]');
      await expect(base64Img).toBeVisible({ timeout: 5000 });
      console.log('✅ 预览模式中转义Base64图片正确显示');

      // 验证文本格式
      const boldText = previewArea.locator('strong');
      await expect(boldText.first()).toBeVisible();
      console.log('✅ 预览模式中转义粗体正确显示');

      const italicText = previewArea.locator('em');
      await expect(italicText.first()).toBeVisible();
      console.log('✅ 预览模式中转义斜体正确显示');

      const codeText = previewArea.locator('code');
      await expect(codeText.first()).toBeVisible();
      console.log('✅ 预览模式中转义代码正确显示');

      // 3. 发布并验证
      console.log('📤 发布并验证混合转义处理...');
      const editButton = memosPage.page.locator('[data-testid="edit-button"]');
      await editButton.click();
      await memosPage.page.waitForTimeout(500);

      await memosPage.publishMemo();
      await memosPage.waitForMemoToAppear('混合转义内容测试');

      // 验证发布后的内容
      const publishedMemo = memosPage.page.locator('[data-testid="memo-item"]').first();

      // 验证Base64图片
      const publishedImg = publishedMemo.locator('img[src^="data:image/"]');
      await expect(publishedImg).toBeVisible();

      const isLoaded = await publishedImg.evaluate((imgEl: HTMLImageElement) => {
        return imgEl.complete && imgEl.naturalWidth > 0;
      });
      expect(isLoaded).toBe(true);
      console.log('✅ 发布后转义Base64图片正确显示');

      // 验证其他元素
      const publishedBold = publishedMemo.locator('strong');
      await expect(publishedBold.first()).toBeVisible();
      console.log('✅ 发布后转义粗体正确显示');

      console.log('🎉 混合转义内容测试成功');
    } catch (error) {
      console.error('❌ 混合转义内容测试失败:', error);
      throw error;
    }
  });
});
