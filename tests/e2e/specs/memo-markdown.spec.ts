import { type BrowserContext, expect, test } from '@playwright/test';
import { MemosPage } from '../utils/memos-page';
import { generateUniqueContent, setupAdminAuth, TestData } from '../utils/test-helpers';

test.describe('Markdown格式闪念测试', () => {
  let context: BrowserContext;
  let memosPage: MemosPage;

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

  test('应该正确解析和显示Markdown内容', async () => {
    // 1. 发布包含Markdown的闪念
    await memosPage.fillQuickEditor(TestData.markdownContent);
    await memosPage.publishMemo();

    // 2. 等待闪念出现
    await memosPage.waitForMemoToAppear('测试标题');

    // 3. 验证Markdown元素正确渲染
    const memoContent = memosPage.page.locator('[data-testid="memo-item"]').first().locator('.prose');

    // 验证标题
    await expect(memoContent.locator('h1')).toContainText('测试标题');
    await expect(memoContent.locator('h2')).toContainText('二级标题');
    await expect(memoContent.locator('h3')).toContainText('代码示例');

    // 验证格式化文本
    await expect(memoContent.locator('strong')).toContainText('粗体');
    await expect(memoContent.locator('em')).toContainText('斜体');

    // 验证列表
    await expect(memoContent.locator('ul li')).toHaveCount(3);

    // 验证代码块
    await expect(memoContent.locator('pre code')).toContainText('console.log');

    // 验证引用块
    await expect(memoContent.locator('blockquote')).toContainText('这是一个引用块');

    // 验证链接
    await expect(memoContent.locator('a[href="https://example.com"]')).toContainText('链接示例');

    // 验证表格
    await expect(memoContent.locator('table')).toBeVisible();
    await expect(memoContent.locator('th')).toHaveCount(2);
  });

  test('应该正确识别和显示标签', async () => {
    // 1. 发布包含标签的闪念
    await memosPage.fillQuickEditor(TestData.tagsContent);
    await memosPage.publishMemo();

    // 2. 等待闪念出现
    await memosPage.waitForMemoToAppear('测试标签功能');

    // 3. 验证标签正确显示
    const tags = await memosPage.getMemoTags(0);
    expect(tags).toContain('前端');
    expect(tags).toContain('测试');
    expect(tags).toContain('自动化');
    expect(tags).toContain('Playwright');
    expect(tags).toContain('E2E');
  });

  test('应该支持预览功能', async () => {
    // 1. 填写Markdown内容
    await memosPage.fillQuickEditor(TestData.markdownContent);

    // 2. 切换到预览模式
    await memosPage.togglePreview();

    // 3. 验证预览内容正确渲染
    const previewContainer = memosPage.page.locator('.prose');
    await expect(previewContainer.locator('h1')).toContainText('测试标题');
    await expect(previewContainer.locator('strong')).toContainText('粗体');
    await expect(previewContainer.locator('code')).toContainText('console.log');

    // 4. 切换回编辑模式
    await memosPage.togglePreview();

    // 5. 验证编辑器内容保持不变
    const editorContent = await memosPage.page.inputValue(
      '.milkdown-editor textarea, .milkdown-editor [contenteditable]'
    );
    expect(editorContent).toContain('测试标题');
  });

  test('应该处理复杂的Markdown语法', async () => {
    const complexMarkdown = `# 复杂Markdown测试

## 嵌套列表
1. 第一级
   - 第二级项目1
   - 第二级项目2
     - 第三级项目
2. 继续第一级

## 代码块与语法高亮
\`\`\`typescript
interface ComplexType {
  id: number;
  name: string;
  tags: string[];
}

const example: ComplexType = {
  id: 1,
  name: "测试",
  tags: ["#复杂", "#测试"]
};
\`\`\`

## 混合格式
这里有**粗体**、*斜体*、~~删除线~~和\`行内代码\`。

## 多级标签
#一级标签 #二级/子标签 #三级/子标签/孙标签

## 表格与链接
| 功能 | 链接 | 状态 |
|------|------|------|
| 文档 | [链接1](https://example.com) | ✅ |
| 测试 | [链接2](https://test.com) | 🔄 |

> **注意**: 这是一个包含多种Markdown元素的复杂示例。`;

    // 1. 发布复杂Markdown内容
    await memosPage.fillQuickEditor(complexMarkdown);
    await memosPage.publishMemo();

    // 2. 等待闪念出现
    await memosPage.waitForMemoToAppear('复杂Markdown测试');

    // 3. 验证复杂元素正确渲染
    const memoContent = memosPage.page.locator('[data-testid="memo-item"]').first().locator('.prose');

    // 验证嵌套列表
    await expect(memoContent.locator('ol li ul')).toBeVisible();

    // 验证代码块
    await expect(memoContent.locator('pre code')).toContainText('interface ComplexType');

    // 验证混合格式
    await expect(memoContent.locator('strong')).toContainText('粗体');
    await expect(memoContent.locator('em')).toContainText('斜体');
    await expect(memoContent.locator('del')).toContainText('删除线');
    await expect(memoContent.locator('code')).toContainText('行内代码');

    // 验证表格
    await expect(memoContent.locator('table tr')).toHaveCount(3); // 包括表头

    // 验证标签
    const tags = await memosPage.getMemoTags(0);
    expect(tags.length).toBeGreaterThan(0);
  });

  test('应该处理特殊字符和转义', async () => {
    const specialContent = `# 特殊字符测试

## HTML标签转义
这里包含 <script>alert('test')</script> 和 <img src="x" onerror="alert('xss')">

## 特殊符号
- & 符号
- < > 符号
- " ' 引号
- \`反引号\`

## 转义字符
\\* 不是斜体
\\# 不是标题
\\[不是链接\\](test)

#特殊字符 #HTML转义 #安全测试`;

    // 1. 发布包含特殊字符的内容
    await memosPage.fillQuickEditor(specialContent);
    await memosPage.publishMemo();

    // 2. 等待闪念出现
    await memosPage.waitForMemoToAppear('特殊字符测试');

    // 3. 验证特殊字符正确处理
    const memoContent = memosPage.page.locator('[data-testid="memo-item"]').first().locator('.prose');

    // 验证HTML标签被转义，不会执行
    const htmlContent = await memoContent.textContent();
    expect(htmlContent).toContain('<script>');
    expect(htmlContent).toContain('<img');

    // 验证转义字符正确显示
    expect(htmlContent).toContain('* 不是斜体');
    expect(htmlContent).toContain('# 不是标题');
  });

  test('应该支持空内容和边界情况', async () => {
    // 测试只有标签的内容
    const onlyTagsContent = '#标签1 #标签2 #标签3';

    await memosPage.fillQuickEditor(onlyTagsContent);
    await memosPage.publishMemo();

    await memosPage.waitForMemoToAppear('标签1');

    // 验证标签正确识别
    const tags = await memosPage.getMemoTags(0);
    expect(tags).toContain('标签1');
    expect(tags).toContain('标签2');
    expect(tags).toContain('标签3');
  });
});
