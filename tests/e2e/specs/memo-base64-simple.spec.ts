import { type BrowserContext, expect, test } from '@playwright/test';
import { MemosPage } from '../utils/memos-page';
import { generateUniqueContent, setupAdminAuth } from '../utils/test-helpers';
import { createIsolatedContext, TestIsolation, waitForAsyncOperations } from '../utils/test-isolation';

/**
 * 简化的Base64图片预览功能测试
 *
 * 这个测试专门验证我们修复的Base64图片预览功能是否正常工作
 */
test.describe('简化Base64图片预览测试', () => {
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

  test('应该能够在预览模式中显示Base64图片', async () => {
    console.log('🖼️ 开始简化Base64图片预览测试...');

    // 使用1x1像素透明PNG图片的Base64数据
    const base64Image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const contentWithBase64 = generateUniqueContent(`# 简化Base64测试

![测试图片](${base64Image})

测试完成。`);

    try {
      // 1. 填写包含Base64图片的内容
      console.log('📝 填写内容...');
      await memosPage.fillQuickEditor(contentWithBase64);

      // 2. 切换到预览模式
      console.log('👁️ 切换到预览模式...');
      const previewButton = memosPage.page.locator('[data-testid="preview-button"]');
      await expect(previewButton).toBeVisible({ timeout: 5000 });
      await previewButton.click();
      await memosPage.page.waitForTimeout(2000); // 等待预览模式切换

      // 3. 验证预览模式中的内容
      console.log('🔍 验证预览内容...');

      // 验证标题存在
      const heading = memosPage.page.locator('h1:has-text("简化Base64测试")');
      await expect(heading).toBeVisible({ timeout: 5000 });
      console.log('✅ 标题正确显示');

      // 调试：获取快速编辑器的预览区域
      const quickEditor = memosPage.page.locator('[data-testid="quick-memo-editor"]');
      const previewArea = quickEditor.locator('.prose').first();
      const previewHTML = await previewArea.innerHTML();
      console.log('🔍 预览区域HTML内容:', previewHTML.substring(0, 500) + '...');

      // 查找所有图片元素
      const allImages = await previewArea.locator('img').all();
      console.log(`🔍 预览区域中找到 ${allImages.length} 个图片元素`);

      for (let i = 0; i < allImages.length; i++) {
        const img = allImages[i];
        const src = await img.getAttribute('src');
        const alt = await img.getAttribute('alt');
        const isVisible = await img.isVisible();
        console.log(`🔍 图片 ${i + 1}: src=${src}, alt=${alt}, visible=${isVisible}`);
      }

      // 验证Base64图片存在
      const base64Img = previewArea.locator('img[src^="data:image/"]');
      const base64Count = await base64Img.count();
      console.log(`🔍 找到 ${base64Count} 个Base64图片`);

      if (base64Count > 0) {
        await expect(base64Img).toBeVisible({ timeout: 10000 });
        console.log('✅ Base64图片元素可见');

        // 验证图片src属性正确
        const imgSrc = await base64Img.getAttribute('src');
        expect(imgSrc).toBe(base64Image);
        console.log('✅ Base64图片src属性正确');
      } else {
        console.log('❌ 没有找到Base64图片，检查所有图片的src属性...');

        // 如果没有找到Base64图片，检查是否有其他图片
        const anyImg = previewArea.locator('img').first();
        if ((await anyImg.count()) > 0) {
          const anySrc = await anyImg.getAttribute('src');
          const anyAlt = await anyImg.getAttribute('alt');
          console.log(`🔍 第一个图片: src=${anySrc}, alt=${anyAlt}`);

          // 如果图片的alt是我们期望的，但src不对，说明有问题
          if (anyAlt === '测试图片') {
            console.log('❌ 找到了测试图片，但src不是Base64格式');
            throw new Error(`图片src不正确: 期望以"data:image/"开头，实际为"${anySrc}"`);
          }
        }

        throw new Error('没有找到任何Base64图片');
      }

      console.log('🎉 简化Base64图片预览测试成功');
    } catch (error) {
      console.error('❌ 简化Base64图片预览测试失败:', error);

      // 调试信息
      try {
        console.log('🔍 调试信息：');

        // 检查页面中的所有图片
        const allImages = await memosPage.page.locator('img').all();
        console.log(`页面中共有 ${allImages.length} 个图片元素`);

        for (let i = 0; i < Math.min(allImages.length, 5); i++) {
          const img = allImages[i];
          const src = await img.getAttribute('src');
          const isVisible = await img.isVisible();
          const alt = await img.getAttribute('alt');
          console.log(`图片 ${i + 1}: src=${src?.substring(0, 50)}..., visible=${isVisible}, alt=${alt}`);
        }

        // 检查页面中的所有标题
        const allHeadings = await memosPage.page.locator('h1, h2, h3').all();
        console.log(`页面中共有 ${allHeadings.length} 个标题元素`);

        for (let i = 0; i < Math.min(allHeadings.length, 3); i++) {
          const heading = allHeadings[i];
          const text = await heading.textContent();
          const isVisible = await heading.isVisible();
          console.log(`标题 ${i + 1}: text=${text}, visible=${isVisible}`);
        }

        // 检查预览按钮状态
        const previewButton = memosPage.page.locator('[data-testid="preview-button"]');
        const previewButtonText = await previewButton.textContent();
        console.log(`预览按钮文本: ${previewButtonText}`);

        // 检查编辑按钮状态
        const editButton = memosPage.page.locator('[data-testid="edit-button"]');
        const editButtonExists = await editButton.count();
        console.log(`编辑按钮存在: ${editButtonExists > 0}`);
      } catch (debugError) {
        console.warn('⚠️ 调试信息获取失败:', debugError);
      }

      throw error;
    }
  });

  test('应该能够发布包含Base64图片的闪念', async () => {
    console.log('🖼️ 开始Base64图片发布测试...');

    const base64Image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const contentWithBase64 = generateUniqueContent(`# 发布Base64测试

![发布图片](${base64Image})

发布测试完成。`);

    try {
      // 1. 填写内容并发布
      console.log('📝 填写内容并发布...');
      await memosPage.fillQuickEditor(contentWithBase64);
      await memosPage.publishMemo();

      // 2. 等待闪念出现
      console.log('⏳ 等待闪念发布完成...');
      await memosPage.waitForMemoToAppear('发布Base64测试');

      // 3. 验证发布后的Base64图片
      console.log('🔍 验证发布后的Base64图片...');
      const publishedMemo = memosPage.page.locator('[data-testid="memo-item"]').first();

      // 查找Base64图片元素
      const base64Img = publishedMemo.locator('img[src^="data:image/"]');
      await expect(base64Img).toBeVisible({ timeout: 10000 });
      console.log('✅ 发布后Base64图片元素可见');

      // 验证图片src属性正确
      const imgSrc = await base64Img.getAttribute('src');
      expect(imgSrc).toBe(base64Image);
      console.log('✅ 发布后Base64图片src属性正确');

      console.log('🎉 Base64图片发布测试成功');
    } catch (error) {
      console.error('❌ Base64图片发布测试失败:', error);
      throw error;
    }
  });
});
