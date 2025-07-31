import { type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * 测试辅助工具函数
 */

/**
 * 设置管理员认证
 */
export async function setupAdminAuth(context: BrowserContext) {
  try {
    // 尝试加载保存的认证状态
    const authFile = 'tests/e2e/setup/admin-auth.json';
    const authState = JSON.parse(readFileSync(authFile, 'utf-8'));
    await context.addCookies(authState.cookies);

    // 设置localStorage
    const page = await context.newPage();
    await page.goto('http://localhost:4321');

    for (const [origin, storage] of Object.entries(authState.origins)) {
      await page.evaluate(
        ({ origin, localStorage }) => {
          for (const [key, value] of Object.entries(localStorage)) {
            window.localStorage.setItem(key, value as string);
          }
        },
        { origin, localStorage: (storage as any).localStorage }
      );
    }

    await page.close();
  } catch (_error) {
    console.warn('无法加载保存的认证状态，使用ADMIN_MODE环境变量');
    // 依赖环境变量ADMIN_MODE=true
  }
}

/**
 * 生成测试数据
 */
export const TestData = {
  // 简单文本内容
  simpleText: '这是一个简单的测试闪念内容',

  // Markdown内容
  markdownContent: `# 测试标题

这是一个包含**粗体**和*斜体*的段落。

## 二级标题

- 列表项1
- 列表项2
- 列表项3

### 代码示例

\`\`\`javascript
console.log('Hello, World!');
\`\`\`

> 这是一个引用块

[链接示例](https://example.com)

#测试标签 #Markdown #E2E测试

| 表头1 | 表头2 |
|-------|-------|
| 内容1 | 内容2 |`,

  // 混合内容
  mixedContent: `# 混合内容测试

这是一个包含多种元素的测试内容：

## 文本格式
- **粗体文本**
- *斜体文本*
- ~~删除线~~

## 代码块
\`\`\`typescript
interface TestData {
  id: string;
  content: string;
}
\`\`\`

## 标签
#混合内容 #测试 #E2E #Playwright

> 这个闪念包含了文本、代码、标签等多种元素`,

  // 编辑测试内容
  editedContent: '这是编辑后的内容 - 已更新',

  // 标签测试
  tagsContent: '测试标签功能 #前端 #测试 #自动化 #Playwright #E2E',
};

/**
 * 测试文件路径
 */
export const TestFiles = {
  // 测试图片
  pngImage: path.resolve('tests/e2e/test-data/images/test-image.png'),
  jpgImage: path.resolve('tests/e2e/test-data/images/test-image.jpg'),
  gifImage: path.resolve('tests/e2e/test-data/images/test-image.gif'),

  // 测试文档
  markdownFile: path.resolve('tests/e2e/test-data/content/test-memo.md'),
};

/**
 * 等待网络请求完成
 */
export async function waitForNetworkIdle(page: Page, timeout = 5000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * 等待特定API请求完成
 */
export async function waitForAPIResponse(page: Page, apiPath: string, timeout = 10000) {
  return await page.waitForResponse((response) => response.url().includes(apiPath) && response.status() === 200, {
    timeout,
  });
}

/**
 * 验证WebDAV文件存在
 */
export async function verifyWebDAVFile(filePath: string): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:8080${filePath}`, {
      method: 'HEAD',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 获取WebDAV文件内容
 */
export async function getWebDAVFileContent(filePath: string): Promise<string> {
  try {
    const response = await fetch(`http://localhost:8080${filePath}`);
    if (response.ok) {
      return await response.text();
    }
    throw new Error(`Failed to fetch file: ${response.status}`);
  } catch (error) {
    throw new Error(`Failed to get WebDAV file content: ${error}`);
  }
}

/**
 * 创建测试图片文件
 */
export async function createTestImage(filePath: string, width = 100, height = 100) {
  // 创建一个简单的PNG图片数据
  const canvas = {
    width,
    height,
    getContext: () => ({
      fillStyle: '#ff0000',
      fillRect: () => {},
    }),
    toDataURL: () =>
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  };

  // 这里应该使用实际的图片生成库，但为了简化，我们使用预定义的base64数据
  const base64Data = canvas.toDataURL().split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');

  const fs = await import('fs/promises');
  await fs.writeFile(filePath, buffer);
}

/**
 * 清理测试文件
 */
export async function cleanupTestFiles() {
  const fs = await import('fs/promises');

  try {
    // 清理上传的测试文件
    await fs.rmdir('test-data/webdav/assets/tmp', { recursive: true });
  } catch {
    // 忽略错误
  }
}

/**
 * 生成唯一的测试内容
 */
export function generateUniqueContent(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix} - ${timestamp} - ${random}`;
}

/**
 * 等待元素文本包含特定内容
 */
export async function waitForTextContent(page: Page, selector: string, expectedText: string, timeout = 5000) {
  await page.waitForFunction(
    ({ selector, text }) => {
      const element = document.querySelector(selector);
      return element?.textContent?.includes(text) || false;
    },
    { selector, text: expectedText },
    { timeout }
  );
}

/**
 * 模拟粘贴操作
 */
export async function simulatePaste(page: Page, content: string) {
  await page.evaluate((text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);

    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData,
      bubbles: true,
      cancelable: true,
    });

    document.activeElement?.dispatchEvent(pasteEvent);
  }, content);
}

/**
 * 检查控制台错误
 */
export function setupConsoleErrorTracking(page: Page): string[] {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  return errors;
}
