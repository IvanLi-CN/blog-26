import { describe, expect, it, mock } from 'bun:test';
import React from 'react';

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

describe('SimpleMarkdownPreview Content Processing', () => {
  describe('Milkdown HTML escape handling', () => {
    it('should unescape markdown headers', () => {
      const content = '\\# 测试标题\n\n这是内容';
      const result = processContent(content);

      expect(result).toBe('# 测试标题\n\n这是内容');
    });

    it('should unescape markdown images', () => {
      const content =
        '!\[测试图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)';
      const result = processContent(content);

      expect(result).toBe(
        '![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)'
      );
    });

    it('should unescape markdown code blocks', () => {
      const content = '\\`console.log("hello")\\`';
      const result = processContent(content);

      expect(result).toBe('`console.log("hello")`');
    });

    it('should unescape markdown bold and italic', () => {
      const content = '\\*\\*粗体\\*\\* 和 \\_斜体\\_';
      const result = processContent(content);

      expect(result).toBe('**粗体** 和 _斜体_');
    });

    it('should convert HTML line breaks to markdown line breaks', () => {
      const content = '第一行<br />第二行<br/>第三行<BR>第四行';
      const result = processContent(content);

      expect(result).toBe('第一行\n\n第二行\n\n第三行\n\n第四行');
    });

    it('should handle complex escaped content with Base64 images', () => {
      const content = `\\# 测试Base64图片预览

<br />

!\[测试图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

这是一个1x1像素的透明图片。`;

      const result = processContent(content);
      const expectedContent = `# 测试Base64图片预览





![测试图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)

这是一个1x1像素的透明图片。`;

      expect(result).toBe(expectedContent);
    });
  });

  describe('Tag removal functionality', () => {
    it('should remove tags when removeTags is true', () => {
      const content = '这是内容 #标签1 #标签2 更多内容';
      const result = processContent(content, true);

      expect(result).toBe('这是内容   更多内容');
    });

    it('should keep tags when removeTags is false', () => {
      const content = '这是内容 #标签1 #标签2 更多内容';
      const result = processContent(content, false);

      expect(result).toBe('这是内容 #标签1 #标签2 更多内容');
    });

    it('should keep tags when removeTags is not specified (default)', () => {
      const content = '这是内容 #标签1 #标签2 更多内容';
      const result = processContent(content);

      expect(result).toBe('这是内容 #标签1 #标签2 更多内容');
    });
  });

  describe('Normal markdown content', () => {
    it('should handle normal markdown content without escaping', () => {
      const content = `# 正常标题

这是正常的markdown内容。

![正常图片](https://example.com/image.jpg)

**粗体** 和 *斜体* 文本。`;

      const result = processContent(content);
      expect(result).toBe(content);
    });

    it('should handle empty content', () => {
      const result = processContent('');
      expect(result).toBe('');
    });

    it('should handle content with only whitespace', () => {
      const content = '   \n\n   \t   ';
      const result = processContent(content);
      expect(result).toBe(content);
    });
  });

  describe('Edge cases', () => {
    it('should handle mixed escaped and normal content', () => {
      const content = `# 正常标题
\\# 转义标题
![正常图片](https://example.com/image.jpg)
!\[转义图片]\(data:image/png;base64,abc123)`;

      const result = processContent(content);
      const expectedContent = `# 正常标题
# 转义标题
![正常图片](https://example.com/image.jpg)
![转义图片](data:image/png;base64,abc123)`;

      expect(result).toBe(expectedContent);
    });

    it('should handle multiple consecutive escapes', () => {
      const content = '\\\\# 双重转义标题';
      const result = processContent(content);

      expect(result).toBe('\\# 双重转义标题');
    });

    it('should handle content with both tags and escapes', () => {
      const content = '\\# 转义标题 #标签1 !\[图片]\(data:image/png;base64,abc) #标签2';
      const result = processContent(content, true);

      expect(result).toBe('# 转义标题  ![图片](data:image/png;base64,abc) ');
    });

    it('should handle Base64 images with various formats', () => {
      const testCases = [
        {
          input: '!\[JPEG图片]\(data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD)',
          expected: '![JPEG图片](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD)',
        },
        {
          input:
            '!\[PNG图片]\(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)',
          expected:
            '![PNG图片](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==)',
        },
        {
          input: '!\[GIF图片]\(data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)',
          expected: '![GIF图片](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = processContent(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle complex content with multiple escape types', () => {
      const content =
        '\\# 标题\n\\*\\*粗体\\*\\* 和 \\_斜体\\_\n\\`代码\\`\n!\[图片]\(data:image/png;base64,abc123)\n<br />\n#标签1 #标签2';

      const result = processContent(content, true);
      const expected = '# 标题\n**粗体** 和 _斜体_\n`代码`\n![图片](data:image/png;base64,abc123)\n\n\n\n ';

      expect(result).toBe(expected);
    });
  });
});
