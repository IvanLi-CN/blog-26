import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { lazyImagesRehypePlugin, readingTimeRemarkPlugin, responsiveTablesRehypePlugin } from './frontmatter';

/**
 * 解析 Markdown 内容为 HTML
 * 使用与 Astro 配置相同的插件来保持一致性
 */
export async function parseMarkdownToHTML(markdown: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(readingTimeRemarkPlugin)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(responsiveTablesRehypePlugin)
    .use(lazyImagesRehypePlugin)
    .use(rehypeKatex)
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const result = await processor.process(markdown);
  return String(result);
}

/**
 * 计算 Markdown 内容的阅读时间
 */
export function calculateReadingTime(markdown: string): number {
  // 简单的阅读时间计算：假设每分钟阅读 200 个单词
  const wordsPerMinute = 200;
  const words = markdown.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}
