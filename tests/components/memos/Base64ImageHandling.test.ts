import { describe, expect, it } from 'bun:test';

/**
 * 测试Base64图片处理的专门测试套件
 * 这些测试验证了我们修复的Milkdown编辑器HTML转义问题
 */

// 模拟 SimpleMarkdownPreview 组件的内容处理逻辑
function processContent(content: string, removeTags: boolean = false): string {
  // 如果需要移除标签，则处理内容
  let processedContent = removeTags ? removeTagsFromContent(content) : content;

  // 处理Milkdown编辑器输出的HTML转义问题
  processedContent = processedContent
    .replace(/\\#/g, '#') // 反转义标题
    .replace(/!\\\[/g, '![') // 反转义图片开始
    .replace(/\\\]/g, ']') // 反转义右方括号
    .replace(/\\\(/g, '(') // 反转义左圆括号
    .replace(/\\`/g, '`') // 反转义代码
    .replace(/\\\*/g, '*') // 反转义粗体/斜体
    .replace(/\\\_/g, '_') // 反转义下划线
    .replace(/<br\s*\/?>/gi, '\n\n'); // 将HTML换行转换为markdown换行

  return processedContent;
}

// 移除标签的辅助函数
function removeTagsFromContent(content: string): string {
  return content.replace(/#[^\s#]+/g, '');
}

describe('Base64 Image Handling in Memos', () => {
  describe('Real-world Base64 image scenarios', () => {
    it('should handle 1x1 transparent PNG (common test image)', () => {
      const content =
        '!\[测试图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)';
      const result = processContent(content);

      expect(result).toBe(
        '![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)'
      );
    });

    it('should handle Base64 JPEG images', () => {
      const content =
        '!\[JPEG图片]\(data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R/Huf/Z)';
      const result = processContent(content);

      expect(result).toBe(
        '![JPEG图片](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R/Huf/Z)'
      );
    });

    it('should handle Base64 GIF images', () => {
      const content = '!\[GIF图片]\(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)';
      const result = processContent(content);

      expect(result).toBe('![GIF图片](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)');
    });

    it('should handle Base64 WebP images', () => {
      const content = '!\[WebP图片]\(data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA)';
      const result = processContent(content);

      expect(result).toBe(
        '![WebP图片](data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA)'
      );
    });

    it('should handle Base64 SVG images', () => {
      const content =
        '!\[SVG图片]\(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIzIiBmaWxsPSJyZWQiIC8+Cjwvc3ZnPgo=)';
      const result = processContent(content);

      expect(result).toBe(
        '![SVG图片](data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgc3Ryb2tlPSJibGFjayIgc3Ryb2tlLXdpZHRoPSIzIiBmaWxsPSJyZWQiIC8+Cjwvc3ZnPgo=)'
      );
    });
  });

  describe('Complex memo content with Base64 images', () => {
    it('should handle memo with title, text, and Base64 image', () => {
      const content = `\\# 测试Base64图片预览

<br />

这是一个包含Base64图片的测试闪念：

!\[测试图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

图片应该正常显示。`;

      const result = processContent(content);
      const expected = `# 测试Base64图片预览





这是一个包含Base64图片的测试闪念：

![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

图片应该正常显示。`;

      expect(result).toBe(expected);
    });

    it('should handle multiple Base64 images in one memo', () => {
      const content = `\\# 多图片测试

第一张图片：
!\[图片1]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

第二张图片：
!\[图片2]\(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)

结束。`;

      const result = processContent(content);
      const expected = `# 多图片测试

第一张图片：
![图片1](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

第二张图片：
![图片2](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)

结束。`;

      expect(result).toBe(expected);
    });

    it('should handle Base64 images with tags', () => {
      const content = `\\# 带标签的图片测试 #图片 #Base64

!\[测试图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

#测试 #E2E`;

      const resultWithTags = processContent(content, false);
      const resultWithoutTags = processContent(content, true);

      expect(resultWithTags).toBe(`# 带标签的图片测试 #图片 #Base64

![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

#测试 #E2E`);

      expect(resultWithoutTags).toBe(`# 带标签的图片测试  

![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

 `);
    });
  });

  describe('Edge cases and error scenarios', () => {
    it('should handle malformed Base64 images gracefully', () => {
      const content = '!\[坏图片]\(data:image/png;base64,这不是有效的base64)';
      const result = processContent(content);

      expect(result).toBe('![坏图片](data:image/png;base64,这不是有效的base64)');
    });

    it('should handle incomplete Base64 image syntax', () => {
      const content = '!\[不完整图片]\(data:image/png;base64,';
      const result = processContent(content);

      expect(result).toBe('![不完整图片](data:image/png;base64,');
    });

    it('should handle mixed escaped and normal images', () => {
      const content = `正常图片：![normal](https://example.com/image.jpg)
转义图片：!\[escaped]\(data:image/png;base64,abc123)`;

      const result = processContent(content);
      const expected = `正常图片：![normal](https://example.com/image.jpg)
转义图片：![escaped](data:image/png;base64,abc123)`;

      expect(result).toBe(expected);
    });

    it('should handle very long Base64 strings', () => {
      const longBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='.repeat(10);
      const content = `!\[长图片]\(data:image/png;base64,${longBase64})`;
      const result = processContent(content);

      expect(result).toBe(`![长图片](data:image/png;base64,${longBase64})`);
    });

    it('should handle Base64 images with special characters in alt text', () => {
      const content =
        '!\[特殊字符 & < > " \' 图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)';
      const result = processContent(content);

      expect(result).toBe(
        '![特殊字符 & < > " \' 图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)'
      );
    });
  });

  describe('Performance and validation', () => {
    it('should process content efficiently for large inputs', () => {
      const largeContent = `\\# 大内容测试

${'这是一行重复的内容。\n'.repeat(100)}

!\[大图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

${'更多重复内容。\n'.repeat(100)}`;

      const startTime = performance.now();
      const result = processContent(largeContent);
      const endTime = performance.now();

      // 处理时间应该在合理范围内（小于100ms）
      expect(endTime - startTime).toBeLessThan(100);

      // 验证内容正确处理
      expect(result).toContain('# 大内容测试');
      expect(result).toContain('![大图片](data:image/png;base64,');
    });

    it('should maintain content integrity after processing', () => {
      const originalContent = `\\# 完整性测试

这是 \\*\\*重要\\*\\* 的内容。

!\[关键图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

结束内容。`;

      const result = processContent(originalContent);

      // 验证所有重要元素都存在
      expect(result).toContain('# 完整性测试');
      expect(result).toContain('**重要**');
      expect(result).toContain('![关键图片](data:image/png;base64,');
      expect(result).toContain('结束内容。');

      // 验证没有意外的转义字符残留
      expect(result).not.toContain('\\#');
      expect(result).not.toContain('\\*\\*');
      expect(result).not.toContain('!\\[');
      expect(result).not.toContain('\\]\\(');
    });
  });
});
