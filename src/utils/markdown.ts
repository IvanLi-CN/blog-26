import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeMermaid from 'rehype-mermaid';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import {
  lazyImagesRehypePlugin,
  readingTimeRemarkPlugin,
  responsiveTablesRehypePlugin,
  webdavImagesRehypePlugin,
} from './frontmatter';

/**
 * 解析 Markdown 内容为 HTML
 * 使用与 Astro 配置相同的插件来保持一致性
 */
export async function parseMarkdownToHTML(markdown: string, articlePath?: string): Promise<string> {
  // 创建一个虚拟文件对象
  const vfile = {
    value: markdown,
    data: {} as any,
  };

  // 如果提供了文章路径，将其添加到文件数据中
  if (articlePath) {
    vfile.data.astro = {
      frontmatter: {
        id: articlePath,
      },
    };
  }

  const processor = unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkGfm)
    .use(readingTimeRemarkPlugin)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(responsiveTablesRehypePlugin)
    .use(lazyImagesRehypePlugin)
    .use(webdavImagesRehypePlugin)
    .use(rehypeKatex, {
      strict: 'ignore', // 忽略严格模式警告
      throwOnError: false, // 遇到错误时不抛出异常
    } as any)
    .use(rehypeMermaid, {
      strategy: 'img-svg',
      dark: true,
    })
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true });

  const result = await processor.process(vfile);
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
