import { type BrowserContext, expect, test } from '@playwright/test';
import { generateTestImages } from '../utils/generate-test-images';
import { MemosPage } from '../utils/memos-page';
import { generateUniqueContent, setupAdminAuth, TestData, TestFiles } from '../utils/test-helpers';

test.describe('混合内容发布测试', () => {
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

  test('应该能够发布包含文本+Markdown+图片的混合内容', async () => {
    const mixedContent = `# 混合内容测试 ${Date.now()}

## 基础文本
这是一个包含多种元素的综合测试闪念。

## Markdown格式
- **粗体文本**
- *斜体文本*
- ~~删除线文本~~
- \`行内代码\`

## 代码块
\`\`\`javascript
function testMixedContent() {
  console.log('测试混合内容功能');
  return {
    text: true,
    markdown: true,
    images: true,
    tags: ['#混合内容', '#测试']
  };
}
\`\`\`

## 列表和引用
1. 第一项
2. 第二项
   - 子项目A
   - 子项目B

> 这是一个重要的引用块，说明了混合内容的重要性。

## 链接和表格
访问 [测试链接](https://example.com) 了解更多。

| 内容类型 | 支持状态 | 备注 |
|----------|----------|------|
| 纯文本 | ✅ | 基础功能 |
| Markdown | ✅ | 完整支持 |
| 图片附件 | ✅ | 多格式 |
| 混合内容 | ✅ | 当前测试 |

## 标签系统
#混合内容 #E2E测试 #Playwright #自动化测试 #前端/React #后端/tRPC

---
*这是一个包含文本、Markdown和图片的综合测试内容。*`;

    // 1. 填写混合内容
    await memosPage.fillQuickEditor(mixedContent);

    // 2. 上传多个不同格式的图片
    await memosPage.uploadAttachment(TestFiles.pngImage);
    await memosPage.page.waitForTimeout(1000);

    await memosPage.uploadAttachment(TestFiles.jpgImage);
    await memosPage.page.waitForTimeout(1000);

    await memosPage.uploadAttachment(TestFiles.gifImage);

    // 3. 设置为公开
    await memosPage.setPublicStatus(true);

    // 4. 发布闪念
    await memosPage.publishMemo();

    // 5. 验证内容发布成功
    await memosPage.waitForMemoToAppear('混合内容测试');

    // 6. 验证Markdown元素正确渲染
    const memoContent = memosPage.page.locator('[data-testid="memo-item"]').first().locator('.prose');

    // 验证标题
    await expect(memoContent.locator('h1')).toContainText('混合内容测试');
    await expect(memoContent.locator('h2')).toHaveCount(6); // 6个二级标题

    // 验证格式化文本
    await expect(memoContent.locator('strong')).toContainText('粗体文本');
    await expect(memoContent.locator('em')).toContainText('斜体文本');
    await expect(memoContent.locator('del')).toContainText('删除线文本');
    await expect(memoContent.locator('code')).toContainText('行内代码');

    // 验证代码块
    await expect(memoContent.locator('pre code')).toContainText('function testMixedContent');

    // 验证列表
    await expect(memoContent.locator('ol')).toBeVisible();
    await expect(memoContent.locator('ul')).toBeVisible();

    // 验证引用块
    await expect(memoContent.locator('blockquote')).toContainText('重要的引用块');

    // 验证链接
    await expect(memoContent.locator('a[href="https://example.com"]')).toContainText('测试链接');

    // 验证表格
    await expect(memoContent.locator('table')).toBeVisible();
    await expect(memoContent.locator('th')).toHaveCount(3);
    await expect(memoContent.locator('tr')).toHaveCount(5); // 包括表头

    // 7. 验证标签正确识别
    const tags = await memosPage.getMemoTags(0);
    expect(tags).toContain('混合内容');
    expect(tags).toContain('E2E测试');
    expect(tags).toContain('Playwright');
    expect(tags).toContain('自动化测试');

    // 8. 验证附件正确显示
    const hasPng = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    const hasJpg = await memosPage.verifyAttachmentExists(0, 'test-image.jpg');
    const hasGif = await memosPage.verifyAttachmentExists(0, 'test-image.gif');

    expect(hasPng).toBe(true);
    expect(hasJpg).toBe(true);
    expect(hasGif).toBe(true);

    // 9. 验证公开状态
    const isPublic = await memosPage.isMemoPublic(0);
    expect(isPublic).toBe(true);
  });

  test('应该能够处理大量内容的混合闪念', async () => {
    // 生成大量内容
    const largeContent = `# 大量内容测试 ${Date.now()}

${Array.from(
  { length: 10 },
  (_, i) => `
## 章节 ${i + 1}

这是第 ${i + 1} 个章节的内容，包含：

- **重点内容 ${i + 1}**
- *补充说明 ${i + 1}*
- \`代码示例${i + 1}\`

\`\`\`javascript
// 章节 ${i + 1} 的代码示例
function section${i + 1}() {
  return "这是第 ${i + 1} 个章节";
}
\`\`\`

> 第 ${i + 1} 章节的重要提示

#章节${i + 1} #大量内容 #性能测试
`
).join('\n')}

## 总结
这是一个包含大量内容的测试闪念，用于验证系统的性能和稳定性。

#大量内容 #性能测试 #E2E #综合测试`;

    // 1. 填写大量内容
    await memosPage.fillQuickEditor(largeContent);

    // 2. 上传附件
    await memosPage.uploadAttachment(TestFiles.pngImage);

    // 3. 发布
    await memosPage.publishMemo();

    // 4. 验证发布成功
    await memosPage.waitForMemoToAppear('大量内容测试');

    // 5. 验证内容正确显示
    const memoExists = await memosPage.verifyMemoExists('大量内容测试');
    expect(memoExists).toBe(true);

    // 6. 验证标签数量
    const tags = await memosPage.getMemoTags(0);
    expect(tags.length).toBeGreaterThan(10); // 应该有很多标签
  });

  test('应该能够处理特殊字符和多语言内容', async () => {
    const multiLanguageContent = `# 多语言测试 🌍

## 中文内容
这是中文内容，包含**粗体**和*斜体*。

## English Content
This is English content with **bold** and *italic* text.

## 日本語コンテンツ
これは日本語のコンテンツです。**太字**と*斜体*があります。

## Emoji 和特殊符号
- 🚀 火箭
- 💻 电脑
- 📝 笔记
- ✅ 完成
- ❌ 错误
- 🎉 庆祝

## 特殊字符
- & 符号
- < > 尖括号
- " ' 引号
- @ # $ % 符号

## 代码示例
\`\`\`python
# 多语言注释
def hello_world():
    print("Hello, 世界! こんにちは!")
    return "🌍"
\`\`\`

#多语言 #国际化 #特殊字符 #Emoji #测试`;

    // 1. 填写多语言内容
    await memosPage.fillQuickEditor(multiLanguageContent);

    // 2. 上传图片
    await memosPage.uploadAttachment(TestFiles.jpgImage);

    // 3. 发布
    await memosPage.publishMemo();

    // 4. 验证发布成功
    await memosPage.waitForMemoToAppear('多语言测试');

    // 5. 验证多语言内容正确显示
    const memoContent = memosPage.page.locator('[data-testid="memo-item"]').first().locator('.prose');

    await expect(memoContent).toContainText('这是中文内容');
    await expect(memoContent).toContainText('This is English content');
    await expect(memoContent).toContainText('これは日本語のコンテンツです');

    // 6. 验证Emoji正确显示
    await expect(memoContent).toContainText('🚀');
    await expect(memoContent).toContainText('💻');
    await expect(memoContent).toContainText('📝');

    // 7. 验证特殊字符正确处理
    await expect(memoContent).toContainText('& 符号');
    await expect(memoContent).toContainText('< > 尖括号');

    // 8. 验证标签正确识别
    const tags = await memosPage.getMemoTags(0);
    expect(tags).toContain('多语言');
    expect(tags).toContain('国际化');
    expect(tags).toContain('特殊字符');
  });

  test('应该保持内容完整性', async () => {
    const originalContent = TestData.mixedContent;

    // 1. 发布混合内容
    await memosPage.fillQuickEditor(originalContent);
    await memosPage.uploadAttachment(TestFiles.pngImage);
    await memosPage.publishMemo();

    // 2. 等待发布完成
    await memosPage.waitForMemoToAppear('混合内容测试');

    // 3. 刷新页面
    await memosPage.page.reload();
    await memosPage.waitForPageLoad();

    // 4. 验证内容完整性
    const memoExists = await memosPage.verifyMemoExists('混合内容测试');
    expect(memoExists).toBe(true);

    // 5. 验证附件完整性
    const hasAttachment = await memosPage.verifyAttachmentExists(0, 'test-image.png');
    expect(hasAttachment).toBe(true);

    // 6. 验证标签完整性
    const tags = await memosPage.getMemoTags(0);
    expect(tags.length).toBeGreaterThan(0);
  });
});
