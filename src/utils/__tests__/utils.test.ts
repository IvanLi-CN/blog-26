import { describe, expect, it } from 'bun:test';
import { parseTagsFromContent, removeTagsFromContent } from '../utils';

describe('parseTagsFromContent', () => {
  it('应该正确解析普通标签', () => {
    const content = '这是一个测试 #技术 和 #前端开发 的内容';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(2);
    expect(tags[0].content).toBe('技术');
    expect(tags[0].fullMatch).toBe('#技术');
    expect(tags[1].content).toBe('前端开发');
    expect(tags[1].fullMatch).toBe('#前端开发');
  });

  it('应该正确解析英文标签', () => {
    const content = 'This is a test with #javascript and #react tags';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(2);
    expect(tags[0].content).toBe('javascript');
    expect(tags[1].content).toBe('react');
  });

  it('应该正确解析包含连字符和下划线的标签', () => {
    const content = '测试 #front-end 和 #back_end 标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(2);
    expect(tags[0].content).toBe('front-end');
    expect(tags[1].content).toBe('back_end');
  });

  it('应该正确解析包含斜杠的标签', () => {
    const content = '测试 #web/frontend 和 #mobile/ios 标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(2);
    expect(tags[0].content).toBe('web/frontend');
    expect(tags[1].content).toBe('mobile/ios');
  });

  it('应该忽略URL中的hash部分 - http协议', () => {
    const content = '访问这个链接 http://example.com#section 和标签 #真正的标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('真正的标签');
  });

  it('应该忽略URL中的hash部分 - https协议', () => {
    const content = '访问这个链接 https://example.com#section 和标签 #真正的标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('真正的标签');
  });

  it('应该忽略尖括号包围的URL中的hash部分', () => {
    const content = '链接：<https://docs.tavily.com/documentation/mcp#connect-to-cursor> 和标签 #真正的标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('真正的标签');
  });

  it('应该忽略Markdown链接中的hash部分', () => {
    const content = '查看[文档](https://example.com#section)和标签 #真正的标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('真正的标签');
  });

  it('应该忽略www开头的URL中的hash部分', () => {
    const content = '访问 www.example.com#section 和标签 #真正的标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('真正的标签');
  });

  it('应该忽略域名格式URL中的hash部分', () => {
    const content = '访问 example.com#section 和标签 #真正的标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('真正的标签');
  });

  it('应该处理复杂的混合内容', () => {
    const content = `
# 标题

这是一个包含多种内容的测试：

1. 普通标签：#技术 #前端
2. URL链接：https://github.com/user/repo#readme
3. Markdown链接：[链接](https://example.com#section)
4. 尖括号URL：<https://docs.example.com#api>
5. 更多标签：#javascript #react

访问 www.example.com#hash 了解更多。
`;

    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(4);
    expect(tags.map((tag) => tag.content)).toEqual(['技术', '前端', 'javascript', 'react']);
  });

  it('应该正确处理行首的标签', () => {
    const content = '#开头标签\n文本内容 #中间标签\n#另一个开头标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(3);
    expect(tags.map((tag) => tag.content)).toEqual(['开头标签', '中间标签', '另一个开头标签']);
  });

  it('应该忽略空标签', () => {
    const content = '测试 # 空标签和 #正常标签';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(1);
    expect(tags[0].content).toBe('正常标签');
  });

  it('应该保持标签出现的顺序', () => {
    const content = '#第三个 一些文本 #第一个 更多文本 #第二个';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(3);
    expect(tags.map((tag) => tag.content)).toEqual(['第三个', '第一个', '第二个']);
  });

  it('应该正确处理特殊情况 - 实际的connect-to-cursor URL', () => {
    const content = '* \\`tavily-search\\`：<https://docs.tavily.com/documentation/mcp#connect-to-cursor>';
    const tags = parseTagsFromContent(content);

    expect(tags).toHaveLength(0);
  });
});

describe('removeTagsFromContent', () => {
  it('应该正确移除标签但保留URL中的hash', () => {
    const content = '访问 https://example.com#section 和标签 #真正的标签';
    const result = removeTagsFromContent(content);

    expect(result).toBe('访问 https://example.com#section 和标签 ');
  });

  it('应该正确移除多个标签', () => {
    const content = '这是 #标签1 和 #标签2 的测试';
    const result = removeTagsFromContent(content);

    expect(result).toBe('这是  和  的测试');
  });

  it('应该保留URL中的hash不被移除', () => {
    const content = `
访问链接：
- https://github.com/user/repo#readme
- <https://docs.example.com#api>
- [文档](https://example.com#section)

标签：#技术 #前端
`;

    const result = removeTagsFromContent(content);

    expect(result).toContain('https://github.com/user/repo#readme');
    expect(result).toContain('<https://docs.example.com#api>');
    expect(result).toContain('[文档](https://example.com#section)');
    expect(result).not.toContain('#技术');
    expect(result).not.toContain('#前端');
  });
});
