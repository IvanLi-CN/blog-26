import { describe, expect, it } from 'vitest';
import { parseMarkdownToHTML } from '~/utils/markdown';

// 辅助函数：处理markdown并返回HTML
async function processMarkdown(markdown: string, articlePath?: string): Promise<string> {
  return await parseMarkdownToHTML(markdown, articlePath);
}

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

describe('图片路径解析测试', () => {
  describe('基本路径处理', () => {
    it('应该正确处理简单的相对路径', async () => {
      const markdown = '![测试图片](./assets/test.jpg)';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/articles/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理包含空格的文件名', async () => {
      const markdown = '![测试图片](./assets/test image.jpg)';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/articles/assets/test image.jpg?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理包含特殊字符的文件名', async () => {
      const markdown = '![TPS560430XDBVR](./assets/TPS560430XDBVR 7V-36V to 5.00V @ 0.5A.svg)';
      const html = await processMarkdown(markdown, 'articles/electronics.md');
      const src = extractImageSrc(html);

      expect(src).toBe(
        '/api/render-image/articles/assets/TPS560430XDBVR 7V-36V to 5.00V @ 0.5A.svg?f=webp&q=85&s=1200&dpr=1'
      );
    });

    it('应该正确处理包含中文的文件名', async () => {
      const markdown = '![测试](./assets/测试图片 - 副本.png)';
      const html = await processMarkdown(markdown, 'articles/test.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/articles/assets/测试图片 - 副本.png?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理包含括号的文件名', async () => {
      const markdown = '![测试](./assets/image(1).jpg)';
      const html = await processMarkdown(markdown, 'articles/test.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/articles/assets/image(1).jpg?f=webp&q=85&s=1200&dpr=1');
    });
  });

  describe('不同路径前缀处理', () => {
    it('应该正确处理~/assets/路径', async () => {
      const markdown = '![测试图片](~/assets/test.jpg)';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理../路径', async () => {
      const markdown = '![测试图片](../assets/test.jpg)';
      const html = await processMarkdown(markdown, 'articles/subdir/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/articles/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理绝对路径', async () => {
      const markdown = '![测试图片](/assets/test.jpg)';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });
  });

  describe('Memos特殊处理', () => {
    it('应该正确处理Memos目录下的相对路径', async () => {
      const markdown = '![测试图片](test.jpg)';
      const html = await processMarkdown(markdown, 'Memos/20241201_test.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理Memos目录下的assets路径', async () => {
      const markdown = '![测试图片](assets/test.jpg)';
      const html = await processMarkdown(markdown, 'Memos/20241201_test.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });
  });

  describe('跳过处理的情况', () => {
    it('应该跳过HTTP URL', async () => {
      const markdown = '![测试图片](https://example.com/test.jpg)';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe('https://example.com/test.jpg');
    });

    it('应该跳过base64图片', async () => {
      const markdown =
        '![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      );
    });

    it('应该跳过已经处理过的图片端点', async () => {
      const markdown = '![测试图片](/api/render-image/assets/test.jpg?f=webp&q=85)';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/test.jpg?f=webp&q=85');
    });
  });

  describe('链接中的图片处理', () => {
    it('应该正确处理a标签中的图片链接', async () => {
      const markdown = '[查看图片](./assets/test.jpg)';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const match = html.match(/<a[^>]+href="([^"]+)"/);
      const href = match
        ? match[1]
            .replace(/&#x26;/g, '&')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
        : null;

      expect(href).toBe('/api/render-image/articles/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理包含特殊字符的图片链接', async () => {
      const markdown = '[查看图片](./assets/TPS560430XDBVR 7V-36V to 5.00V @ 0.5A.svg)';
      const html = await processMarkdown(markdown, 'articles/electronics.md');
      const match = html.match(/<a[^>]+href="([^"]+)"/);
      let href = match
        ? match[1]
            .replace(/&#x26;/g, '&')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
        : null;

      // 如果是 /api/render-image/ 路径，解码路径部分
      if (href && href.startsWith('/api/render-image/')) {
        const urlMatch = href.match(/^(\/api\/render-image\/)([^?]+)(\?.+)?$/);
        if (urlMatch) {
          const [, prefix, path, query] = urlMatch;
          const decodedPath = decodeURIComponent(path);
          href = prefix + decodedPath + (query || '');
        }
      }

      expect(href).toBe(
        '/api/render-image/articles/assets/TPS560430XDBVR 7V-36V to 5.00V @ 0.5A.svg?f=webp&q=85&s=1200&dpr=1'
      );
    });
  });

  describe('边界情况', () => {
    it('应该正确处理没有文章路径的情况', async () => {
      const markdown = '![测试图片](./assets/test.jpg)';
      const html = await processMarkdown(markdown);
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });

    it('应该正确处理空的图片路径', async () => {
      const markdown = '![测试图片]()';
      const html = await processMarkdown(markdown, 'articles/test-article.md');
      const src = extractImageSrc(html);

      // 空路径的图片不会被解析为img标签，所以返回null是正确的
      expect(src).toBe(null);
    });

    it('应该正确处理多级上级目录', async () => {
      const markdown = '![测试图片](../../assets/test.jpg)';
      const html = await processMarkdown(markdown, 'articles/subdir1/subdir2/test-article.md');
      const src = extractImageSrc(html);

      expect(src).toBe('/api/render-image/articles/assets/test.jpg?f=webp&q=85&s=1200&dpr=1');
    });
  });
});
