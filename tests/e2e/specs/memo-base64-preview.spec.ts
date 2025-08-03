import { type BrowserContext, expect, test } from '@playwright/test';
import { MemosPage } from '../utils/memos-page';
import { generateUniqueContent, setupAdminAuth } from '../utils/test-helpers';
import { createIsolatedContext, TestIsolation, waitForAsyncOperations } from '../utils/test-isolation';

/**
 * Base64图片预览功能E2E测试
 *
 * 这个测试套件专门测试我们修复的Base64图片预览功能，包括：
 * 1. Milkdown编辑器中的Base64图片预览
 * 2. 发布后的Base64图片显示
 * 3. 编辑器预览模式中的Base64图片渲染
 * 4. 各种图片格式的支持
 */
test.describe('Base64图片预览功能测试', () => {
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

  test('应该在编辑器预览模式中正确显示Base64图片', async () => {
    console.log('🖼️ 开始编辑器预览模式Base64图片测试...');

    // 使用1x1像素透明PNG图片的Base64数据
    const base64Image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const contentWithBase64 = generateUniqueContent(`# 测试Base64图片预览

这是一个包含Base64图片的测试闪念：

![测试图片](${base64Image})

这是一个1x1像素的透明图片。

#Base64 #预览测试 #E2E`);

    try {
      // 1. 填写包含Base64图片的内容
      console.log('📝 填写包含Base64图片的内容...');
      await memosPage.fillQuickEditor(contentWithBase64);

      // 2. 切换到预览模式
      console.log('👁️ 切换到预览模式...');
      const previewButton = memosPage.page.locator('[data-testid="preview-button"]');

      // 验证预览按钮存在
      await expect(previewButton).toBeVisible({ timeout: 5000 });
      console.log('✅ 预览按钮可见');

      // 点击预览按钮
      await previewButton.click();
      await memosPage.page.waitForTimeout(1000); // 等待预览模式切换

      // 3. 验证预览模式中的Base64图片
      console.log('🔍 验证预览模式中的Base64图片...');

      // 查找预览区域（快速发布编辑器的预览区域）
      const previewArea = memosPage.page.locator('[data-testid="content-input"]').first();
      await expect(previewArea).toBeVisible({ timeout: 5000 });
      console.log('✅ 预览区域可见');

      // 查找Base64图片元素
      const base64Img = previewArea.locator('img[src^="data:image/"]');
      await expect(base64Img).toBeVisible({ timeout: 10000 });
      console.log('✅ 预览模式中Base64图片元素可见');

      // 验证图片src属性正确
      const imgSrc = await base64Img.getAttribute('src');
      expect(imgSrc).toBe(base64Image);
      console.log('✅ 预览模式中Base64图片src属性正确');

      // 验证图片加载完成
      const isImageLoaded = await base64Img.evaluate((img: HTMLImageElement) => {
        return img.complete && img.naturalWidth > 0;
      });
      expect(isImageLoaded).toBe(true);
      console.log('✅ 预览模式中Base64图片加载完成');

      // 验证标题也正确显示
      const heading = previewArea.locator('h1');
      await expect(heading.first()).toBeVisible();
      const headingText = await heading.first().textContent();
      expect(headingText).toContain('测试Base64图片预览');
      console.log('✅ 预览模式中标题正确显示');

      console.log('🎉 编辑器预览模式Base64图片测试成功');
    } catch (error) {
      console.error('❌ 编辑器预览模式Base64图片测试失败:', error);

      // 调试信息
      try {
        const allImages = await memosPage.page.locator('img').all();
        console.log(`🔍 页面中共有 ${allImages.length} 个图片元素`);

        for (let i = 0; i < allImages.length; i++) {
          const img = allImages[i];
          const src = await img.getAttribute('src');
          const isVisible = await img.isVisible();
          console.log(`🔍 图片 ${i + 1}: src=${src?.substring(0, 50)}..., visible=${isVisible}`);
        }
      } catch (debugError) {
        console.warn('⚠️ 调试信息获取失败:', debugError);
      }

      throw error;
    }
  });

  test('应该在发布后正确显示Base64图片', async () => {
    console.log('🖼️ 开始发布后Base64图片显示测试...');

    // 使用不同的Base64图片数据
    const base64Image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    const contentWithBase64 = generateUniqueContent(`# E2E测试Base64图片

这是一个E2E测试，包含Base64图片：

![测试图片](${base64Image})

图片应该正常显示。

#E2E #Base64测试`);

    try {
      // 1. 填写内容并发布
      console.log('📝 填写内容并发布...');
      await memosPage.fillQuickEditor(contentWithBase64);
      await memosPage.publishMemo();

      // 2. 等待闪念出现
      console.log('⏳ 等待闪念发布完成...');
      await memosPage.waitForMemoToAppear('E2E测试Base64图片');

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

      // 验证图片加载完成
      const isImageLoaded = await base64Img.evaluate((img: HTMLImageElement) => {
        return img.complete && img.naturalWidth > 0;
      });
      expect(isImageLoaded).toBe(true);
      console.log('✅ 发布后Base64图片加载完成');

      console.log('🎉 发布后Base64图片显示测试成功');
    } catch (error) {
      console.error('❌ 发布后Base64图片测试失败:', error);
      throw error;
    }
  });

  test('应该支持多种Base64图片格式', async () => {
    console.log('🖼️ 开始多种Base64图片格式测试...');

    // 不同格式的Base64图片
    const pngImage =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const gifImage = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const webpImage = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';

    const multiFormatContent = generateUniqueContent(`# 多格式Base64图片测试

## PNG图片
![PNG图片](${pngImage})

## GIF图片
![GIF图片](${gifImage})

## WebP图片
![WebP图片](${webpImage})

所有格式的图片都应该正常显示。

#多格式 #Base64 #图片测试`);

    try {
      // 1. 填写内容
      console.log('📝 填写多格式Base64图片内容...');
      await memosPage.fillQuickEditor(multiFormatContent);

      // 2. 测试预览模式
      console.log('👁️ 测试预览模式...');
      const previewButton = memosPage.page.locator('[data-testid="preview-button"]');
      await previewButton.click();
      await memosPage.page.waitForTimeout(1000);

      // 验证预览模式中的多个图片
      const previewArea = memosPage.page.locator('[data-testid="content-input"]').first();
      const previewImages = previewArea.locator('img[src^="data:image/"]');
      const previewImageCount = await previewImages.count();

      console.log(`🔍 预览模式中找到 ${previewImageCount} 个Base64图片`);
      expect(previewImageCount).toBe(3);

      // 验证每个图片都可见
      for (let i = 0; i < previewImageCount; i++) {
        const img = previewImages.nth(i);
        await expect(img).toBeVisible({ timeout: 5000 });
        console.log(`✅ 预览模式中Base64图片 ${i + 1} 可见`);
      }

      // 3. 发布并验证
      console.log('📤 发布闪念...');
      const editButton = memosPage.page.locator('[data-testid="edit-button"]');
      await editButton.click(); // 切换回编辑模式
      await memosPage.page.waitForTimeout(500);

      await memosPage.publishMemo();
      await memosPage.waitForMemoToAppear('多格式Base64图片测试');

      // 验证发布后的多个图片
      const publishedMemo = memosPage.page.locator('[data-testid="memo-item"]').first();
      const publishedImages = publishedMemo.locator('img[src^="data:image/"]');
      const publishedImageCount = await publishedImages.count();

      console.log(`🔍 发布后找到 ${publishedImageCount} 个Base64图片`);
      expect(publishedImageCount).toBe(3);

      // 验证每个图片都正确加载
      for (let i = 0; i < publishedImageCount; i++) {
        const img = publishedImages.nth(i);
        await expect(img).toBeVisible({ timeout: 5000 });

        const isLoaded = await img.evaluate((imgEl: HTMLImageElement) => {
          return imgEl.complete && imgEl.naturalWidth > 0;
        });
        expect(isLoaded).toBe(true);

        console.log(`✅ 发布后Base64图片 ${i + 1} 加载完成`);
      }

      console.log('🎉 多种Base64图片格式测试成功');
    } catch (error) {
      console.error('❌ 多种Base64图片格式测试失败:', error);
      throw error;
    }
  });

  test('应该正确处理包含Base64图片的复杂内容', async () => {
    console.log('🖼️ 开始复杂内容Base64图片测试...');

    const base64Image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    const complexContent = generateUniqueContent(`# 复杂内容Base64图片测试

这是一个包含多种Markdown元素的复杂测试：

## 文本格式
- **粗体文本**
- *斜体文本*
- ~~删除线文本~~

## Base64图片
![测试图片](${base64Image})

## 代码块
\`\`\`javascript
function displayImage() {
  console.log('显示Base64图片');
}
\`\`\`

## 列表
1. 第一项
2. 第二项
3. 第三项

## 引用
> 这是一个引用块，包含Base64图片测试

## 链接
[测试链接](https://example.com)

#复杂内容 #Base64 #Markdown #测试`);

    try {
      // 1. 填写复杂内容
      console.log('📝 填写复杂内容...');
      await memosPage.fillQuickEditor(complexContent);

      // 2. 测试预览模式
      console.log('👁️ 测试预览模式...');
      const previewButton = memosPage.page.locator('[data-testid="preview-button"]');
      await previewButton.click();
      await memosPage.page.waitForTimeout(1000);

      // 验证预览模式中的各种元素
      const previewArea = memosPage.page.locator('[data-testid="content-input"]').first();

      // 验证Base64图片
      const base64Img = previewArea.locator('img[src^="data:image/"]');
      await expect(base64Img).toBeVisible({ timeout: 5000 });
      console.log('✅ 预览模式中Base64图片可见');

      // 验证其他Markdown元素
      const heading = previewArea.locator('h1');
      await expect(heading.first()).toBeVisible();
      console.log('✅ 预览模式中标题可见');

      const boldText = previewArea.locator('strong');
      await expect(boldText.first()).toBeVisible();
      console.log('✅ 预览模式中粗体文本可见');

      const codeBlock = previewArea.locator('pre code, code');
      await expect(codeBlock.first()).toBeVisible();
      console.log('✅ 预览模式中代码块可见');

      // 3. 发布并验证
      console.log('📤 发布复杂内容...');
      const editButton = memosPage.page.locator('[data-testid="edit-button"]');
      await editButton.click();
      await memosPage.page.waitForTimeout(500);

      await memosPage.publishMemo();
      await memosPage.waitForMemoToAppear('复杂内容Base64图片测试');

      // 验证发布后的内容
      const publishedMemo = memosPage.page.locator('[data-testid="memo-item"]').first();

      // 验证Base64图片
      const publishedImg = publishedMemo.locator('img[src^="data:image/"]');
      await expect(publishedImg).toBeVisible({ timeout: 5000 });

      const isLoaded = await publishedImg.evaluate((imgEl: HTMLImageElement) => {
        return imgEl.complete && imgEl.naturalWidth > 0;
      });
      expect(isLoaded).toBe(true);
      console.log('✅ 发布后Base64图片加载完成');

      // 验证其他元素
      const publishedBold = publishedMemo.locator('strong');
      await expect(publishedBold.first()).toBeVisible();
      console.log('✅ 发布后粗体文本可见');

      console.log('🎉 复杂内容Base64图片测试成功');
    } catch (error) {
      console.error('❌ 复杂内容Base64图片测试失败:', error);
      throw error;
    }
  });
});
