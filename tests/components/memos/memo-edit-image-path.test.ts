import { describe, expect, it } from 'vitest';
import { parseMarkdownToHTML } from '~/utils/markdown';

// 辅助函数：从HTML中提取img标签的src属性
function extractImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src="([^"]+)"/);
  if (match) {
    // 解码HTML实体和URL编码
    let src = match[1]
      .replace(/&#x26;/g, '&')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');

    // 如果是 /api/render-image/ 路径，解码路径部分
    if (src.startsWith('/api/render-image/')) {
      const urlMatch = src.match(/^(\/api\/render-image\/)([^?]+)(\?.+)?$/);
      if (urlMatch) {
        const [, prefix, path, query] = urlMatch;
        const decodedPath = decodeURIComponent(path);
        src = prefix + decodedPath + (query || '');
      }
    }

    return src;
  }
  return null;
}

describe('Memo编辑器图片路径转换测试', () => {
  describe('编辑器上传的图片路径', () => {
    it('应该正确处理assets/目录下的图片', async () => {
      const markdown = '![测试图片](assets/1754495759130_image.png)';
      const html = await parseMarkdownToHTML(markdown, 'Memos/20250806_yPWtUnKt.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/1754495759130_image.png?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理内联图片路径', async () => {
      const markdown = '![image](assets/inline-1754495688640.png)';
      const html = await parseMarkdownToHTML(markdown, 'Memos/20250806_yPWtUnKt.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/inline-1754495688640.png?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理带时间戳的文件名', async () => {
      const markdown = '![测试](assets/1754493684240_Memo-图片1.png)';
      const html = await parseMarkdownToHTML(markdown, 'Memos/20250806_yPWtUnKt.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/1754493684240_Memo-图片1.png?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理包含特殊字符的文件名', async () => {
      const markdown = '![测试](assets/1754495473767_image_1.png)';
      const html = await parseMarkdownToHTML(markdown, 'Memos/20250806_yPWtUnKt.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/1754495473767_image_1.png?f=webp&q=85&s=1200&dpr=1');
    });
  });

  describe('验证实际的编辑器路径格式', () => {
    it('应该验证编辑器生成的路径格式是正确的', async () => {
      // 模拟编辑器生成的路径格式
      const timestamp = Date.now();
      const filename = `${timestamp}_test-image.png`;
      const editorPath = `assets/${filename}`;

      const markdown = `![测试图片](${editorPath})`;
      const html = await parseMarkdownToHTML(markdown, 'Memos/20250806_test.md');
      const src = extractImageSrc(html);

      // 验证路径转换是否正确
      expect(src).toBe(`/api/render-image/assets/${filename}?f=webp&q=85&s=1200&dpr=1`);
    });

    it('应该验证内联图片的路径格式', async () => {
      // 模拟内联图片的路径格式
      const timestamp = Date.now();
      const filename = `inline-${timestamp}.png`;
      const editorPath = `assets/${filename}`;

      const markdown = `![内联图片](${editorPath})`;
      const html = await parseMarkdownToHTML(markdown, 'Memos/20250806_test.md');
      const src = extractImageSrc(html);

      // 验证路径转换是否正确
      expect(src).toBe(`/api/render-image/assets/${filename}?f=webp&q=85&s=1200&dpr=1`);
    });
  });

  describe('对比快速发布编辑器的路径', () => {
    it('快速发布和编辑器应该使用相同的路径格式', async () => {
      // 快速发布编辑器使用的路径格式
      const quickPublishPath = 'assets/1754495473767_quick-publish.png';
      // 编辑器使用的路径格式
      const editorPath = 'assets/1754495473767_editor-upload.png';

      const quickPublishMarkdown = `![快速发布](${quickPublishPath})`;
      const editorMarkdown = `![编辑器](${editorPath})`;

      const quickPublishHtml = await parseMarkdownToHTML(quickPublishMarkdown, 'Memos/test.md');
      const editorHtml = await parseMarkdownToHTML(editorMarkdown, 'Memos/test.md');

      const quickPublishSrc = extractImageSrc(quickPublishHtml);
      const editorSrc = extractImageSrc(editorHtml);

      // 两者应该使用相同的URL格式（除了文件名）
      expect(quickPublishSrc?.split('/').slice(0, -1).join('/')).toBe(editorSrc?.split('/').slice(0, -1).join('/'));

      // 都应该包含相同的查询参数
      expect(quickPublishSrc).toContain('?f=webp&q=85&s=1200&dpr=1');
      expect(editorSrc).toContain('?f=webp&q=85&s=1200&dpr=1');
    });
  });
});
